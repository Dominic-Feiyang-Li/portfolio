import type {ValuePoint,DailyPnlPoint} from '@/types/prices';

const DAY=86400000,OFFSET=8*3600000;
export const chinaDayStart=(time:number)=>Math.floor((time+OFFSET)/DAY)*DAY-OFFSET;
export type {DailyPnlPoint} from '@/types/prices';
// Boundary values are the last recorded valuation at or before 00:00 / 24:00.
// Never replace a missing opening boundary with the first valuation inside a day.
export function dailyPnl(input:ValuePoint[],range:string,now=Date.now()){
 const points=input.filter(p=>Number.isFinite(Date.parse(p.timestamp))&&Number.isFinite(p.valueCny)&&Date.parse(p.timestamp)<=now).slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 const today=chinaDayStart(now),days:Record<string,number>={'1H':1,'1D':1,'1W':7,'1M':30,'3M':90,'1Y':365};
 const start=range==='ALL'?chinaDayStart(points[0]?Date.parse(points[0].timestamp):now):range==='YTD'?Date.parse(new Date(today+OFFSET).getUTCFullYear()+'-01-01T00:00:00+08:00'):today-((days[range]??30)-1)*DAY;
 const result:DailyPnlPoint[]=[];
 let index=-1,missingDays=0;
 for(let day=start;day<=today;day+=DAY){
  while(index+1<points.length&&Date.parse(points[index+1].timestamp)<=day)index++;
  const opening=points[index],end=Math.min(day+DAY,now);
  while(index+1<points.length&&Date.parse(points[index+1].timestamp)<=end)index++;
  const closing=points[index];
  if(!opening||!closing||Date.parse(closing.timestamp)<=day){missingDays++;continue}
  result.push({timestamp:new Date(day).toISOString(),valueCny:closing.valueCny-opening.valueCny,openingValueCny:opening.valueCny,openingTimestamp:opening.timestamp,closingTimestamp:closing.timestamp,provisional:day===today&&now<day+DAY});
 }
 return {points:result,missingDays};
}

// A shared interval baseline keeps candles continuous instead of resetting each
// day's open to zero. High/low come from synchronized portfolio observations.
export function dailyCandles(input:ValuePoint[],range:string,now=Date.now()){
 const points=input.slice().sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp));
 const daily=dailyPnl(points,range,now).points;
 const baseline=daily[0]?.openingValueCny??0;
 return daily.map(day=>{
  const start=Date.parse(day.timestamp),end=Math.min(start+DAY,now);
  const samples=points.filter(p=>Date.parse(p.timestamp)>start&&Date.parse(p.timestamp)<=end).map(p=>p.valueCny);
  const close=day.openingValueCny+day.valueCny;
  return {...day,openCny:day.openingValueCny-baseline,closeCny:close-baseline,highCny:Math.max(day.openingValueCny,close,...samples)-baseline,lowCny:Math.min(day.openingValueCny,close,...samples)-baseline,source:'history' as const};
 });
}
