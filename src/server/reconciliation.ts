import type {PortfolioState} from '@/types/portfolio';
import type {AuditRecord} from '@/types/history';
import {canonicalHistory} from './canonical-history';

export interface QuantityChange {positionId:string;symbol:string;accountId:string;currency:string;cash:boolean;delta:number}
export interface ReconciledEvent {id:string;recordedAt:string;effectiveAt:string;type:string;changes:QuantityChange[]}
export interface CashCheck {tradeId:string;symbol:string;currency:string;expected:number;recorded:number;status:'settled'|'linked-settlement'|'needs-confirmation';settlementId?:string;interest?:number;difference:number}
const close=(a:number,b:number)=>Math.abs(a-b)<.00001;
export function reconcileLedger(state:PortfolioState,records:AuditRecord[]){
 const history=canonicalHistory(records);
 if(history.some(r=>!r.before||!r.after))throw new Error('Unmatched legacy record requires reconciliation');
 const events:ReconciledEvent[]=history.map(r=>{
  const before=r.before?.positions??[],after=r.after?.positions??[];
  const changes=[...new Set([...before,...after].map(p=>p.id))].flatMap(id=>{
   const b=before.find(p=>p.id===id),a=after.find(p=>p.id===id),p=a??b!;
   const delta=(a?.quantity??0)-(b?.quantity??0);
   return Math.abs(delta)<1e-12?[]:[{positionId:id,symbol:p.symbol,accountId:p.accountId,currency:p.currency,cash:p.category==='现金',delta}];
  });
  const trade=r.trade&&['买入','卖出','币币兑换'].includes(r.trade.type)?r.trade:null;
  return {id:r.id,recordedAt:r.timestamp,effectiveAt:trade?.timestamp??r.timestamp,type:trade?.type??r.type,changes};
 }).sort((a,b)=>Date.parse(a.effectiveAt)-Date.parse(b.effectiveAt)||Date.parse(a.recordedAt)-Date.parse(b.recordedAt));
 const cashChecks:CashCheck[]=[];
 for(const r of history){
  const trade=r.trade;if(!trade||!['买入','卖出'].includes(trade.type))continue;
  const event=events.find(e=>e.id===r.id)!;
  const account=event.changes.find(c=>!c.cash&&c.symbol===trade.symbol)?.accountId;
  const expected=(trade.type==='买入'?-1:1)*trade.quantity*trade.price!-trade.fee!;
  const recorded=event.changes.filter(c=>c.cash&&c.accountId===account&&c.currency===trade.currency).reduce((n,c)=>n+c.delta,0);
  const check:CashCheck={tradeId:r.id,symbol:trade.symbol,currency:trade.currency,expected,recorded,status:close(expected,recorded)?'settled':'needs-confirmation',difference:expected-recorded};
  // An explicit shared order reference plus matching cash arithmetic is required.
  const order=trade.note.match(/订单\s*([A-Z0-9]+(?:-[A-Z0-9]+)+)/)?.[1];
  if(check.status==='needs-confirmation'&&order){
   const candidates=history.filter(other=>other.id!==r.id&&other.trade?.type==='持仓调整'&&other.trade.currency===trade.currency&&other.trade.note.includes(order)&&Date.parse(other.timestamp)>=Date.parse(r.timestamp));
   const matches=candidates.flatMap(other=>{
    const cash=events.find(e=>e.id===other.id)!.changes.filter(c=>c.cash&&c.accountId===account&&c.currency===trade.currency).reduce((n,c)=>n+c.delta,0);
    const interest=other.trade!.quantity;
    return other.trade!.note.includes('利息')&&close(cash,expected+interest)?[{id:other.id,interest}]:[];
   });
   if(matches.length===1){check.status='linked-settlement';check.settlementId=matches[0].id;check.interest=matches[0].interest;check.difference=0}
  }
  cashChecks.push(check);
 }
 const unresolved=cashChecks.filter(c=>c.status==='needs-confirmation');
 const balances=state.positions.filter(p=>p.category==='现金').map(p=>({positionId:p.id,currency:p.currency,current:p.quantity}));
 return {events,cashChecks,unresolved,balances,originalRecords:records.length,canonicalRecords:history.length};
}

// Review-only scenarios. A cash interpretation is explicit, never silently assumed.
export function replayScenario(state:PortfolioState,records:AuditRecord[],cashAlreadyIncluded:boolean){
 const report=reconcileLedger(state,records);
 const templates=new Map([...records.flatMap(r=>[...(r.before?.positions??[]),...(r.after?.positions??[])]),...state.positions].map(p=>[p.id,p]));
 const baseline=new Map(state.positions.map(p=>[p.id,p.quantity]));
 for(const event of report.events)for(const change of event.changes)baseline.set(change.positionId,(baseline.get(change.positionId)??0)-change.delta);
 const events=structuredClone(report.events);
 for(const check of report.unresolved){
  const event=events.find(e=>e.id===check.tradeId)!;
  const holding=event.changes.find(c=>!c.cash&&c.symbol===check.symbol);
  const cash=[...templates.values()].filter(p=>p.category==='现金'&&p.accountId===holding?.accountId&&p.currency===check.currency);
  if(cash.length!==1)throw new Error('Cash account must be identified before reconstruction');
  const p=cash[0];event.changes.push({positionId:p.id,symbol:p.symbol,accountId:p.accountId,currency:p.currency,cash:true,delta:check.difference});
  if(cashAlreadyIncluded)baseline.set(p.id,(baseline.get(p.id)??0)-check.difference);
 }
 const positionsAt=(time:number)=>{
  const quantities=new Map(baseline);
  for(const e of events)if(Date.parse(e.effectiveAt)<=time)for(const c of e.changes)quantities.set(c.positionId,(quantities.get(c.positionId)??0)+c.delta);
  return [...quantities].filter(([,n])=>Math.abs(n)>1e-8).map(([id,quantity])=>{
   const template=templates.get(id);if(!template)throw new Error('Missing historical position identity');
   if(quantity< -1e-8)throw new Error(`Negative reconstructed balance: ${id}`);
   return {...template,quantity:Math.max(0,quantity)};
  });
 };
 return {report,events,positionsAt,cashAlreadyIncluded};
}

export function confirmedReplay(state:PortfolioState,records:AuditRecord[]){
 const report=reconcileLedger(state,records);
 if(report.unresolved.length)throw new Error('Unconfirmed cash difference requires reconciliation');
 return replayScenario(state,records,true);
}
