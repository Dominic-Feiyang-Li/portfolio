'use client';
import {interfaceText} from '@/lib/labels';
import {useEffect,useId,useMemo,useRef,useState,type CSSProperties,type PointerEvent,type ReactNode} from 'react';
import {Button} from '@/components/ui/button';
import {nearestTimestampIndex,chartSegments,chartRangeStart,smoothChart} from '@/lib/chart';
import {formatAmount} from '@/lib/portfolio';
import type {Currency,Snapshot} from '@/types/portfolio';
import type {HistoricalPortfolio,ValuePoint} from '@/types/prices';
const ranges=['1W','1M','YTD','ALL'];
const names:Record<string,string>={'1W':'1W','1M':'1M',YTD:'YTD',ALL:'All'};
export function dateLabel(iso:string,full=false){return new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',...(full?{year:'numeric' as const}: {})}).format(new Date(iso))}
export default function HistoryChart({snapshots,hidden,summary}:{snapshots:Snapshot[];hidden:boolean;summary:(point:ValuePoint|null)=>ReactNode}){
 const currency:Currency='CNY',rate=1;
 const [range,setRange]=useState('1M'),[hover,setHover]=useState<number|null>(null),[data,setData]=useState<HistoricalPortfolio|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const rangeCache=useRef(new Map<string,HistoricalPortfolio>());
 const hintId=useId(),gradientId=useId(),dotsId=useId(),fadeId=useId(),fillId=useId();
 const [cursorX,setCursorX]=useState<number|null>(null);
 const frame=useRef<number|null>(null),pending=useRef<{index:number|null;x:number}|null>(null);
 const cancelFrame=()=>{if(frame.current!==null)cancelAnimationFrame(frame.current);frame.current=null;pending.current=null};
 useEffect(()=>()=>{if(frame.current!==null)cancelAnimationFrame(frame.current)},[]);
 useEffect(()=>{cancelFrame();setHover(null);setCursorX(null)},[range]);
 useEffect(()=>{const controller=new AbortController();setLoading(true);setError('');setData(current=>current?.range===range?current:rangeCache.current.get(range)??null);fetch('/api/prices?'+new URLSearchParams({range,metric:'actual'}),{cache:'no-store',signal:controller.signal}).then(async r=>{const body=await r.json();if(!r.ok)throw new Error(body.error||'Unable to load historical data');rangeCache.current.set(range,body);setData(body)}).catch(e=>{if(e.name!=='AbortError')setError(e.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return ()=>controller.abort()},[range,snapshots]);
 const rows=useMemo(()=>{const start=chartRangeStart(range,Date.now());const points=new Map((data?.range===range?data.points:[]).map(p=>[p.timestamp,p]));for(const p of (data?.range===range?[]:snapshots.slice(-1)))if(Date.parse(p.timestamp)>=start&&Date.parse(p.timestamp)<=Date.now())points.set(p.timestamp,{timestamp:p.timestamp,valueCny:p.valueCny});return [...points.values()].sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp))},[data,range,snapshots]);
 const {sampled,first,last,coords,linePath,areaPath,bridgePath,yAt,periodChange}=useMemo(()=>{
  const {sampled,bridges}=chartSegments(rows,data?.gapTimestamps);
  const values=rows.map(p=>p.valueCny/(rate||1));
  const lo=values.length?Math.min(...values):0,hi=values.length?Math.max(...values):0,span=hi-lo||1;
  const first=sampled[0]?Date.parse(sampled[0].timestamp):0,last=sampled.at(-1)?Date.parse(sampled.at(-1)!.timestamp):0;
  const yAt=(value:number)=>hi===lo?125:210-(value/(rate||1)-lo+span*.12)/(span*1.24)*175;
  const coords=sampled.map(p=>({x:last===first?450:20+(Date.parse(p.timestamp)-first)/(last-first)*860,y:yAt(p.valueCny)}));
  const curve=smoothChart(coords),bridgeStarts=new Set(bridges.map(([a])=>a));
  const edge=(s:typeof curve.segments[number])=>`M ${s.start.x} ${s.start.y} C ${s.c1.x} ${s.c1.y} ${s.c2.x} ${s.c2.y} ${s.end.x} ${s.end.y}`;
  const bridgePath=curve.segments.filter((_,i)=>bridgeStarts.has(i)).map(edge).join(' ');
  const linePath=curve.segments.filter((_,i)=>!bridgeStarts.has(i)).map(edge).join(' ');
  const areaPath=coords.length>1?curve.path+` L ${coords.at(-1)!.x} 240 L ${coords[0].x} 240 Z`:'';
  return {sampled,first,last,coords,linePath,areaPath,bridgePath,yAt,periodChange:values.length>1?values[values.length-1]-values[0]:0};
 },[rows,rate,data]);
 const markers=useMemo(()=>{
  if(!sampled.length)return [];
  const high=sampled.reduce((best,p,i)=>p.valueCny>sampled[best].valueCny?i:best,0),low=sampled.reduce((best,p,i)=>p.valueCny<sampled[best].valueCny?i:best,0);
  return [...new Set([high,low])].map(index=>({index,...coords[index],value:sampled[index].valueCny/(rate||1),below:index===low&&low!==high,align:index===high?'left':'right'}));
 },[sampled,coords,rate]);
 const trendColor=periodChange<0?'var(--down)':'var(--up)';
 const activeIndex=hover===null?null:Math.min(hover,rows.length-1);
 const active=activeIndex===null?null:rows[activeIndex];
 const activeCoord=active?{x:last===first?450:20+(Date.parse(active.timestamp)-first)/(last-first||1)*860,y:yAt(active.valueCny)}:null;
 const displayed=active||rows.at(-1),displayValue=displayed?displayed.valueCny/(rate||1):null;
 const number=(n:number)=>formatAmount(n,currency,2);
 const clearInspection=()=>{cancelFrame();setHover(null);setCursorX(null)};
 const inspect=(event:PointerEvent<SVGSVGElement>,immediate=false)=>{
  const rect=event.currentTarget.getBoundingClientRect();
  const fraction=Math.max(0,Math.min(1,((event.clientX-rect.left)/rect.width*920-20)/860));
  const index=nearestTimestampIndex(rows,first+fraction*(last-first));
  if(immediate){cancelFrame();setHover(index);setCursorX(20+fraction*860);return}
  pending.current={index,x:20+fraction*860};
  if(frame.current===null)frame.current=requestAnimationFrame(()=>{if(pending.current){setHover(pending.current.index);setCursorX(pending.current.x)}frame.current=null});
 };


 return <>{summary(active??null)}<div className="history simplehistory" data-metric="value" style={{'--trend':trendColor} as CSSProperties}>
 <div className="chartreset">{active&&<Button variant="ghost" size="sm" onClick={clearInspection}>Latest</Button>}</div>
 <p id={hintId} className="sr-only">Tap or drag to inspect dates and values. Use arrow keys to move between points, Home / End for the first / last point, and Escape for the latest value.</p>
 <div className="chartcanvas">{loading&&!rows.length?<div className="chartempty" role="status">Loading historical trades and prices…</div>:!sampled.length?<div className="chartempty">{error?interfaceText(error):'No verified valuations for this period'}</div>:<svg tabIndex={0}
 onKeyDown={e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();cancelFrame();setCursorX(null);setHover(current=>e.key==='Home'?0:e.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,(current??rows.length-1)+(e.key==='ArrowRight'?1:-1))))}if(e.key==='Escape'){cancelFrame();setHover(null);setCursorX(null)}}}
 onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);inspect(e,true)}}
 onPointerMove={e=>{if(e.pointerType==='mouse'||e.currentTarget.hasPointerCapture(e.pointerId))inspect(e)}}
 onPointerUp={e=>{inspect(e,true);if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId)}}
 onPointerCancel={()=>{cancelFrame();setHover(null);setCursorX(null)}}
 onPointerLeave={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId)){cancelFrame();setHover(null);setCursorX(null)}}}
 onContextMenu={e=>e.preventDefault()}
 onDragStart={e=>e.preventDefault()}
 preserveAspectRatio="none" viewBox="0 0 920 250" role="slider" aria-describedby={hintId} aria-label="Portfolio value chart. Use left and right arrow keys to inspect." aria-valuemin={0} aria-valuemax={Math.max(0,rows.length-1)} aria-valuenow={activeIndex??Math.max(0,rows.length-1)} aria-valuetext={displayed?`${dateLabel(displayed.timestamp,true)}, ${hidden?'Balances hidden':number(displayValue!)+' '+currency}`:'No data'}><defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="white" stopOpacity=".85"/><stop offset="100%" stopColor="white" stopOpacity="0"/></linearGradient><linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".12"/><stop offset="100%" stopColor="currentColor" stopOpacity="0"/></linearGradient><pattern id={dotsId} width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".8" fill="currentColor" fillOpacity=".30"/></pattern><mask id={fadeId}><rect width="920" height="250" fill={`url(#${gradientId})`}/></mask></defs><g>{coords.length>1&&<path d={areaPath} fill={`url(#${fillId})`} aria-hidden="true"/>}{coords.length>1&&<path d={areaPath} fill={`url(#${dotsId})`} mask={`url(#${fadeId})`} aria-hidden="true"/>}{bridgePath&&<path d={bridgePath} fill="none" stroke={trendColor} strokeOpacity=".65" strokeWidth="2.4" vectorEffect="non-scaling-stroke" aria-hidden="true"/>}{sampled.length>1&&<path d={linePath} fill="none" stroke={trendColor} strokeWidth="2.4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/>}</g>{markers.map(m=><line key={m.index} x1="20" x2="880" y1={m.y} y2={m.y} stroke="var(--muted-foreground)" strokeOpacity=".18" strokeWidth=".7" strokeDasharray="3 6" vectorEffect="non-scaling-stroke"/>)}{activeCoord&&<g className="chartcursor" pointerEvents="none"><line x1={activeCoord.x} x2={activeCoord.x} y1="30" y2="219" stroke="var(--muted-foreground)" strokeOpacity=".5"/><circle cx={activeCoord.x} cy={activeCoord.y} r="10" fill={trendColor} fillOpacity=".09"/><circle cx={activeCoord.x} cy={activeCoord.y} r="4" fill={trendColor} stroke="var(--background)" strokeWidth="2" vectorEffect="non-scaling-stroke"/></g>}</svg>}{!!sampled.length&&<div className="chartannotations" aria-hidden="true">{markers.map(m=><span key={m.index} className="chartannotation" data-below={m.below} data-align={m.align} style={{left:m.align==='left'?'2.2%':'95.6%',top:`${m.y/250*100}%`}}><strong>{hidden?'••••••':number(m.value)}</strong></span>)}</div>}</div>
 <div className="rangeselect" role="group" aria-label="Chart period">{ranges.map(r=><Button variant="ghost" key={r} onClick={()=>{clearInspection();setRange(r)}} className={range===r?'active':''} aria-pressed={range===r}>{names[r]}</Button>)}</div>
 {error&&!!rows.length&&<p className="chartdatawarning" role="status">Update pending. Showing previously loaded data.</p>}
 {!loading&&!!data?.warnings.length&&<p className="chartdatawarning" role="status">Lighter sections connect verified observations across unavailable data.</p>}
 <details className="chartmethod"><summary>Methodology</summary><p>Historical quantities and cash are reconstructed from actual trades and holding changes, then valued in CNY using historical prices and exchange rates. Saved valuations are retained. Lighter sections indicate unavailable data between verified observations; no intermediate values are generated. Current holdings are not projected into the past. Deposits and withdrawals are not investment returns. {data?.warnings.map(interfaceText).join('; ')}</p></details>
 </div></>
}
