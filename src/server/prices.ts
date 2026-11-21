import type {Position,PortfolioState} from '@/types/portfolio';
import type {PriceSeries,PricePoint,HistoricalPortfolio} from '@/types/prices';
import {stockCode} from './quotes';
import {readPriceCache,savePriceCache} from './storage';
export const priceRanges=['1H','1D','1W','1M','3M','YTD','1Y','ALL'];
const DAY=86400000;
async function request(url:string){const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('历史行情接口暂不可用');return r.json()}
export function parseEastMoney(data:unknown,intraday=false):PricePoint[]{const q=data as {data?:{klines?:string[]}};return (q.data?.klines||[]).map(row=>{const f=row.split(',');return {time:Date.parse(f[0]+(intraday?':00+08:00':'T00:00:00Z')),price:Number(f[2])}}).filter(p=>Number.isFinite(p.time)&&Number.isFinite(p.price)&&p.price>0).sort((a,b)=>a.time-b.time)}
export function parseCoinHistory(data:unknown):PricePoint[]{const q=data as {price?:unknown[]};if(!Array.isArray(q.price))return [];return q.price.filter((r):r is [number,number]=>Array.isArray(r)&&r.length>=2&&typeof r[0]==='number'&&typeof r[1]==='number'&&Number.isFinite(r[0])&&Number.isFinite(r[1])&&r[1]>0).map(([time,price])=>({time,price})).sort((a,b)=>a.time-b.time)}
function market(p:Position){if(p.category==='美股')return (['ORCL','NYSE'].includes(p.symbol)?'106.':'105.')+p.symbol;return (stockCode(p).startsWith('sh')?'1.':'0.')+p.symbol}
const pending=new Map<string,Promise<PriceSeries>>();
export async function priceSeries(p:Position,intraday:boolean):Promise<PriceSeries>{
 const key=[p.category,p.symbol,intraday?'intraday':'daily'].join(':');const cache=await readPriceCache(key);if(cache&&Date.now()-cache.fetchedAt<300000)return cache.series;if(pending.has(key))return pending.get(key)!;
 const task=(async()=>{let result:PriceSeries;
 if(p.category==='加密货币'){
  const ids:Record<string,number>={BTC:90,ETH:80,ADA:257};let id=ids[p.symbol];
  if(!id){const list=await request('https://api.coinlore.net/api/tickers/?start=0&limit=100') as {data:{id:string;symbol:string}[]};const matches=list.data.filter(r=>r.symbol===p.symbol);if(matches.length!==1)throw new Error('暂未找到此币的历史价格');id=Number(matches[0].id)}
  result={points:parseCoinHistory(await request(`https://ajax.coinlore.com/ajax/hdatav2/?coin=${id}&s=undefined&e=undefined`)),currency:'USD',source:'CoinLore · 美元历史价格'};
 }else{
  let points=parseEastMoney(await request(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${market(p)}&klt=${intraday?5:101}&fqt=0&beg=${intraday?new Date(Date.now()-10*DAY).toISOString().slice(0,10).replaceAll('-',''):'0'}&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53`),intraday);
  if(points.length<2&&!intraday&&p.category==='美股')points=parseEastMoney(await request(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=106.${p.symbol}&klt=101&fqt=0&beg=0&end=20500101&fields1=f1,f2,f3,f4,f5,f6&fields2=f51,f52,f53`));
  result={points,currency:p.currency,source:`东方财富 · ${intraday?'5 分钟':'日线'}未复权价格`};
 }
 if(result.points.length<2)throw new Error('历史价格不足');await savePriceCache(key,result);return result;
 })();pending.set(key,task);try{return await task}catch(e){if(cache)return {...cache.series,source:cache.series.source+'（缓存）'};throw e}finally{pending.delete(key)}
}
export function rangeStart(range:string,now:number){if(range==='ALL')return 0;if(range==='YTD')return Date.parse(new Date(now+8*3600000).getUTCFullYear()+'-01-01T00:00:00+08:00');const spans:Record<string,number>={'1H':3600000,'1D':DAY,'1W':7*DAY,'1M':30*DAY,'3M':90*DAY,'1Y':365*DAY};return now-(spans[range]||30*DAY)}
export function combineHistory(state:PortfolioState,rows:Position[],data:Map<string,PriceSeries>,range:string,now=Date.now()):HistoricalPortfolio{
 const warnings:string[]=[],sources=[...new Set([...data.values()].map(s=>s.source))];
 const active=rows.filter(p=>p.quantity>0),assets=active.filter(p=>p.category!=='现金');
 for(const p of assets)if(!data.has(p.id))warnings.push(p.symbol+'：无法取得历史价格');
 for(const p of active)if(!(state.settings.rates[p.currency]>0))warnings.push(p.currency+'：缺少汇率');
 if(warnings.length)return {points:[],sources,warnings,range,availableFrom:null};
 const intraday=['1H','1D'].includes(range),bucket=intraday?300000:DAY,start=rangeStart(range,now);
 const histories=new Map<string,PricePoint[]>();
 for(const p of assets){const original=data.get(p.id)!;const rate=state.settings.rates[original.currency];if(!rate){warnings.push(original.currency+'：缺少历史计价换算汇率');continue};const map=new Map<number,number>();for(const point of original.points){if(point.time>now)continue;map.set(Math.floor(point.time/bucket)*bucket,point.price*rate)}histories.set(p.id,[...map].map(([time,price])=>({time,price})).sort((a,b)=>a.time-b.time))}
 if(warnings.length)return {points:[],sources,warnings,range,availableFrom:null};
 // Start when every asset has real history; forward-fill closed markets, never extrapolate before listing.
 const available=assets.length?Math.max(...assets.map(p=>histories.get(p.id)![0]?.time||now)):start;
 const from=Math.max(start,available);const times=new Set<number>([Math.floor(from/bucket)*bucket]);
 for(const list of histories.values())for(const point of list)if(point.time>=from&&point.time<=now)times.add(point.time);
 if(range==='ALL'&&assets.length===0){times.clear();times.add(now-DAY)}
 times.add(now);
 const sorted=[...times].sort((a,b)=>a-b),indices=new Map<string,number>(),cash=active.filter(p=>p.category==='现金').reduce((sum,p)=>sum+p.quantity*state.settings.rates[p.currency],0);
 const points:HistoricalPortfolio['points']=[];
 for(const time of sorted){let value=cash,complete=true;for(const p of assets){const list=histories.get(p.id)!;let i=indices.get(p.id)||0;while(i+1<list.length&&list[i+1].time<=time)i++;indices.set(p.id,i);if(!list[i]||list[i].time>time){complete=false;break}value+=p.quantity*(time===now?p.price*state.settings.rates[p.currency]:list[i].price)}if(complete)points.push({timestamp:new Date(time).toISOString(),valueCny:value})}
 return {points,sources,warnings,range,availableFrom:assets.length?new Date(available).toISOString():null};
}
export async function historicalPortfolio(state:PortfolioState,rows:Position[],range:string){const data=new Map<string,PriceSeries>(),assets=rows.filter(p=>p.category!=='现金'&&p.quantity>0);for(let i=0;i<assets.length;i+=4)await Promise.all(assets.slice(i,i+4).map(async p=>{try{data.set(p.id,await priceSeries(p,['1H','1D'].includes(range)))}catch{}}));return combineHistory(state,rows,data,range)}
