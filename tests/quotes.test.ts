import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyState} from '../src/lib/portfolio';
import {readState,saveState} from '../src/server/store';
import {refresh} from '../src/server/quotes';
const dir=mkdtempSync(join(tmpdir(),'portfolio-quotes-'));process.env.PORTFOLIO_DATA_DIR=dir;
const original=globalThis.fetch;
async function main(){
 const s=emptyState();s.accounts=[{id:'test',name:'test',note:''}];
 s.positions=['USD','CNY'].map((currency,i)=>({id:'btc'+i,symbol:'BTC',name:'Bitcoin',category:'加密货币',accountId:'test',currency,quantity:1,price:1,previousClose:1,averageCost:1,provider:'auto',quoteAt:null,quoteSource:'',quoteError:null})) as typeof s.positions;
 s.settings.rates={CNY:1,USD:7,HKD:.9};saveState(s,readState().revision);
 let coinbaseCalls=0,aborted=false;
 globalThis.fetch=(async(input,init)=>{
  const url=String(input);
  if(url.includes('coinlore'))return new Promise((_resolve,reject)=>{const signal=init?.signal;signal?.addEventListener('abort',()=>{aborted=true;reject(new Error('aborted'))},{once:true})});
  if(url.includes('coinbase')){coinbaseCalls++;return Response.json({last:'100',open:'80'})}
  if(url.includes('kraken'))return Response.json({error:['unavailable']});
  if(url.includes('frankfurter'))return Response.json([{quote:'CNY',rate:7,date:'2026-11-06'},{quote:'HKD',rate:7.8,date:'2026-11-06'}]);
  throw new Error('Unexpected request');
 }) as typeof fetch;
 const start=Date.now();const [a,b]=await Promise.all([refresh(),refresh()]);
 assert.ok(Date.now()-start<1500,'a stalled primary must not delay the successful backup');
 assert.equal(coinbaseCalls,1,'duplicate assets and concurrent refreshes must share work');
 assert.ok(aborted,'losing requests are cancelled');assert.deepEqual(a,b);
 assert.equal(a.positions[0].price,100);assert.equal(a.positions[1].price,700);
 assert.match(a.positions[1].quoteSource,/Coinbase/);assert.equal(a.positions[0].quoteError,null);
 assert.deepEqual(readState().positions,a.positions);
 // Entering the page must bypass both the 30-second refresh throttle and
 // in-memory/provider caches, while simultaneous entries still share work.
 saveState(s,readState('entry').revision,false,undefined,[],'entry');
 let livePrice='200',pages=0,expectFresh=false,backupCalls=0;
 globalThis.fetch=(async(input,init)=>{
  if(expectFresh){assert.equal(init?.cache,'no-store');assert.equal((init as {next?:unknown})?.next,undefined)}
  const url=String(input);
  if(url.includes('coinlore')){pages++;assert.ok(url.includes('/ticker/?id=90'),'Known assets use a deduplicated batch, not the top-100 list');return Response.json([{id:'90',symbol:'BTC',name:'Bitcoin',nameid:'bitcoin',price_usd:livePrice,percent_change_24h:'1'}],{headers:{Date:new Date().toUTCString()}})}
  if(url.includes('frankfurter'))return Response.json([{quote:'CNY',rate:7,date:'2026-11-06'},{quote:'HKD',rate:7.8,date:'2026-11-06'}]);
  backupCalls++;return Response.json({error:'unavailable'},{status:503});
 }) as typeof fetch;
 assert.equal((await refresh('entry')).positions[0].price,200);
 livePrice='300';assert.equal((await refresh('entry')).positions[0].price,200,'Background refresh still respects throttle');
 expectFresh=true;const before=pages;
 const entries=await Promise.all([refresh('entry',true),refresh('entry',true)]);
 assert.equal(entries[0].positions[0].price,300);assert.deepEqual(entries[0],entries[1]);
 assert.equal(pages,before+1,'Fresh concurrent entries share one uncached quote request');
 assert.equal(backupCalls,0,'Fast primary responses must not start per-asset backups');
 // A separate owner avoids the successful-refresh throttle and tests total failure.
 saveState(s,readState('offline').revision,false,undefined,[],'offline');
 globalThis.fetch=(async()=>{throw new Error('offline')}) as typeof fetch;
 const failed=await refresh('offline',true);
 assert.equal(failed.positions[0].price,1);assert.ok(failed.positions[0].quoteError);
 // Retry must not be stuck returning the failed attempt within the throttle.
 globalThis.fetch=(async input=>String(input).includes('coinbase')?Response.json({last:'400',open:'380'}):Response.json({}, {status:503})) as typeof fetch;
 const recovered=await refresh('offline',true);
 assert.equal(recovered.positions[0].price,400);assert.equal(recovered.positions[0].quoteError,null);
 // A stale batched response must fail closed, not relabel old prices as fresh.
 saveState(s,readState('stale_batch').revision,false,undefined,[],'stale_batch');
 globalThis.fetch=(async input=>String(input).includes('/ticker/?id=')?Response.json([{id:'90',symbol:'BTC',name:'Bitcoin',nameid:'bitcoin',price_usd:'999',percent_change_24h:'1'}],{headers:{Date:new Date(Date.now()-3600000).toUTCString(),Age:'3600'}}):Response.json({}, {status:503})) as typeof fetch;
 const stale=await refresh('stale_batch',true);assert.equal(stale.positions[0].price,1);assert.ok(stale.positions[0].quoteError);
 // Discover unfamiliar identities once, then request just those IDs next time.
 const unknown=structuredClone(s);unknown.settings.autoFx=false;unknown.positions=unknown.positions.slice(0,1).map(p=>({...p,symbol:'NEWCOIN',name:'New Coin'}));
 saveState(unknown,readState('new_coin').revision,false,undefined,[],'new_coin');
 const paths:string[]=[];
 globalThis.fetch=(async input=>{const url=String(input);paths.push(url);const row={id:'999999',symbol:'NEWCOIN',name:'New Coin',nameid:'new-coin',price_usd:'12',percent_change_24h:'1'};return url.includes('/ticker/?id=')?Response.json([row],{headers:{Date:new Date().toUTCString()}}):Response.json({data:[row],info:{time:Math.floor(Date.now()/1000),coins_num:1}})}) as typeof fetch;
 assert.equal((await refresh('new_coin',true)).positions[0].price,12);
 assert.ok(paths[0].includes('/tickers/?start=0'));paths.length=0;
 assert.equal((await refresh('new_coin',true)).positions[0].price,12);
 assert.deepEqual(paths,['https://api.coinlore.net/api/ticker/?id=999999']);
 console.log('Quote checks passed: stalled primary, fast backup, deduplication, cancellation, FX conversion and failure preservation.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{globalThis.fetch=original;rmSync(dir,{recursive:true,force:true})});
