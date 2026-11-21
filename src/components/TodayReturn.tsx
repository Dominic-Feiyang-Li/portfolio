'use client';
import {useEffect,useState} from 'react';
import {chinaDayStart} from '@/lib/pnl';
import {signed} from '@/lib/portfolio';
import type {Currency} from '@/types/portfolio';

type Result={day:string;revision:number;summary:{amount:number;percent:number|null;currency:Currency}|null};
export default function TodayReturn({revision,currency,hidden}:{revision:number;currency:Currency;hidden:boolean}){
 const [day,setDay]=useState(()=>chinaDayStart(Date.now()));
 const [result,setResult]=useState<Result|null>(null);
 useEffect(()=>{
  const timer=setTimeout(()=>setDay(chinaDayStart(Date.now())),Math.max(1,day+86400000-Date.now()));
  return ()=>clearTimeout(timer);
 },[day]);
 useEffect(()=>{
  const controller=new AbortController();
  fetch('/api/daily-returns?period=today',{cache:'no-store',signal:controller.signal}).then(async r=>{
   if(!r.ok)throw new Error();
   const data:Result=await r.json();
   if(!controller.signal.aborted)setResult(data);
  }).catch(()=>{if(!controller.signal.aborted)setResult(null)});
  return ()=>controller.abort();
 },[revision,day]);
 const date=new Date(day+8*3600000).toISOString().slice(0,10);
 const summary=result?.day===date&&result.revision===revision&&result.summary?.currency===currency?result.summary:null;
 const tone=!hidden&&summary?.amount?(summary.amount>0?'up':'down'):'';
 return <div className="overviewtoday" title="Price P&L since 00:00 Beijing time. Return on opening invested value plus intraday purchases.">
  <span>Today’s P&amp;L</span><strong className={tone}>{hidden?'••••':summary?signed(summary.amount)+' '+currency:'—'}</strong>
  {!hidden&&summary?.percent!=null&&<span className={tone}>({signed(summary.percent)}%)</span>}
 </div>;
}
