import type {ValuePoint} from '@/types/prices';

// Search the full series so inspection stays precise even when the line is sampled.
export function nearestTimestampIndex(points:ValuePoint[],time:number) {
 if(!points.length)return null;
 let left=0,right=points.length-1;
 while(left<right){const middle=Math.floor((left+right)/2);if(Date.parse(points[middle].timestamp)<time)left=middle+1;else right=middle}
 if(left===0)return 0;
 return time-Date.parse(points[left-1].timestamp)<=Date.parse(points[left].timestamp)-time?left-1:left;
}

// Monotone cubic interpolation rounds corners without inventing peaks or troughs.
export function smoothChart(points:{x:number;y:number}[]) {
 const slopes=points.slice(1).map((p,i)=>(p.y-points[i].y)/(p.x-points[i].x||1));
 const tangents=points.map((_,i)=>{
  if(i===0)return slopes[0]||0;
  if(i===points.length-1)return slopes[i-1]||0;
  const a=slopes[i-1],b=slopes[i];
  return a*b<=0?0:2*a*b/(a+b);
 });
 const segments=points.slice(1).map((p,i)=>{
  const start=points[i],dx=(p.x-start.x)/3;
  return {start,end:p,c1:{x:start.x+dx,y:start.y+dx*tangents[i]},c2:{x:p.x-dx,y:p.y-dx*tangents[i+1]}};
 });
 const path=points.length?`M ${points[0].x} ${points[0].y}`+segments.map(s=>` C ${s.c1.x} ${s.c1.y} ${s.c2.x} ${s.c2.y} ${s.end.x} ${s.end.y}`).join(''):'';
 const at=(x:number)=>{
  if(!points.length)return {x,y:125};
  if(x<=points[0].x)return points[0];
  if(x>=points[points.length-1].x)return points[points.length-1];
  let lo=0,hi=segments.length-1;
  while(lo<hi){const mid=(lo+hi)>>1;if(segments[mid].end.x<x)lo=mid+1;else hi=mid}
  const s=segments[lo],t=(x-s.start.x)/(s.end.x-s.start.x||1),u=1-t;
  return {x,y:u*u*u*s.start.y+3*u*u*t*s.c1.y+3*u*t*t*s.c2.y+t*t*t*s.end.y};
 };
 return {path,at,segments};
}

// Split on explicit missing observations, never on elapsed time or sampling distance.
// Bridges connect verified endpoints visually but do not create inspectable values.
export function chartSegments(points:ValuePoint[],gapTimestamps:string[]=[],limit=600){
 const observed=new Set(points.map(p=>Date.parse(p.timestamp)));
 const gaps=[...new Set(gapTimestamps.map(t=>Date.parse(t)))].filter(t=>Number.isFinite(t)&&!observed.has(t)).sort((a,b)=>a-b);
 const stride=Math.max(1,Math.ceil(points.length/limit));
 const high=points.reduce((best,p,i)=>p.valueCny>(points[best]?.valueCny??-Infinity)?i:best,0);
 const low=points.reduce((best,p,i)=>p.valueCny<(points[best]?.valueCny??Infinity)?i:best,0);
 const groups:number[][]=[];let gap=0;
 points.forEach((p,i)=>{
  const time=Date.parse(p.timestamp),previous=Date.parse(points[i-1]?.timestamp??'');
  while(gap<gaps.length&&gaps[gap]<=previous)gap++;
  if(i===0||gap<gaps.length&&gaps[gap]<time)groups.push([]);
  groups.at(-1)!.push(i);
 });
 const sampled:ValuePoint[]=[],segments:number[][]=[],bridges:[number,number][]=[];
 for(const group of groups){
  const segment:number[]=[];
  for(const i of group)if(i===group[0]||i===group.at(-1)||i%stride===0||i===high||i===low){segment.push(sampled.length);sampled.push(points[i])}
  if(segments.length)bridges.push([segments.at(-1)!.at(-1)!,segment[0]]);
  segments.push(segment);
 }
 return {sampled,segments,bridges};
}

export function chartRangeStart(range:string,now:number){
 const day=86400000,today=Math.floor((now+8*3600000)/day)*day-8*3600000;
 return range==='ALL'?0:range==='YTD'?Date.parse(new Date(now+8*3600000).getUTCFullYear()+'-01-01T00:00:00+08:00'):today-(range==='1W'?7:30)*day;
}
