'use client';
import {useEffect,useState} from 'react';
import {holdingDisplayGroups,priceTimeLabel} from '@/lib/holding-display';
import {chinaDayStart} from '@/lib/pnl';
import {accountName} from '@/lib/labels';
import {Button} from '@/components/ui/button';
import {formatAmount,summarize,signed} from '@/lib/portfolio';
import type {Position,Rates,Currency,Account} from '@/types/portfolio';
import type {HoldingActivity} from '@/lib/holding-activity';
import Modal from './Modal';
import AssetLogo from './AssetLogo';

type Props={revision:number;accountId?:string;positions:Position[];accounts?:Account[];rates:Rates;currency:Currency;hidden:boolean;onEdit?:(position:Position)=>void};
export default function HoldingsList({revision,accountId,positions,accounts=[],rates,currency,hidden,onEdit}:Props){
 const [selected,setSelected]=useState<string|null>(null);
 const rate=rates[currency];
 const groups=holdingDisplayGroups(positions).map(group=>{
  const totals=summarize(group.positions,rates);
  const knownRate=rate>0&&group.positions.every(p=>rates[p.currency]>0);
  const hasCost=group.positions.some(p=>p.category!=='现金'&&(p.averageCost??0)>0);
  return {...group,...totals,knownRate,percent:knownRate&&hasCost&&!totals.unknownCost?totals.profitPercent:null};
 }).sort((a,b)=>b.value-a.value);
 const portfolioValue=!accountId&&!hidden&&groups.every(g=>g.knownRate)?groups.reduce((sum,g)=>sum+g.value,0):0;
 const selectedGroup=groups.find(g=>g.key===selected);
 return <><div className="positionslist simpleholdings" role="group" aria-label="Holdings list">
  {groups.map(group=>{
   const {knownRate,unknownCost,profit,percent}=group;
   const cash=group.positions.every(p=>p.category==='现金');
   const gain=hidden?'••••':unknownCost?'Cost basis missing':!knownRate?'—':signed(profit/rate);
   const times=new Set(group.positions.map(priceTimeLabel));
   const priceTime=times.size===1?priceTimeLabel(group.positions[0]):'Price times vary · View details';
   const weight=portfolioValue>0?group.value/portfolioValue*100:null;
   return <Button variant="ghost" key={group.key} className="simpleholding" onClick={()=>setSelected(group.key)} aria-label={`View ${group.name} holding details. ${priceTime}${weight===null?'':'. '+weight.toFixed(1)+'% of portfolio'}`}>
    <span className="holdinglabel"><AssetLogo name={group.name} symbol={group.positions.length===1?group.positions[0].symbol:undefined}/><span className="holdingidentity"><span className="holdingname">{group.name}</span>{weight!==null&&<span className="holdingweight" aria-hidden="true"><span className="weighttrack"><span style={{width:weight+'%'}}/></span>{weight.toFixed(1)}%</span>}{priceTime&&<span className="holdingpricetime">{group.positions.some(p=>p.quoteError)&&'Saved · '}{priceTime}</span>}</span></span>
    <span className="holdingamount"><strong>{hidden?'••••••':knownRate?formatAmount(group.value/rate,currency):'—'}</strong>{!cash&&<span className={unknownCost?'unknowncost':profit>=0?'up':'down'}><span className="holdingprofit">{gain}</span>{!hidden&&!unknownCost&&knownRate&&percent!==null&&<span className="holdingreturn">{' ('+signed(percent)+'%)'}</span>}</span>}</span>
   </Button>;
  })}
 </div>
 {selectedGroup&&<Modal title={selectedGroup.name} onClose={()=>setSelected(null)}>
  <GroupDetails key={selectedGroup.key} group={selectedGroup.key} currency={currency} rates={rates} combinedProfit={selectedGroup.knownRate&&!selectedGroup.unknownCost?selectedGroup.profit/rate:null} combinedPercent={selectedGroup.percent} positions={selectedGroup.positions}
   revision={revision} accountId={accountId} accounts={accounts} hidden={hidden}
   onEdit={onEdit?p=>{setSelected(null);onEdit(p)}:undefined}/>

 </Modal>}
 </>;
}

const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});

function GroupDetails({group,positions,revision,accountId,accounts,hidden,onEdit,currency,rates,combinedProfit,combinedPercent}:
 Pick<Props,'positions'|'revision'|'accountId'|'hidden'|'onEdit'|'rates'|'currency'>&{group:string;accounts:Account[];combinedProfit:number|null;combinedPercent:number|null}){
 const [items,setItems]=useState<HoldingActivity[]>([]),[status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
 const [retry,setRetry]=useState(0);
 const cash=positions.every(p=>p.category==='现金');
 useEffect(()=>{
  if(cash)return;
  const controller=new AbortController(),params=new URLSearchParams({group});
  if(accountId)params.set('account',accountId);
  setStatus('loading');
  fetch('/api/holding-details?'+params,{cache:'no-store',signal:controller.signal}).then(async response=>{
   if(!response.ok)throw new Error('Details unavailable');
   const data=await response.json();
   if(!controller.signal.aborted){setItems(data.items);setStatus('ready')}
  }).catch(()=>{if(!controller.signal.aborted)setStatus('error')});
  const midnight=chinaDayStart(Date.now())+86400000;
  const timer=setTimeout(()=>setRetry(n=>n+1),Math.max(1,midnight-Date.now()));
  return ()=>{controller.abort();clearTimeout(timer)};
 },[group,revision,accountId,retry,cash]);
 const complete=status==='ready'&&items.length===positions.length&&rates[currency]>0&&items.every(x=>x.today&&rates[x.currency]>0);
 const combined=complete?items.reduce((total,x)=>{
  const rate=rates[x.currency]/rates[currency];
  return {amount:total.amount+x.today!.amount*rate,basis:total.basis+x.today!.basis*rate};
 },{amount:0,basis:0}):null;
 return <>
  {status==='error'&&<div role="alert">Could not load daily returns and trades. <Button size="sm" variant="ghost" onClick={()=>setRetry(n=>n+1)}>Retry</Button></div>}
  {positions.length>1&&<div className="holdingreturns groupreturns">
   <ProfitReadout label="Combined unrealized P&L" amount={combinedProfit} percent={combinedPercent} currency={currency} hidden={hidden}/>
   <ProfitReadout label="Combined today’s P&L" amount={combined?.amount??null} percent={combined&&combined.basis>0?100*combined.amount/combined.basis:null} currency={currency} hidden={hidden}/>
  </div>}
  {positions.map(p=><HoldingDetails key={p.id} position={p} account={accounts.find(a=>a.id===p.accountId)}
   activity={status==='ready'?items.find(item=>item.id===p.id):undefined} loading={status==='loading'}
   hidden={hidden} onEdit={onEdit?()=>onEdit(p):undefined}/>)}
 </>;
}

function ProfitReadout({label,amount,percent,currency,hidden}:{
 label:string;amount:number|null;percent:number|null;currency:Currency;hidden:boolean
}){
 const tone=hidden||amount===null||amount===0?'':amount>0?'up':'down';
 const amountText=amount===null?'—':(amount>0?'+':'')+formatAmount(amount,currency)+' '+currency;
 return <div className="detailprofit">
  <div className="detailcaption">{label}</div>
  <div className={'detailreturn '+tone}>
   <strong>{hidden?'••••':amountText}</strong>
   {!hidden&&<span>{percent===null?'—':signed(percent)+'%'}</span>}
  </div>
 </div>;
}

function HoldingDetails({position:p,account,hidden,onEdit,activity,loading}:{
 position:Position;account?:Account;hidden:boolean;onEdit?:()=>void;activity?:HoldingActivity;loading:boolean
}){
 const cash=p.category==='现金',cost=p.averageCost;
 const unit=(value:number)=>hidden?'••••':new Intl.NumberFormat('en-US',{
  minimumFractionDigits:2,maximumFractionDigits:12
 }).format(value)+' '+p.currency;
 return <section className="detailposition">
  <div className="detailidentity">
   <div><strong>{p.symbol}</strong>{account&&<span> · {accountName(account)}</span>}</div>
   {onEdit&&<Button variant="outline" size="sm" onClick={onEdit}>Edit holding</Button>}
  </div>
  {!cash&&<div className="holdingreturns"><ProfitReadout label="Unrealized P&L" currency={p.currency} hidden={hidden}
   amount={cost===null?null:p.quantity*(p.price-cost)}
   percent={cost!==null&&cost>0?(p.price-cost)/cost*100:null}
  />
   <div><ProfitReadout label="Today’s P&L" currency={p.currency} hidden={hidden}
    amount={activity?.today?.amount??null}
    percent={activity?.today&&activity.today.basis>0?100*activity.today.amount/activity.today.basis:null}/>
    <small className="detailquotetime">{loading?'Loading…':activity?.today?'As of '+stamp.format(new Date(activity.today.asOf))+' UTC+8':'Daily valuation unavailable'}</small>
   </div>
  </div>}
  <dl className="detailmetrics">
   <div><dt>Market value</dt><dd>{hidden?'••••':formatAmount(p.quantity*p.price,p.currency)+' '+p.currency}</dd></div>
   <div><dt>Quantity</dt><dd>{hidden?'••••':p.quantity.toLocaleString('en-US',{maximumFractionDigits:12})}</dd></div>
   {!cash&&<div><dt>Average cost</dt><dd>{hidden?'••••':cost===null?'Not recorded':unit(cost)}</dd></div>}
   {!cash&&<div><dt>{p.quoteError?'Saved price':'Recorded price'}</dt><dd>{unit(p.price)}</dd></div>}
  </dl>
  {!cash&&<div className="detailquotetime">{p.quoteError&&'Update failed · '}{priceTimeLabel(p)}</div>}
  {!cash&&<div className="holdingtrades">
   <h3>Recent trades</h3>
   {activity?.trades.length?<ul>{activity.trades.map(t=><li key={t.id}>
    <div><strong>{t.side}</strong><time dateTime={t.timestamp}>{stamp.format(new Date(t.timestamp))} UTC+8</time></div>
    <div><span>{hidden?'••••':t.quantity.toLocaleString('en-US',{maximumFractionDigits:12})} {p.symbol}</span>
     <small>{t.price===null?'Price not recorded':'@ '+unit(t.price)}</small></div>
   </li>)}</ul>:<small>{loading?'Loading…':activity?'No trades recorded':'Trade history unavailable'}</small>}
  </div>}
 </section>;
}
