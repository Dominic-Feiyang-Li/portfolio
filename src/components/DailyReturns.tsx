'use client';
import {useEffect,useState} from 'react';
import {ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {signed,formatAmount} from '@/lib/portfolio';
import type {DailyReturn} from '@/lib/daily-returns';
import {interfaceText} from '@/lib/labels';
const week=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const compactAmount=new Intl.NumberFormat('en-US',{notation:'compact',maximumSignificantDigits:2,signDisplay:'exceptZero'});
const currentDate=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
export default function DailyReturns({revision,hidden}:{revision:number;hidden:boolean}){
 const [data,setData]=useState<{days:DailyReturn[];today:string}|null>(null),[month,setMonth]=useState(()=>currentDate().slice(0,7)),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');fetch('/api/daily-returns',{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error);setData(d)}).catch(e=>{if(e.name!=='AbortError')setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return ()=>controller.abort()},[revision,retry]);
 useEffect(()=>{const timer=setInterval(()=>{if(data&&currentDate()!==data.today)setRetry(n=>n+1)},60000);return ()=>clearInterval(timer)},[data]);
 const today=data?.today??currentDate(),first=new Date(month+'-01T00:00:00Z'),count=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
 const rows=data?.days.filter(d=>d.date.startsWith(month))??[],values=rows.filter(d=>d.value!==null),total=values.reduce((n,d)=>n+d.value!,0),byDate=new Map(rows.map(d=>[d.date,d]));
 const detail=rows.find(d=>d.date===selected),minimum=data?.days[0]?.date.slice(0,7)??today.slice(0,7);
 const changeMonth=(delta:number)=>{const date=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+delta,1));setMonth(date.toISOString().slice(0,7));setSelected(null)};
 const money=(value:number)=>hidden?'••••':signed(value);
 const label=new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
 return <section className="dailyreturns" aria-label="Daily returns"><div className="dailyreturnsheading"><div><h2>Daily returns</h2><p>00:00 → 24:00 · Beijing time · CNY</p></div><div className="calendarnav"><Button variant="ghost" size="icon" aria-label="Previous month" disabled={month<=minimum} onClick={()=>changeMonth(-1)}><ChevronLeft/></Button><span>{label}</span><Button variant="ghost" size="icon" aria-label="Next month" disabled={month>=today.slice(0,7)} onClick={()=>changeMonth(1)}><ChevronRight/></Button></div></div>
 <div className="calendartotal"><span>{values.length?'Month to date':'Monthly total'}</span><strong className={values.length?(total>=0?'up':'down'):''}>{values.length?money(total):'—'}</strong><small>{values.length} completed days</small></div>
 {error&&<p className="error" role="alert">{interfaceText(error)} <Button variant="ghost" onClick={()=>setRetry(n=>n+1)}>Retry</Button></p>}
 {loading&&!data?<p role="status" className="emptytext">Loading daily valuations…</p>:<div className="returnscalendar">{week.map(day=><span className="calendarweekday" key={day}>{day}</span>)}{Array.from({length:first.getUTCDay()},(_,i)=><span key={'blank'+i} aria-hidden="true"/>)}{Array.from({length:count},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'),row=byDate.get(date),available=row?.value!==null&&row?.value!==undefined,value=row?.value;return <Button variant="ghost" key={date} className={`calendarday ${available?(value!>0?'daygain':value!<0?'dayloss':'dayzero'):'dayempty'}`} disabled={!available} aria-pressed={selected===date} aria-label={`${date}: ${available?money(value!)+' CNY':date>=today?'Pending':'No complete valuation'}`} onClick={()=>setSelected(date)}><span>{i+1}</span><strong><span className="calendaramountfull">{available?money(value!):'—'}</span><span className="calendaramountcompact" aria-hidden="true">{available?(hidden?'••••':compactAmount.format(value!)):'—'}</span></strong></Button>})}</div>}
 {detail&&detail.value!==null&&<div className="calendardetail" role="status"><strong>{detail.date} · Price P&amp;L {money(detail.value)}</strong><div className="dailypriceitems">{detail.items?.map(item=><div key={item.symbol+item.name}><span>{/\p{Script=Han}/u.test(item.name)?item.symbol:item.name}</span><small>{item.openingPrice===null?'Bought today':formatAmount(item.openingPrice,'CNY',4)} → {formatAmount(item.closingPrice,'CNY',4)} {item.currency}</small><b className={item.value>=0?'up':'down'}>{money(item.value)}</b></div>)}</div></div>}
 <p className="calendarfootnote">Price movement × holdings, with trades calculated from execution prices. Cash flows, fees and FX movements are excluded; foreign profits use the closing exchange rate. Today is available after 24:00; incomplete days show —.</p></section>;
}
