import assert from 'node:assert/strict';
import {emptyState} from '../src/lib/portfolio';
import {positionsAt,historicalValue,actualCacheKey,attachRecordedValues} from '../src/server/actual-history';
import {makeAudit} from '../src/server/history';
import type {Position} from '../src/types/portfolio';
const initial=emptyState();initial.accounts=[{id:'a',name:'test',note:''}];
const stock:Position={id:'stock',symbol:'TEST',name:'test',category:'美股',accountId:'a',currency:'USD',quantity:10,price:999,previousClose:999,averageCost:1,provider:'auto',quoteAt:null,quoteSource:'',quoteError:null};
const cash:Position={...stock,id:'cash',symbol:'USD',category:'现金',quantity:1000};initial.positions=[stock,cash];
const after=structuredClone(initial);after.positions[0].quantity=15;after.positions[1].quantity=490;
const mutation={action:'trade' as const,positionId:'stock',type:'买入' as const,quantity:5,price:100,fee:10,settleCash:true,timestamp:'2026-10-02T10:00:00+08:00'};
after.ledger=[{id:'t',timestamp:mutation.timestamp,type:'买入',symbol:'TEST',accountName:'test',quantity:5,price:100,currency:'USD',fee:10,realizedPnl:0,note:'已同步账户现金'}];
const audit=makeAudit(initial,after,mutation)!;audit.timestamp='2026-10-10T00:00:00+08:00';
const before=positionsAt(after.positions,[audit],Date.parse('2026-10-01T00:00:00+08:00'));
assert.equal(before.find(p=>p.id==='stock')?.quantity,10);assert.equal(before.find(p=>p.id==='cash')?.quantity,1000);
assert.equal(positionsAt(after.positions,[audit],Date.parse('2026-10-03T00:00:00+08:00')).find(p=>p.id==='stock')?.quantity,15,'use execution time, not recording time');
const time=Date.parse('2026-10-01T00:00:00+08:00');
const series=new Map([['stock',{points:[{time:time-1000,price:100},{time:time+1000,price:500}],currency:'USD' as const,source:'fixture'}]]);
assert.equal(historicalValue(before,series,{CNY:1,USD:6,HKD:.8},time),12000,'historical quantities, cash and FX; no current price or future price');
assert.throws(()=>historicalValue(before,new Map(),{CNY:1,USD:6,HKD:.8},time));
assert.throws(()=>positionsAt(after.positions,[{...audit,before:null,after:null,legacy:true}],time));
const noCash={...audit,before:{positions:[stock],accounts:[]},after:{positions:[after.positions[0]],accounts:[]}};
assert.throws(()=>positionsAt(after.positions,[noCash],time),'missing cash settlement must fail closed');
assert.equal(after.positions[0].quantity,15,'reconstruction must not mutate the current account');
console.log('Actual-history checks passed: execution dates, historical holdings/cash/FX, future-price exclusion, missing-data rejection and immutability.');

// Market refreshes must reuse historical work, while ownership changes invalidate it.
const key=actualCacheKey(initial,[],'1M','owner-a',time);
const refreshed=structuredClone(initial);refreshed.positions[0].price=5000;
refreshed.snapshots.push({id:'new',timestamp:new Date(time).toISOString(),valueCny:4321,categories:{'现金':4321,'美股':0,'加密货币':0,'A股 / ETF':0},reason:'行情更新'});
// The first observation is a baseline input; appending subsequent points is not.
initial.snapshots=[refreshed.snapshots[0]];
const stable=actualCacheKey(initial,[],'1M','owner-a',time);
refreshed.snapshots.push({...refreshed.snapshots[0],id:'next',timestamp:new Date(time+1000).toISOString(),valueCny:4444});
assert.equal(actualCacheKey(refreshed,[],'1M','owner-a',time),stable);
refreshed.positions[0].quantity+=1;
assert.notEqual(actualCacheKey(refreshed,[],'1M','owner-a',time),stable);
assert.notEqual(actualCacheKey(initial,[],'1M','owner-b',time),stable);
const merged=attachRecordedValues({points:[],warnings:[],sources:[],range:'1M',availableFrom:null},refreshed,time,time+2000);
assert.equal(merged.points.at(-1)?.valueCny,4444);
console.log('Historical cache invalidation and latest-observation merge checks passed.');

// Drawing must remain connected across weekends and after long-range downsampling.
import {chartSegments} from '../src/lib/chart';
import {retainVerifiedHistory} from '../src/server/actual-history';
const daily=Array.from({length:1800},(_,i)=>({timestamp:new Date(time+i*86400000).toISOString(),valueCny:100+i}));
const sampled=chartSegments(daily);
assert.equal(sampled.segments.length,1,'sampling must not turn multi-day distances into missing data');
assert.equal(sampled.bridges.length,0);
assert.equal(sampled.sampled.at(-1),daily.at(-1));
const sparse=[daily[0],daily[4],daily[10]];
assert.equal(chartSegments(sparse).segments.length,1,'elapsed time alone does not establish missing data');
const missing=chartSegments(sparse,[daily[2].timestamp]);
assert.equal(missing.segments.length,2);
assert.equal(missing.bridges.length,1,'missing data has a visible but distinct endpoint bridge');
assert.deepEqual(missing.sampled,sparse,'bridges must not manufacture intermediate observations');
assert.equal(chartSegments(sparse,[daily[4].timestamp]).segments.length,1,'a real recorded value resolves that gap');
const base={points:[daily[0],daily[1]],warnings:[],sources:[],range:'1M',availableFrom:daily[0].timestamp};
const retained=retainVerifiedHistory(base,{...base,points:[{...daily[1],valueCny:999},daily[3]],gapTimestamps:[daily[0].timestamp,daily[2].timestamp],warnings:['unavailable']});
assert.deepEqual(retained.points,[daily[0],{...daily[1],valueCny:999},daily[3]],'refreshes preserve verified history and prefer new corrections');
assert.deepEqual(retained.gapTimestamps,[daily[2].timestamp]);
assert.equal(actualCacheKey(initial,[],'1M','owner-a',time+86400000),stable,'midnight must not discard the prior verified cache');
const bounded=attachRecordedValues(retained,emptyState(),time+86400000,time+3*86400000);
assert.equal(bounded.points.length,2,'rolling range filters retained observations');
assert.equal(bounded.points[0].valueCny,999);
console.log('Chart continuity checks passed: long-range sampling, sparse real observations, explicit gaps, no invented values, retained cache and rolling ranges.');

async function cacheFailureChecks(){
 const {mkdtempSync,rmSync}=await import('node:fs');
 const {tmpdir}=await import('node:os');
 const {join}=await import('node:path');
 const {saveDataCache,savePriceCache}=await import('../src/server/storage');
 const {actualPortfolio}=await import('../src/server/actual-history');
 const {boundarySeries}=await import('../src/server/daily-pnl');
 const {chinaDayStart}=await import('../src/lib/pnl');
 const dir=mkdtempSync(join(tmpdir(),'chart-resilience-'));
 process.env.PORTFOLIO_DATA_DIR=dir;
 const originalFetch=globalThis.fetch,originalNow=Date.now,now=originalNow(),day=86400000;
 try{
  const state=emptyState();state.accounts=initial.accounts;state.positions=[{...cash,quantity:100}];
  const start=chinaDayStart(now)-2*day;
  state.snapshots=[{id:'observed',timestamp:new Date(start).toISOString(),valueCny:700,categories:{'现金':700,'美股':0,'加密货币':0,'A股 / ETF':0},reason:'行情更新'}];
  Date.now=()=>now-2*day;
  await saveDataCache('actual-fx-v2:USD:CNY:HKD',[{time:start-day,rates:{CNY:1,USD:7,HKD:.9}}]);
  const priceKey=`pnl-ohlc-v2:TEST:30m:${chinaDayStart(start-14*day)}`;
  await savePriceCache(priceKey,{points:[{time:start-day,price:50},{time:start,price:60}],currency:'USD',source:'verified cache'});
  Date.now=originalNow;
  let requests=0;globalThis.fetch=async()=>{requests++;throw new Error('offline fixture')};
  const values=await actualPortfolio(state,'1M',undefined,now);
  assert.equal(requests,1,'expired FX cache must attempt an update');
  assert.equal(values.gapTimestamps?.length,0,'FX outage must reuse valid historical rates');
  assert.ok(values.points.length>=3);
  assert.ok(values.points.every(p=>p.valueCny===700));
  globalThis.fetch=async()=>Response.json({chart:{result:[{meta:{currency:'USD'},timestamp:[Math.floor((now-3600000)/1000)],indicators:{quote:[{open:[80],close:[90]}]}}]}});
  const prices=await boundarySeries(stock,start,now);
  assert.equal(prices.points[0].price,50,'shorter successful response must retain verified older prices');
  assert.equal(prices.points.at(-1)?.price,90);
  console.log('Outage checks passed: expired historical FX fallback and shorter price response retain real observations.');
 }finally{Date.now=originalNow;globalThis.fetch=originalFetch;rmSync(dir,{recursive:true,force:true})}
}
cacheFailureChecks().catch(error=>{console.error(error);process.exitCode=1});

import {chartRangeStart} from '../src/lib/chart';
assert.equal(chartRangeStart('1W',Date.parse('2026-11-07T12:00:00+08:00')),Date.parse('2026-10-31T00:00:00+08:00'));
assert.equal(chartRangeStart('ALL',Date.now()),0);
