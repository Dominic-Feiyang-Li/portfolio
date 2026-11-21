import {chinaDayStart} from '@/lib/pnl';
import {assetClasses,type PortfolioState,type Snapshot,type Rates} from '@/types/portfolio';
import type {AuditRecord} from '@/types/history';
import {readState,exportHistory,readFixedValuations,saveFixedValuation} from './storage';
import {boundarySeries,portfolioTimeline,pnlStart} from './daily-pnl';
import type {HistoricalPortfolio} from '@/types/prices';
export class BoundaryHistoryError extends Error {constructor(){super('边界之后的历史变更无法还原')}}
export interface FixedValuation extends Snapshot {recordedAt:string;sources:string[];basis:'scheduled'}
export function stateAtBoundary(current:PortfolioState,history:AuditRecord[],target:number){
 const state=structuredClone(current);
 const later=history.filter(r=>Date.parse(r.timestamp)>target).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp)||(b.revision??0)-(a.revision??0));
 for(const record of later){
  if(!record.before||!record.after){if(record.trade)throw new BoundaryHistoryError();continue}
  if(record.type==='导入备份'){state.positions=structuredClone(record.before.positions);state.accounts=structuredClone(record.before.accounts)}
  else{
   const ids=new Set([...record.before.positions,...record.after.positions].map(p=>p.id));state.positions=state.positions.filter(p=>!ids.has(p.id)).concat(structuredClone(record.before.positions));
   const accounts=new Set([...record.before.accounts,...record.after.accounts].map(a=>a.id));state.accounts=state.accounts.filter(a=>!accounts.has(a.id)).concat(structuredClone(record.before.accounts));
  }
  if(record.before.settings)state.settings=structuredClone(record.before.settings);
 }
 return state;
}
async function fixedRates(target:number):Promise<{rates:Rates;date:string}>{
 const day=new Date(target-86400000+8*3600000).toISOString().slice(0,10);
 const r=await fetch(`https://api.frankfurter.dev/v1/${day}?base=USD&symbols=CNY,HKD`,{signal:AbortSignal.timeout(10000),cache:'no-store'});
 if(!r.ok)throw new Error('固定时点汇率不可用');const q=await r.json();
 if(!q.date||q.date>day||!(q.rates?.CNY>0)||!(q.rates?.HKD>0))throw new Error('固定时点汇率不完整');
 return {rates:{CNY:1,USD:q.rates.CNY,HKD:q.rates.CNY/q.rates.HKD},date:q.date};
}
export async function captureFixedValuation(userId:string,target=chinaDayStart(Date.now())){
 if(target!==chinaDayStart(target)||target>Date.now())throw new Error('估值必须使用已到达的北京时间零点');
 const existing=(await readFixedValuations(userId)).find(v=>Date.parse(v.timestamp)===target);if(existing)return {created:false,timestamp:existing.timestamp};
 const state=stateAtBoundary(await readState(userId),await exportHistory(userId),target);
 const active=state.positions.filter(p=>p.quantity>0),foreign=active.some(p=>p.currency!=='CNY');
 const fx=foreign?await fixedRates(target):{rates:{CNY:1,USD:0,HKD:0} as Rates,date:new Date(target).toISOString().slice(0,10)};
 const categories=Object.fromEntries(assetClasses.map(c=>[c,0])) as Snapshot['categories'],sources=new Set<string>();
 for(let i=0;i<active.length;i+=4)await Promise.all(active.slice(i,i+4).map(async p=>{
  if(p.category==='现金'){categories[p.category]+=p.quantity*fx.rates[p.currency];return}
  const series=await boundarySeries(p,target,target),last=series.points.filter(q=>q.time<=target).at(-1);
  if(!last||!(fx.rates[series.currency]>0))throw new Error('固定时点报价不完整');
  categories[p.category]+=p.quantity*last.price*fx.rates[series.currency];sources.add(series.source);
 }));
 if(foreign)sources.add('Frankfurter · '+fx.date);
 const timestamp=new Date(target).toISOString();
 await saveFixedValuation({id:'fixed:'+timestamp,timestamp,valueCny:Object.values(categories).reduce((sum,v)=>sum+v,0),categories,reason:'每日00:00固定估值',recordedAt:new Date().toISOString(),sources:[...sources],basis:'scheduled'},userId);
 return {created:true,timestamp};
}
export async function fixedValuationHistory(state:PortfolioState,positions:PortfolioState['positions'],range:string,category:string,userId:string,now=Date.now()):Promise<HistoricalPortfolio>{
 const end=chinaDayStart(now),start=pnlStart(range,end);
 const history=await portfolioTimeline(state,positions,range,end,false);
 const byTime=new Map(history.points.map(p=>[p.timestamp,p]));
 const archives=(await readFixedValuations(userId)).filter(p=>Date.parse(p.timestamp)>=start&&Date.parse(p.timestamp)<=end);
 for(const item of archives)byTime.set(item.timestamp,{timestamp:item.timestamp,valueCny:category==='全部'?item.valueCny:item.categories[category as keyof typeof item.categories]});
 return {...history,points:[...byTime.values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)),sources:[...history.sources,`北京时间每天00:00 · ${archives.length} 个后台固定归档点，其余为历史补算`],fixedTimestamps:archives.map(p=>p.timestamp)};
}
