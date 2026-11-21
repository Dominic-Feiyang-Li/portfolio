import {chinaDayStart} from '@/lib/pnl';
import type {HoldingActivity,HoldingTrade} from '@/lib/holding-activity';
import type {PortfolioState,Position,LedgerEntry} from '@/types/portfolio';
import type {AuditRecord} from '@/types/history';
import type {PriceSeries} from '@/types/prices';
import {boundarySeries} from './daily-pnl';

function tradeForPosition(entry:LedgerEntry,p:Position,account:string,record?:AuditRecord):HoldingTrade|null{
 const {id,timestamp,swap}=entry;
 if(swap){
  const incoming=swap.toPositionId===p.id;
  if(!incoming&&swap.fromPositionId!==p.id)return null;
  const quantity=incoming?swap.toQuantity:swap.fromQuantity;
  return {id,timestamp,side:incoming?'Swap in':'Swap out',quantity,price:swap.value===null?null:swap.value/quantity};
 }
 if(entry.type!=='买入'&&entry.type!=='卖出')return null;
 if(entry.symbol!==p.symbol||entry.currency!==p.currency)return null;
 const snapshot=record?.after??record?.before;
 if(snapshot?!snapshot.positions.some(row=>row.id===p.id):entry.accountName!==account)return null;
 return {id,timestamp,side:entry.type==='买入'?'Buy':'Sell',quantity:entry.quantity,price:entry.price};
}

export async function holdingActivity(p:Position,state:PortfolioState,history:AuditRecord[],now:number,prices=boundarySeries):Promise<HoldingActivity>{
 const account=state.accounts.find(a=>a.id===p.accountId)?.name??'';
 const records=new Map(history.filter(r=>r.trade&&!r.legacy).map(r=>[r.trade!.id,r]));
 const trades=state.ledger.flatMap(entry=>{
  const trade=tradeForPosition(entry,p,account,records.get(entry.id));
  return trade&&Date.parse(trade.timestamp)<=now?[trade]:[];
 }).sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
 const result:HoldingActivity={id:p.id,currency:p.currency,trades:trades.slice(0,5),today:null};
 if(p.category==='现金'||p.provider==='manual')return result;
 const start=chinaDayStart(now);
 // A non-trade quantity change has no execution price. Its cash flow cannot
 // safely be classified as a gain or loss using a price-only calculation.
 const changed=history.some(r=>{
  if(Date.parse(r.timestamp)<start||Date.parse(r.timestamp)>now||['买入','卖出','币币兑换'].includes(r.type))return false;
  if(r.legacy)return r.trade?.symbol===p.symbol&&r.trade.accountName===account;
  const before=r.before?.positions.find(x=>x.id===p.id),after=r.after?.positions.find(x=>x.id===p.id);
  return (before?.quantity??0)!==(after?.quantity??0)||!!before&&!!after&&(before.symbol!==after.symbol||before.currency!==after.currency);
 });
 if(changed)return result;
 let series:PriceSeries;
 try{series=await prices(p,start,now)}catch{return result}
 const fx=series.currency===p.currency?1:state.settings.rates[series.currency]/state.settings.rates[p.currency];
 if(!(fx>0&&Number.isFinite(fx)))return result;
 const points=series.points.filter(q=>q.time<=now&&q.price>0);
 const opening=points.filter(q=>q.time<=start).at(-1);
 let close=points.at(-1);
 const recorded=Date.parse(p.quoteAt??'');
 if(!p.quoteError&&p.category==='加密货币'&&p.quoteSource&&p.quoteSource!=='手动价格'&&p.price>0&&recorded>=start&&recorded<=now&&recorded>(close?.time??0)){
  close={time:recorded,price:p.price/fx};
 }
 if(!close||close.time<start)return result;
 const maxAge=p.category==='加密货币'?86400000:10*86400000;
 if(now-close.time>maxAge)return result;
 const today=trades.filter(t=>Date.parse(t.timestamp)>=start);
 let openingUnits=p.quantity,buyValue=0,sellValue=0;
 for(const trade of today){
  if(trade.price===null||Date.parse(trade.timestamp)>close.time)return result;
  const buy=trade.side==='Buy'||trade.side==='Swap in';
  const swap=records.get(trade.id)?.trade?.swap??(trade.side.startsWith('Swap')?state.ledger.find(e=>e.id===trade.id)?.swap:undefined);
  const units=trade.quantity+(swap&&swap.feeSide===(buy?'to':'from')?(buy?-1:1)*swap.feeQuantity:0);
  openingUnits+=buy?-units:units;
  if(buy)buyValue+=units*trade.price;else sellValue+=units*trade.price;
 }
 if(openingUnits< -1e-8)return result;
 if(openingUnits>1e-8&&(!opening||start-opening.time>maxAge))return result;
 const basis=Math.max(0,openingUnits)*(opening?.price??0)*fx+buyValue;
 result.today={amount:p.quantity*close.price*fx+sellValue-basis,basis,asOf:new Date(close.time).toISOString()};
 return result;
}
