import assert from 'node:assert/strict';
import {priceReturnForDay} from '../src/server/price-returns';
import {GET} from '../src/app/api/daily-returns/route';
import type {Position} from '../src/types/portfolio';
import type {ReconciledEvent} from '../src/server/reconciliation';
import type {AuditRecord} from '../src/types/history';
const start=Date.parse('2026-11-01T00:00:00+08:00'),end=start+86400000;
const p:Position={id:'p',symbol:'TEST',name:'Test',accountId:'a',category:'美股',currency:'USD',quantity:100,price:999,previousClose:999,averageCost:999,provider:'auto',quoteAt:null,quoteSource:'',quoteError:null};
const templates=new Map([['p',p]]),series=new Map([['p',{points:[{time:start,price:10},{time:end,price:12},{time:end+1,price:999}],currency:'USD' as const,source:'fixture'}]]),rates={CNY:1,USD:7,HKD:.9};
const calculate=(opening:Position[],events:ReconciledEvent[]=[],history:AuditRecord[]=[])=>priceReturnForDay(opening,events,templates,series,rates,start,end,history);
assert.equal(calculate([p]).value,1400,'price difference × quantity × closing FX, not average cost or current quote');
const event=(id:string,delta:number,cash=false):ReconciledEvent=>({id,recordedAt:new Date(start+3600000).toISOString(),effectiveAt:new Date(start+3600000).toISOString(),type:'买入',changes:[{positionId:cash?'cash':'p',symbol:cash?'USD':'TEST',accountId:'a',currency:'USD',cash,delta}]});
const trade=(id:string,type:'买入'|'卖出',quantity:number):AuditRecord=>({id,timestamp:new Date(start+3600000).toISOString(),type,subject:'TEST',account:'a',revision:1,legacy:false,before:null,after:null,trade:{id,type,symbol:'TEST',accountName:'a',currency:'USD',timestamp:new Date(start+3600000).toISOString(),quantity,price:11,fee:20,realizedPnl:0,note:''}});
assert.equal(calculate([p],[event('consume',-2100,true)]).value,1400,'spending must not reduce price returns');
assert.equal(calculate([p],[event('deposit',5000,true)]).value,1400,'deposits must not increase price returns');
assert.equal(calculate([p],[event('buy',50)],[trade('buy','买入',50)]).value,1750,'new units earn only from execution price; fees excluded');
assert.equal(calculate([p],[event('sell',-30)],[trade('sell','卖出',30)]).value,1190,'sold units earn only until sale');
assert.equal(calculate([],[event('buy',100),event('sell',-100)],[trade('buy','买入',100),{...trade('sell','卖出',100),trade:{...trade('sell','卖出',100).trade!,price:12}}]).value,700,'same-day round trip retains realized price gain');
assert.equal(priceReturnForDay([p],[],templates,new Map(),rates,start,end,[]).value,null,'missing prices cannot become zero');
assert.equal(calculate([{...p,id:'cash',category:'现金',symbol:'USD'}]).value,0,'cash itself has no price profit');
async function auth(){process.env.PORTFOLIO_AUTH_ENABLED='1';assert.equal((await GET(new Request('http://localhost/api/daily-returns'))).status,401);console.log('Daily price return checks passed: boundaries, cash flow exclusion, intraday buys/sells, round trips, no future prices and authentication')}
auth().catch(e=>{console.error(e);process.exitCode=1});

import {holdingActivity} from '../src/server/holding-activity';
import {emptyState} from '../src/lib/portfolio';
import {GET as holdingDetails} from '../src/app/api/holding-details/route';
async function holdingChecks(){
 const state=emptyState();state.accounts=[{id:'a',name:'Test account',note:''}];
 const at=(h:number)=>new Date(start+h*3600000).toISOString();
 const buy={...trade('buy','买入',10).trade!,accountName:'Test account',timestamp:at(2),price:11};
 const sell={...buy,id:'sell',type:'卖出' as const,quantity:20,timestamp:at(3),price:13};
 state.ledger=[buy,{...buy,id:'other',accountName:'Other'},sell];
 const position={...p,quantity:90};
 const now=start+4*3600000;
 const prices=async()=>({currency:'USD' as const,source:'fixture',points:[{time:start,price:10},{time:now,price:12}]});
 const activity=await holdingActivity(position,state,[],now,prices);
 assert.deepEqual(activity.trades.map(t=>t.id),['sell','buy']);
 assert.equal(activity.today?.basis,1110);
 assert.equal(activity.today?.amount,230);
 const missing=await holdingActivity(position,state,[],now,async()=>{throw Error('offline')});
 assert.equal(missing.today,null);assert.equal(missing.trades.length,2);
 const swap={...buy,type:'币币兑换' as const,swap:{fromPositionId:'other',toPositionId:'p',toSymbol:'TEST',fromQuantity:1,toQuantity:10,value:null,feeSide:'to' as const,feeQuantity:1}};
 state.ledger=[swap];const incoming=await holdingActivity(position,state,[],now,prices);
 assert.equal(incoming.trades[0].side,'Swap in');assert.equal(incoming.trades[0].price,null);assert.equal(incoming.today,null);
 assert.equal((await holdingDetails(new Request('http://localhost/api/holding-details?group=x'))).status,401);
}
holdingChecks().catch(e=>{console.error(e);process.exitCode=1});

import {portfolioToday} from '../src/server/portfolio-today';
async function overviewReturnChecks(){
 const state=emptyState(),now=start+4*3600000;
 state.settings.rates=rates;state.settings.currency='CNY';
 state.accounts=[{id:'a',name:'a',note:''}];
 const snapshot=(positions:Position[])=>({positions,accounts:state.accounts});
 const sale=trade('closed','卖出',10);
 const closed={...p,id:'closed',symbol:'CLOSED',quantity:10};
 sale.trade!.symbol=closed.symbol;sale.before=snapshot([closed]);sale.after=snapshot([{...closed,quantity:0}]);
 state.positions=[{...p,quantity:20}];state.ledger=[sale.trade!];
 const prices=async()=>({currency:'USD' as const,source:'test',points:[{time:start,price:10},{time:now,price:12}]});
 // 20 retained units gain USD 2 each, 10 closed units gain USD 1 each.
 const result=await portfolioToday(state,[sale],now,prices);
 assert.equal(result?.amount,350);
 assert.ok(Math.abs(result!.percent!-100/6)<1e-8);
 assert.equal(await portfolioToday(state,[sale],now,async()=>{throw Error('offline')}),null);
 state.positions=[];state.ledger=[];
 assert.deepEqual(await portfolioToday(state,[],now,prices),{amount:0,percent:null,currency:'CNY'});
}
overviewReturnChecks().catch(e=>{console.error(e);process.exitCode=1});
