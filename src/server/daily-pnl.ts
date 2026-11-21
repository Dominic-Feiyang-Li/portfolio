import {chinaDayStart,dailyCandles} from '@/lib/pnl';
import type {Position,PortfolioState} from '@/types/portfolio';
import type {HistoricalPortfolio,PriceSeries,ValuePoint} from '@/types/prices';
import {readPriceCache,savePriceCache} from './storage';
import {priceSeries} from './prices';
const DAY=86400000;
async function request(url:string){const r=await fetch(url,{headers:{'User-Agent':'Portfolio/1.0'},signal:AbortSignal.timeout(10000),cache:'no-store'});if(!r.ok)throw new Error('历史行情接口 HTTP '+r.status);return r.json()}
export function pnlStart(range:string,now:number){const today=chinaDayStart(now),days:Record<string,number>={'1H':1,'1D':1,'1W':7,'1M':30,'3M':90,'1Y':365};return range==='ALL'?today-729*DAY:range==='YTD'?Date.parse(new Date(today+8*3600000).getUTCFullYear()+'-01-01T00:00:00+08:00'):today-((days[range]??30)-1)*DAY}

// Use the candle's opening price at its timestamp, and only expose its close
// at the end of the candle. A candle crossing midnight must not leak its future close.
export function parseYahooHistory(input:unknown,interval:number,mainland:boolean,now:number):PriceSeries{
 const d=input as {chart?:{result?:{meta:{currency:string};timestamp:number[];indicators:{quote:{open:(number|null)[];close:(number|null)[]}[]}}[]}};
 const row=d.chart?.result?.[0],quote=row?.indicators?.quote?.[0];
 if(!row||!quote||!['USD','CNY','HKD'].includes(row.meta.currency))throw new Error('缺少历史价格或计价币种');
 const points=new Map<number,number>();
 row.timestamp.forEach((seconds,i)=>{
  const time=seconds*1000,open=quote.open[i],close=quote.close[i];if(time>now)return;
  if(mainland){const date=new Date(time+8*3600000).toISOString().slice(0,10),end=Date.parse(date+'T15:00:00+08:00');if(close!==null&&Number.isFinite(close)&&close>0)points.set(Math.min(end,now),close)}
  else{
   if(open!==null&&Number.isFinite(open)&&open>0)points.set(time,open);
   if(time+interval<=now&&close!==null&&Number.isFinite(close)&&close>0)points.set(time+interval,close);
  }
 });
 return {points:[...points].map(([time,price])=>({time,price})).sort((a,b)=>a.time-b.time),currency:row.meta.currency as PriceSeries['currency'],source:`Yahoo Finance · ${mainland?'A股收盘价':interval===1800000?'30分钟行情':'1小时行情'}`};
}
const pending=new Map<string,Promise<PriceSeries>>();
export async function boundarySeries(p:Position,start:number,now:number){
 const mainland=p.category==='A股 / ETF',interval=now-start<58*DAY?'30m':'1h';
 const symbol=mainland?p.symbol+(/^[56]/.test(p.symbol)?'.SS':'.SZ'):p.category==='加密货币'?p.symbol+'-USD':p.symbol;
 const from=Math.max(start-14*DAY,now-729*DAY),key=`pnl-ohlc-v2:${symbol}:${interval}:${chinaDayStart(from)}`;
 const cache=await readPriceCache(key);if(cache&&Date.now()-cache.fetchedAt<300000)return cache.series;
 if(pending.has(key))return pending.get(key)!;
 const task=(async()=>{
  try{
   let result:PriceSeries;
   try{
    const q=new URLSearchParams({period1:String(Math.floor(from/1000)),period2:String(Math.floor(now/1000)),interval,includePrePost:'true'});
    result=parseYahooHistory(await request('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(symbol)+'?'+q),interval==='30m'?1800000:3600000,false,now);
    if(result.points.length<2)throw new Error('历史价格不足');
   }catch(error){
    if(mainland){const fallback=await priceSeries(p,false);result={...fallback,points:fallback.points.map(q=>({...q,time:q.time+7*3600000})),source:fallback.source+' · 北京时间15:00收盘'}}
    else if(p.category==='加密货币'){
     try{
     const points=new Map<number,number>();
     // Coinbase is a USD market, not a USDT proxy. Respect its 300-candle window.
     for(let t=Math.max(from,now-60*DAY);t<now;t+=299*3600000){
      const q=new URLSearchParams({granularity:'3600',start:new Date(t).toISOString(),end:new Date(Math.min(now,t+299*3600000)).toISOString()});
      const rows=await request(`https://api.exchange.coinbase.com/products/${encodeURIComponent(p.symbol)}-USD/candles?`+q);
      if(!Array.isArray(rows))throw error;
      for(const row of rows){const time=Number(row[0])*1000,open=Number(row[3]),close=Number(row[4]);if(time<=now&&open>0)points.set(time,open);if(time+3600000<=now&&close>0)points.set(time+3600000,close)}
     }
     result={points:[...points].map(([time,price])=>({time,price})).sort((a,b)=>a.time-b.time),currency:'USD',source:'Coinbase · USD 1小时行情（近60天）'};
     }catch{result=await priceSeries(p,false)}
    }else{const fallback=await priceSeries(p,false);result={...fallback,points:fallback.points.map(q=>({...q,time:q.time+21*3600000})),source:fallback.source+' · 美股收盘后估值'}}
   }
   if(result.points.length<2)throw new Error('历史价格不足');
   // A shorter fallback response must not erase verified older observations.
   if(cache?.series.currency===result.currency){
    const points=new Map(cache.series.points.map(p=>[p.time,p]));
    for(const point of result.points)points.set(point.time,point);
    result={...result,points:[...points.values()].sort((a,b)=>a.time-b.time)};
   }
   await savePriceCache(key,result);return result;
  }catch(error){if(cache)return {...cache.series,source:cache.series.source+'（缓存）'};throw error}
 })();pending.set(key,task);try{return await task}finally{pending.delete(key)}
}

export function reconstructBoundaries(state:PortfolioState,positions:Position[],series:Map<string,PriceSeries>,range:string,now:number,intraday=false):HistoricalPortfolio{
 const active=positions.filter(p=>p.quantity>0),assets=active.filter(p=>p.category!=='现金'),warnings:string[]=[];
 for(const p of assets)if(!series.get(p.id)?.points.length)warnings.push(p.name+'：历史行情暂不可用');
 for(const p of active)if(!(state.settings.rates[p.currency]>0))warnings.push(p.currency+'：缺少汇率');
 for(const q of series.values())if(!(state.settings.rates[q.currency]>0))warnings.push(q.currency+'：缺少汇率');
 const sources=[...new Set([...series.values()].map(q=>q.source))];
 if(warnings.length)return {points:[],range,warnings,sources,availableFrom:null};
 const available=assets.length?Math.max(...assets.map(p=>series.get(p.id)!.points[0].time)):pnlStart(range,now);
 const start=pnlStart(range,now),indices=new Map<string,number>(),points:ValuePoint[]=[];
 const cash=active.filter(p=>p.category==='现金').reduce((sum,p)=>sum+p.quantity*state.settings.rates[p.currency],0);
 const boundaries:number[]=[];for(let t=start;t<=now;t+=DAY)boundaries.push(t);if(boundaries.at(-1)!==now)boundaries.push(now);if(intraday){for(const item of series.values())for(const point of item.points)if(point.time>=start&&point.time<=now)boundaries.push(point.time);boundaries.sort((a,b)=>a-b)}
 for(const time of new Set(boundaries)){
  if(time<available)continue;
  let value=cash,complete=true;
  for(const p of assets){const q=series.get(p.id)!,list=q.points;let i=indices.get(p.id)??0;while(i+1<list.length&&list[i+1].time<=time)i++;indices.set(p.id,i);if(list[i].time>time){complete=false;break}value+=p.quantity*list[i].price*state.settings.rates[q.currency]}
  if(complete)points.push({timestamp:new Date(time).toISOString(),valueCny:value});
 }
 return {points,range,warnings,sources,availableFrom:new Date(available).toISOString()};
}
export async function portfolioTimeline(state:PortfolioState,positions:Position[],range:string,now:number,intraday=false){
 const series=new Map<string,PriceSeries>(),assets=positions.filter(p=>p.quantity>0&&p.category!=='现金'),start=pnlStart(range,now);
 for(let i=0;i<assets.length;i+=4)await Promise.all(assets.slice(i,i+4).map(async p=>{try{series.set(p.id,await boundarySeries(p,start,now))}catch{}}));
 return reconstructBoundaries(state,positions,series,range,now,intraday);
}
export async function historicalDailyPnl(state:PortfolioState,positions:Position[],range:string,_category:string,now=Date.now()):Promise<HistoricalPortfolio>{
 const asOf=Math.floor(now/1800000)*1800000;
 const history=await portfolioTimeline(state,positions,range,asOf,true);
 return {...history,dailyPnl:dailyCandles(history.points,range,asOf),sources:[...history.sources,'组合估值日内采样 K线 · 当前持仓数量及汇率']};
}
