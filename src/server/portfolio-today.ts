import {chinaDayStart} from '@/lib/pnl';
import type {PortfolioState,Position} from '@/types/portfolio';
import type {AuditRecord} from '@/types/history';
import {boundarySeries} from './daily-pnl';
import {holdingActivity} from './holding-activity';

export async function portfolioToday(state:PortfolioState,history:AuditRecord[],now:number,prices=boundarySeries){
 const start=chinaDayStart(now);
 const positions=new Map(state.positions.filter(p=>p.quantity>0&&p.category!=='现金').map(p=>[p.id,p]));
 const current=new Map(state.positions.map(p=>[p.id,p]));
 // Today's closed positions can still have a realized intraday price return.
 for(const r of history){
  const time=Date.parse(r.trade?.timestamp??r.timestamp);
  if(time<start||time>now)continue;
  if(!r.before||!r.after){
   if(r.trade&&['买入','卖出','币币兑换','持仓调整','持仓删除'].includes(r.trade.type))return null;
   continue;
  }
  for(const prior of r.before.positions){
   if(prior.category==='现金'||prior.quantity<=0||positions.has(prior.id))continue;
   positions.set(prior.id,current.get(prior.id)??{...prior,quantity:0});
  }
 }
 const {currency,rates}=state.settings;
 let amount=0,basis=0;
 const assets=[...positions.values()];
 const requests=new Map<string,ReturnType<typeof boundarySeries>>();
 const sharedPrices=(p:Position,start:number,end:number)=>{
  const key=p.category+':'+p.symbol;
  let request=requests.get(key);
  if(!request){request=prices(p,start,end);requests.set(key,request)}
  return request;
 };
 for(let i=0;i<assets.length;i+=4){
  const group=await Promise.all(assets.slice(i,i+4).map(p=>holdingActivity(p,state,history,now,sharedPrices)));
  for(const item of group){
   const fx=item.currency===currency?1:rates[item.currency]/rates[currency];
   if(!item.today||!(fx>0&&Number.isFinite(fx)))return null;
   amount+=item.today.amount*fx;
   basis+=item.today.basis*fx;
  }
 }
 return {amount,percent:basis>0?100*amount/basis:null,currency};
}
