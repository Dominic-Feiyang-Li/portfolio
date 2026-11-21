import {assetName} from '@/lib/labels';
import type {Position,Rates} from '@/types/portfolio';
import type {PriceSeries} from '@/types/prices';
import type {AuditRecord} from '@/types/history';
import type {ReconciledEvent} from './reconciliation';
import type {DailyReturn} from '@/lib/daily-returns';
export interface PriceContribution {name:string;symbol:string;currency:string;openingPrice:number|null;closingPrice:number;value:number}
export function priceReturnForDay(opening:Position[],events:ReconciledEvent[],templates:Map<string,Position>,series:Map<string,PriceSeries>,rates:Rates,start:number,end:number,history:AuditRecord[]):DailyReturn{
 const date=new Date(start+8*3600000).toISOString().slice(0,10),items:PriceContribution[]=[];
 const price=(id:string,time:number)=>{const p=series.get(id),q=p?.points.filter(p=>p.time<=time).at(-1);const asset=templates.get(id);if(!p||!q||time-q.time>(asset?.category==='加密货币'?86400000:10*86400000)||!(rates[p.currency]>0))throw new Error('Historical price unavailable');return {value:q.price,currency:p.currency,rate:rates[p.currency]}};
 try{
  const changes=events.filter(e=>Date.parse(e.effectiveAt)>start&&Date.parse(e.effectiveAt)<=end);
  const ids=new Set([...opening.filter(p=>p.category!=='现金').map(p=>p.id),...changes.flatMap(e=>e.changes.filter(c=>!c.cash).map(c=>c.positionId))]);
  for(const id of ids){
   const p=templates.get(id);if(!p||p.category==='现金')continue;
   const quantity=opening.find(p=>p.id===id)?.quantity??0,close=price(id,end),open=quantity?price(id,start):null;
   let value=quantity*(close.value-(open?.value??0));
   for(const event of changes){
    const delta=event.changes.find(c=>c.positionId===id&&!c.cash)?.delta??0;if(!delta)continue;
    const trade=history.find(r=>r.id===event.id)?.trade;
    const execution=trade&&['买入','卖出'].includes(trade.type)&&trade.symbol===p.symbol?trade:null;
    if(execution&&execution.currency!==close.currency)throw new Error('Execution currency differs from quote currency');
    const entry=execution?.price??price(id,Date.parse(event.effectiveAt)).value;
    value+=delta*(close.value-entry);
   }
   items.push({name:assetName(p),symbol:p.symbol,currency:close.currency,openingPrice:open?.value??null,closingPrice:close.value,value:value*close.rate});
  }
  return {date,opening:null,closing:null,value:items.reduce((n,p)=>n+p.value,0),items};
 }catch{return {date,opening:null,closing:null,value:null,items:[]}}
}
