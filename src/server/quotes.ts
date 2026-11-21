import type {Position,Rates} from '@/types/portfolio';
import {readState,saveQuoteState,takeSnapshot,ConflictError} from './storage';
import {InputError} from './validation';
interface Quote {price:number;previousClose:number;source:string;at:string}
async function request(url:string,timeout=2800,signal?:AbortSignal,cacheSeconds=30){const started=Date.now();try{const r=await fetch(url,{...(cacheSeconds===0?{cache:'no-store' as const}:{next:{revalidate:cacheSeconds}}),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(timeout)]):AbortSignal.timeout(timeout),headers:{'User-Agent':'PersonalPortfolio/1.0'}});if(!r.ok)throw new Error('HTTP '+r.status);return r}catch(e){if(!signal?.aborted)console.warn('quote_request_failed',{host:new URL(url).hostname,ms:Date.now()-started,reason:(e as Error).name});throw e}}

function positive(x:unknown){const v=Number(x);if(!Number.isFinite(v)||v<=0)throw new Error('行情未返回有效价格');return v}
export function stockCode(p:Pick<Position,'symbol'|'category'>){if(p.category==='美股'){if(!/^[A-Z][A-Z0-9.\-]{0,15}$/.test(p.symbol))throw new InputError('美股代码不正确');return 'us'+p.symbol}if(!/^\d{6}$/.test(p.symbol))throw new InputError('A股 / ETF 使用六位代码');const prefix=/^(5|6|9)/.test(p.symbol)?'sh':/^(4|8)/.test(p.symbol)?'bj':'sz';return prefix+p.symbol}
export function parseStocks(text:string){const result:Record<string,Quote>={};for(const match of text.matchAll(/v_([A-Za-z0-9.\-]+)="([^"]*)"/g)){const f=match[2].split('~');try{result[match[1]]={price:positive(f[3]),previousClose:positive(f[4]),source:`腾讯 · ${f[30]||'延时行情'}`,at:new Date().toISOString()}}catch{}}return result}
async function stockQuotes(rows:Position[],signal:AbortSignal,fresh:boolean){if(!rows.length)return {};const codes=[...new Set(rows.map(stockCode))];const results:Record<string,Quote>={};await Promise.allSettled(Array.from({length:Math.ceil(codes.length/80)},async(_,i)=>{const r=await request('https://qt.gtimg.cn/q='+codes.slice(i*80,i*80+80).join(','),2800,signal,fresh?0:30);const text=new TextDecoder('gb18030').decode(await r.arrayBuffer());Object.assign(results,parseStocks(text))}));return results}
interface CoinLoreRow {id:string;symbol:string;name:string;nameid:string;price_usd:string;percent_change_24h:string}
interface CoinLorePage {data:CoinLoreRow[];info:{time:number;coins_num:number}}
const coinCache=new Map<number,{expires:number;page:CoinLorePage}>();
const normalCoinName=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const coinKey=(p:Pick<Position,'symbol'|'name'>)=>p.symbol+':'+normalCoinName(p.name);
// Identity metadata only; fresh entries always fetch prices again.
const coinIds=new Map([['BTC:bitcoin','90'],['BTC:btc','90'],['ETH:ethereum','80'],['ETH:eth','80']]);
export function parseCoinLore(row:CoinLoreRow,time:number):Quote {
 const price=positive(row.price_usd),change=Number(row.percent_change_24h);
 if(row.percent_change_24h===''||!Number.isFinite(change)||change<=-100)throw new Error('24h 行情数据不完整');
 if(!Number.isFinite(time)||time<=0||time*1000>Date.now()+300000||Date.now()-time*1000>900000)throw new Error('行情时间过期');
 return {price,previousClose:positive(price/(1+change/100)),source:'CoinLore · USD/24h',at:new Date(time*1000).toISOString()};
}
export function convertUsdQuote(quote:Quote,currency:Position['currency'],rates:Rates):Quote {
 if(currency==='USD')return quote;
 if(rates.USD<=0||rates[currency]<=0)throw new InputError('缺少汇率，请先更新或设置汇率');
 const factor=rates.USD/rates[currency];
 return {...quote,price:quote.price*factor,previousClose:quote.previousClose*factor,source:`${quote.source} · 换算 ${currency}`};
}
async function coinPage(start:number,signal:AbortSignal,fresh:boolean):Promise<CoinLorePage>{
 const cached=coinCache.get(start);if(!fresh&&cached&&cached.expires>Date.now())return cached.page;
 const response=await request(`https://api.coinlore.net/api/tickers/?start=${start}&limit=100`,2200,signal,fresh?0:30),page=await response.json() as CoinLorePage;
 if(!Array.isArray(page.data)||!page.info||!Number.isFinite(page.info.time))throw new Error('行情格式错误');
 coinCache.set(start,{expires:Date.now()+30000,page});return page;
}
async function coinLoreQuotes(rows:Position[],signal:AbortSignal,fresh:boolean):Promise<Map<string,Quote>>{
 const result=new Map<string,Quote>();if(!rows.length)return result;
 const collect=(page:CoinLorePage)=>{for(const p of rows){const candidates=page.data.filter(r=>r.symbol===p.symbol),coin=candidates.length===1?candidates[0]:candidates.find(r=>normalCoinName(r.name)===normalCoinName(p.name)||normalCoinName(r.nameid)===normalCoinName(p.name));if(coin){try{result.set(p.id,parseCoinLore(coin,page.info.time));coinIds.set(coinKey(p),coin.id)}catch{}}}};
 const known=rows.filter(p=>coinIds.has(coinKey(p)));
 const batch=async()=>{
  if(!known.length)return;
  const ids=[...new Set(known.map(p=>coinIds.get(coinKey(p))!))];
  const response=await request('https://api.coinlore.net/api/ticker/?id='+ids.join(','),2200,signal,fresh?0:30);
  const data=await response.json() as CoinLoreRow[];
  // There is no per-coin timestamp here. Check supplier response freshness and
  // label this as response time, rather than inventing a market quote time.
  const time=Date.parse(response.headers.get('date')??'')/1000,age=Number(response.headers.get('age')??0);
  if(!Array.isArray(data)||!Number.isFinite(time)||!Number.isFinite(age)||age<0||age>900)throw new Error('行情时间过期');
  for(const p of known){const coin=data.find(c=>c.id===coinIds.get(coinKey(p))&&c.symbol===p.symbol);if(coin){try{result.set(p.id,{...parseCoinLore(coin,time),source:'CoinLore · USD/24h · response time'})}catch{}}}
 };
 await Promise.allSettled([batch(),...(known.length<rows.length?[(async()=>collect(await coinPage(0,signal,fresh)))()]:[])]);
 if(rows.every(p=>result.has(p.id))||signal.aborted)return result;
 // Common holdings need one shared request, rather than a lookup per account.
 if(known.length===rows.length)try{collect(await coinPage(0,signal,fresh))}catch{}
 if(rows.every(p=>result.has(p.id))||signal.aborted)return result;
 await Promise.allSettled([100,200,300,400].map(async start=>collect(await coinPage(start,signal,fresh))));
 return result;
}
function delayedBackup(primary:Promise<Quote>,backup:()=>Promise<Quote>,signal:AbortSignal):Promise<Quote>{
 return new Promise((resolve,reject)=>{
  let started=false;
  const clear=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancel)};
  const cancel=()=>{clear();reject(signal.reason??new Error('aborted'))};
  const start=()=>{if(started)return;started=true;clear();if(signal.aborted){cancel();return}backup().then(resolve,reject)};
  const timer=setTimeout(start,350);
  signal.addEventListener('abort',cancel,{once:true});
  if(signal.aborted){cancel();return}
  primary.then(()=>{if(!started){clear();reject(new Error('Primary quote available'))}},start);
 });
}
async function exchangeQuote(p:Position,signal:AbortSignal,fresh:boolean):Promise<Quote>{
 const symbol=p.symbol;if(!/^[A-Z0-9]{2,15}$/.test(symbol))throw new Error('加密货币代码不正确');
 return Promise.any([
  (async()=>{const r=await request(`https://api.exchange.coinbase.com/products/${symbol}-USD/stats`,2800,signal,fresh?0:30);const q=await r.json();return {price:positive(q.last),previousClose:positive(q.open),source:'Coinbase · 24h',at:new Date().toISOString()}})(),
  (async()=>{const pair=(symbol==='BTC'?'XBT':symbol)+'USD';const r=await request('https://api.kraken.com/0/public/Ticker?pair='+pair,2800,signal,fresh?0:30);const q=await r.json();if(q.error?.length)throw new Error('不支持此交易对');const v=Object.values(q.result||{})[0] as {c:string[];o:string}|undefined;if(!v)throw new Error('行情不可用');return {price:positive(v.c[0]),previousClose:positive(v.o),source:'Kraken · UTC 日内',at:new Date().toISOString()}})()
 ]);
}
async function forex(signal:AbortSignal,fresh:boolean):Promise<{rates:Rates;date:string}>{const r=await request('https://api.frankfurter.dev/v2/rates?base=USD&quotes=CNY,HKD',1800,signal,fresh?0:3600);const rows=await r.json() as {quote:string;rate:number;date:string}[];const cny=rows.find(r=>r.quote==='CNY'),hkd=rows.find(r=>r.quote==='HKD');if(!cny||!hkd)throw new Error('汇率暂不可用');return {rates:{CNY:1,USD:positive(cny.rate),HKD:positive(cny.rate)/positive(hkd.rate)},date:cny.date}}
const refreshes=new Map<string,{pending:Promise<Awaited<ReturnType<typeof readState>>>|null;lastAttempt:number;signature:string;fresh?:boolean}>();
export async function refresh(userId?:string,fresh=false){
 const key=userId??'local',item=refreshes.get(key)??{pending:null,lastAttempt:0,signature:''};refreshes.set(key,item);
 if(item.pending){if(!fresh||item.fresh)return item.pending;await item.pending;return refresh(userId,true)}
 item.fresh=fresh;
 item.pending=(async()=>{const initial=await readState(userId),signature=JSON.stringify(initial.positions.filter(p=>p.provider==='auto').map(p=>[p.id,p.symbol,p.currency,p.category]));if(!fresh&&Date.now()-item.lastAttempt<30000&&signature===item.signature)return initial;item.lastAttempt=Date.now();item.signature=signature;return perform(initial,userId,fresh)})().finally(()=>{item.pending=null});
 return item.pending;
}
async function perform(initial:Awaited<ReturnType<typeof readState>>,userId:string|undefined,fresh:boolean){const controller=new AbortController(),signal=controller.signal,timer=setTimeout(()=>controller.abort(),5000);const quotes=new Map<string,Quote>();const errors=new Map<string,string>();const stocks=initial.positions.filter(p=>p.provider==='auto'&&(p.category==='美股'||p.category==='A股 / ETF'));const cryptos=initial.positions.filter(p=>p.provider==='auto'&&p.category==='加密货币');
 const stockTask=(async()=>{try{const values=await stockQuotes(stocks,signal,fresh);for(const p of stocks){const q=values[stockCode(p)];if(q)quotes.set(p.id,q);else errors.set(p.id,'未找到行情，请检查代码')}}catch{for(const p of stocks)errors.set(p.id,'行情连接失败，保留上次价格')}})();
 const fxTask=initial.settings.autoFx?forex(signal,fresh):Promise.resolve(null);
 const cryptoTask=(async()=>{
  const primary=coinLoreQuotes(cryptos,signal,fresh);
  const unique=new Map<string,Promise<Quote>>();
  await Promise.allSettled(cryptos.map(async p=>{
   const key=p.symbol+':'+p.name;
   let task=unique.get(key);
   if(!task){const quote=primary.then(values=>{const q=values.get(p.id);if(!q)throw new Error('未找到行情');return q});task=Promise.any([quote,delayedBackup(quote,()=>exchangeQuote(p,signal,fresh),signal)]);unique.set(key,task)}
   try{quotes.set(p.id,await task)}catch{errors.set(p.id,'行情暂不可用，保留上次价格')}
  }));
 })();
 const [, ,fx]=await Promise.allSettled([stockTask,cryptoTask,fxTask]);
 clearTimeout(timer);controller.abort();
 const rates=fx.status==='fulfilled'&&fx.value?fx.value.rates:initial.settings.rates;
 for(const p of cryptos){const q=quotes.get(p.id);if(q){try{quotes.set(p.id,convertUsdQuote(q,p.currency,rates))}catch{quotes.delete(p.id);errors.set(p.id,'汇率不可用，保留上次价格')}}}
 for(let attempt=0;attempt<2;attempt++){
 const before=attempt===0?initial:await readState(userId),latest=structuredClone(before);
 for(const p of latest.positions){const original=initial.positions.find(x=>x.id===p.id);if(!original||original.symbol!==p.symbol||original.currency!==p.currency||original.category!==p.category||p.provider!=='auto'||p.quoteAt!==original.quoteAt||p.price!==original.price||p.previousClose!==original.previousClose){if(fresh&&p.provider==='auto'&&p.category!=='现金'&&p.quantity>0)p.quoteError='Holdings changed during the price update. Please retry.';continue}const quote=quotes.get(p.id);if(quote){p.price=quote.price;p.previousClose=quote.previousClose;p.quoteSource=quote.source;p.quoteAt=quote.at;p.quoteError=null}else if(errors.has(p.id))p.quoteError=errors.get(p.id)!}
 if(latest.settings.autoFx&&initial.settings.autoFx){if(fx.status==='fulfilled'&&fx.value){latest.settings.rates=fx.value.rates;latest.settings.fxDate=fx.value.date;latest.settings.fxSource='Frankfurter · 日汇率';latest.settings.fxError=null}else if(fx.status==='rejected')latest.settings.fxError='汇率连接失败，保留已有汇率'}
 latest.lastRefresh=new Date().toISOString();if(quotes.size||fx.status==='fulfilled'&&fx.value)takeSnapshot(latest,'行情更新');try{return await saveQuoteState(latest,before,userId)}catch(error){if(!(error instanceof ConflictError)||attempt===1)throw error}
 }
 throw new ConflictError();
}
