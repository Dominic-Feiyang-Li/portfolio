import {priceReturnForDay} from './price-returns';
import {chartRangeStart} from '@/lib/chart';
import type {PortfolioState,Position,Rates} from '@/types/portfolio';
import type {AuditRecord} from '@/types/history';
import type {HistoricalPortfolio,PriceSeries} from '@/types/prices';
import {exportHistory,readDataCache,saveDataCache} from './storage';
import {createHash} from 'node:crypto';
import {boundarySeries} from './daily-pnl';
import {chinaDayStart} from '@/lib/pnl';
const DAY=86400000;
export const effectiveTime=(r:AuditRecord)=>Date.parse(r.trade&&['买入','卖出','币币兑换'].includes(r.type)?r.trade.timestamp:r.timestamp);

export {canonicalHistory} from './canonical-history';
import {canonicalHistory} from './canonical-history';
import {confirmedReplay} from './reconciliation';
export function positionsAt(current:Position[],history:AuditRecord[],target:number):Position[]{
 const positions=new Map(current.map(p=>[p.id,{...p}]));
 const later=canonicalHistory(history).filter(r=>effectiveTime(r)>target).sort((a,b)=>effectiveTime(b)-effectiveTime(a)||(b.revision??0)-(a.revision??0));
 for(const r of later){
  if(!r.before||!r.after)throw new Error('旧交易缺少持仓和现金明细');
  if(r.trade&&['买入','卖出','币币兑换'].includes(r.type)){
   // Reverse deltas rather than replacing whole positions: backdated trades may be entered later.
   const ids=new Set([...r.before.positions,...r.after.positions].map(p=>p.id));
   if(history.some(other=>!['买入','卖出','币币兑换','修改设置','新增账户','修改账户','删除账户'].includes(other.type)&&effectiveTime(other)>effectiveTime(r)&&effectiveTime(other)<Date.parse(r.timestamp)&&[...(other.before?.positions??[]),...(other.after?.positions??[])].some(p=>ids.has(p.id))))throw new Error('补录交易与持仓调整的先后关系无法确认');
   const cashChanged=[...ids].some(id=>{const a=r.before!.positions.find(p=>p.id===id),b=r.after!.positions.find(p=>p.id===id);return (a?.category??b?.category)==='现金'&&(a?.quantity??0)!==(b?.quantity??0)});
   if(r.type!=='币币兑换'&&!cashChanged)throw new Error('交易未记录对应的现金结算');
   for(const id of ids){const a=r.before.positions.find(p=>p.id===id),b=r.after.positions.find(p=>p.id===id),base=positions.get(id)??b??a!;const quantity=(positions.get(id)?.quantity??0)+(a?.quantity??0)-(b?.quantity??0);if(quantity<-.00000001)throw new Error('交易顺序与初始持仓不一致');positions.set(id,{...base,quantity:Math.max(0,quantity)})}
  }else{
   for(const p of r.after.positions)positions.delete(p.id);
   for(const p of r.before.positions)positions.set(p.id,{...p});
  }
 }
 return [...positions.values()].filter(p=>p.quantity>0);
}
export function historicalValue(positions:Position[],series:Map<string,PriceSeries>,rates:Rates,target:number){
 let total=0;
 for(const p of positions){if(p.category==='现金'){if(!(rates[p.currency]>0))throw new Error('缺少历史汇率');total+=p.quantity*rates[p.currency];continue}
  const data=series.get(p.id);const price=data?.points.filter(q=>q.time<=target).at(-1);
  if(!data||!price||!(rates[data.currency]>0))throw new Error(p.symbol+'：缺少历史行情或汇率');
  if(target-price.time>(p.category==='加密货币'?DAY:10*DAY))throw new Error(p.symbol+'：历史报价过期');
  total+=p.quantity*price.price*rates[data.currency];
 }
 return total;
}
async function historicalFx(start:number,end:number){
 const from=new Date(start-10*DAY).toISOString().slice(0,10),to=new Date(end).toISOString().slice(0,10);
 const key='actual-fx-v2:USD:CNY:HKD',cached=await readDataCache<{time:number;rates:Rates}[]>(key).catch(()=>null);
 if(cached&&Date.now()-cached.fetchedAt<3600000&&cached.series.some(r=>r.time<=start&&start-r.time<=10*DAY)&&cached.series.at(-1)!.time>=chinaDayStart(end)-3*DAY)return cached.series;
 try{
 const response=await fetch(`https://api.frankfurter.dev/v2/rates?base=USD&quotes=CNY,HKD&from=${from}&to=${to}`,{next:{revalidate:3600},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error('历史汇率暂不可用');
 const rows=await response.json() as {date:string;quote:string;rate:number}[];
 const dates=new Map<string,Partial<Rates>>();
 for(const row of rows){if(['CNY','HKD'].includes(row.quote)&&row.rate>0&&Number.isFinite(row.rate))dates.set(row.date,{...dates.get(row.date),[row.quote]:row.rate})}
 const result=[...dates].filter(([,r])=>r.CNY&&r.HKD).map(([date,r])=>({time:Date.parse(date+'T00:00:00+08:00')+DAY,rates:{CNY:1,USD:r.CNY!,HKD:r.CNY!/r.HKD!}})).sort((a,b)=>a.time-b.time);
 if(!result.length)throw new Error('历史汇率暂不可用');
 const merged=new Map((cached?.series??[]).map(row=>[row.time,row]));for(const row of result)merged.set(row.time,row);
 const complete=[...merged.values()].sort((a,b)=>a.time-b.time);
 await saveDataCache(key,complete).catch(()=>{});
 return complete;
 }catch(error){if(cached?.series.length)return cached.series;throw error}
}
export function attachRecordedValues(base:HistoricalPortfolio,state:PortfolioState,start:number,now:number):HistoricalPortfolio{
 const points=new Map(base.points.filter(p=>Date.parse(p.timestamp)>=start&&Date.parse(p.timestamp)<=now).map(p=>[p.timestamp,p]));
 for(const p of state.snapshots)if(Date.parse(p.timestamp)>=start&&Date.parse(p.timestamp)<=now)points.set(p.timestamp,{timestamp:p.timestamp,valueCny:p.valueCny});
 const gaps=(base.gapTimestamps??[]).filter(t=>Date.parse(t)>=start&&Date.parse(t)<=now&&!points.has(t));
 return {...base,points:[...points.values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)),gapTimestamps:gaps,warnings:gaps.length?[`${gaps.length} 个时点暂无法核对，已留空`,...base.warnings]:[]};
}
export function retainVerifiedHistory(previous:HistoricalPortfolio|undefined,next:HistoricalPortfolio):HistoricalPortfolio{
 const points=new Map((previous?.points??[]).map(p=>[p.timestamp,p]));
 for(const p of next.points)points.set(p.timestamp,p);
 const daily=new Map((previous?.priceReturns??[]).map(p=>[p.date,p]));
 for(const row of next.priceReturns??[])if(row.value!==null||!daily.has(row.date))daily.set(row.date,row);
 const gaps=(next.gapTimestamps??[]).filter(t=>!points.has(t));
 return {...next,priceReturns:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),points:[...points.values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)),gapTimestamps:gaps,warnings:gaps.length?next.warnings:[]};
}
export function actualCacheKey(state:PortfolioState,history:AuditRecord[],range:string,userId:string|undefined,now:number){
 // Quotes and newly appended observations do not change historical ownership.
 const positions=state.positions.map(p=>[p.id,p.symbol,p.currency,p.category,p.quantity]).sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
 return 'actual-core-v5:'+createHash('sha256').update(JSON.stringify({owner:userId??'local',positions,history,firstObservation:state.snapshots[0]?.timestamp})).digest('hex');
}
const pendingActual=new Map<string,Promise<HistoricalPortfolio>>();
export async function actualPortfolio(state:PortfolioState,range:string,userId?:string,now=Date.now()):Promise<HistoricalPortfolio>{
 const history=await exportHistory(userId);
 const observed=[...state.snapshots.map(p=>Date.parse(p.timestamp)),...history.map(effectiveTime)].filter(t=>Number.isFinite(t)&&t<=now);
 if(!observed.length)return {points:[],sources:[],warnings:['暂无交易或估值记录'],range,availableFrom:null};
 const earliest=Math.min(...observed),start=Math.max(earliest,chartRangeStart(range,now));
 const displayStart=start;
 const key=actualCacheKey(state,history,range,userId,now),cached=await readDataCache<HistoricalPortfolio>(key).catch(()=>null);
 if(cached&&chinaDayStart(cached.fetchedAt)===chinaDayStart(now)&&Date.now()-cached.fetchedAt<(cached.series.gapTimestamps?.length?60000:86400000))return attachReconciledValues({...cached.series,range},state,history,displayStart,now);
 let task=pendingActual.get(key);
 if(!task){task=(async()=>{
  const replay=confirmedReplay(state,history);
  const times=[earliest];for(let t=chinaDayStart(earliest)+DAY;t<=now;t+=DAY)times.push(t);
  const plans=new Map<number,Position[]>(),gaps:string[]=[],reasons=new Set<string>();
  for(const time of times){try{plans.set(time,replay.positionsAt(time))}catch(e){gaps.push(new Date(time).toISOString());reasons.add((e as Error).message)}}
  const universe=new Map<string,Position>();for(const ps of plans.values())for(const p of ps)universe.set(p.id,p);
  for(const r of history)for(const p of [...(r.before?.positions??[]),...(r.after?.positions??[])])if(!universe.has(p.id))universe.set(p.id,p);
  const assets=[...universe.values()].filter(p=>p.category!=='现金'),series=new Map<string,PriceSeries>();
  const needsFx=[...universe.values()].some(p=>p.currency!=='CNY'||p.category==='加密货币');
  const fxTask=needsFx?historicalFx(earliest,now).catch(()=>[]):Promise.resolve([]);
  const shared=new Map<string,Promise<PriceSeries>>();
  for(let i=0;i<assets.length;i+=4)await Promise.allSettled(assets.slice(i,i+4).map(async p=>{const symbol=p.category+':'+p.symbol;let prices=shared.get(symbol);if(!prices){prices=boundarySeries(p,earliest,now);shared.set(symbol,prices)}series.set(p.id,await prices)}));
  const fx=await fxTask,points:HistoricalPortfolio['points']=[];
  for(const [time,positions] of plans){try{const rates=fx.filter(r=>r.time<=time&&time-r.time<=10*DAY).at(-1)?.rates??{CNY:1,USD:0,HKD:0};points.push({timestamp:new Date(time).toISOString(),valueCny:historicalValue(positions,series,rates,time)})}catch(e){gaps.push(new Date(time).toISOString());reasons.add((e as Error).message)}}
  const priceReturns=[];
  for(let time=chinaDayStart(earliest);time+DAY<=chinaDayStart(now);time+=DAY){
   if(time<earliest){priceReturns.push({date:new Date(time+8*3600000).toISOString().slice(0,10),opening:null,closing:null,value:null});continue}
   const end=time+DAY,rates=fx.filter(r=>r.time<=end&&end-r.time<=10*DAY).at(-1)?.rates??{CNY:1,USD:0,HKD:0};
   try{priceReturns.push(priceReturnForDay(replay.positionsAt(time),replay.events,universe,series,rates,time,end,canonicalHistory(history)))}catch{priceReturns.push({date:new Date(time+8*3600000).toISOString().slice(0,10),opening:null,closing:null,value:null})}
  }
  const base:HistoricalPortfolio={priceReturns,points,sources:['真实交易与持仓变更记录','对应日期的历史行情及汇率','已保存的账本估值'],warnings:[...reasons],gapTimestamps:gaps,range,availableFrom:new Date(earliest).toISOString()};
  const retained=retainVerifiedHistory(cached?.series,base);
  await saveDataCache(key,retained).catch(()=>{});return retained;
 })().finally(()=>pendingActual.delete(key));pendingActual.set(key,task)}
 return attachReconciledValues({...await task,range},state,history,displayStart,now);
}

function attachReconciledValues(base:HistoricalPortfolio,state:PortfolioState,history:AuditRecord[],start:number,now:number){
 const lastChange=Math.max(0,...history.map(r=>Date.parse(r.timestamp)));
 const latest=state.snapshots.filter(p=>Date.parse(p.timestamp)>=lastChange&&Date.parse(p.timestamp)<=now).at(-1);
 return attachRecordedValues(base,{...state,snapshots:latest?[latest]:[]},start,now);
}
