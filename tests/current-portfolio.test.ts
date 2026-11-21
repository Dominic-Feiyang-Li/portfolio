import assert from 'node:assert/strict';
import {currentPortfolio,quotesNeedUpdate} from '../src/lib/current-portfolio';
import {emptyState} from '../src/lib/portfolio';

async function main(){
 const state=emptyState();state.settings.autoRefresh=false;state.settings.rates={CNY:1,USD:7,HKD:.9};
 state.positions=[{id:'btc',name:'Bitcoin',symbol:'BTC',category:'加密货币',currency:'USD',accountId:'a',quantity:1,price:123,previousClose:120,averageCost:100,provider:'auto',quoteAt:new Date().toISOString(),quoteSource:'test',quoteError:null}];
 let resolve!:(r:Response)=>void,settled=false;
 const pending=currentPortfolio(true,(async(url,init)=>{
  assert.equal(url,'/api/refresh?fresh=1');assert.equal(init?.method,'POST');assert.equal(init?.cache,'no-store');
  return new Promise<Response>(r=>{resolve=r});
 }) as typeof fetch).then(s=>{settled=true;return s});
 await Promise.resolve();assert.equal(settled,false,'The refresh request waits for its own response');
 resolve(Response.json(state));assert.equal((await pending).positions[0].price,123);
 const get=()=>currentPortfolio(true,(async()=>Response.json(state)) as typeof fetch);
 const now=Date.now();state.lastRefresh=new Date(now).toISOString();
 assert.equal(quotesNeedUpdate(state,now),false);
 assert.equal(quotesNeedUpdate(state,now+30000),true);
 state.positions[0].quoteError='Offline, previous price retained';assert.equal(quotesNeedUpdate(await get(),now),true);
 state.positions[0].quoteError=null;state.settings.fxError='FX offline';assert.equal(quotesNeedUpdate(await get(),now),true);
 state.settings.fxError=null;state.settings.rates.USD=0;assert.equal(quotesNeedUpdate(await get(),now),true);
 state.settings.rates.USD=7;state.positions[0].quoteAt=null;assert.equal(quotesNeedUpdate(await get(),now),true);
 state.positions[0].provider='manual';assert.equal((await get()).positions[0].price,123,'Explicit manual prices remain usable');
 state.positions=[];assert.equal((await get()).positions.length,0,'Empty portfolios can open without quotes');
 await assert.rejects(()=>currentPortfolio(true,(async()=>{throw new Error('offline')}) as typeof fetch),/offline/);
 await assert.rejects(()=>currentPortfolio(true,(async()=>Response.json({error:'Please sign in'},{status:401})) as typeof fetch),/Please sign in/);
 // The client must outlast the route's 60-second budget (vercel.json), rather
 // than abort valid cloud refreshes at the old 20-second deadline.
 const timeout=AbortSignal.timeout;
 let deadline=0;
 const controller=new AbortController();
 try{
  AbortSignal.timeout=(ms:number)=>{deadline=ms;return controller.signal};
  await currentPortfolio(true,(async(_url,init)=>{assert.equal(init?.signal,controller.signal);return Response.json(state)}) as typeof fetch);
  assert.equal(deadline,65000);
  controller.abort(new DOMException('deadline','TimeoutError'));
  await assert.rejects(()=>currentPortfolio(true,(async()=>{throw new DOMException('Fetch is aborted','AbortError')}) as typeof fetch),/Price update timed out/);
 }finally{AbortSignal.timeout=timeout}
 await assert.rejects(()=>currentPortfolio(true,(async()=>{throw new DOMException('Fetch is aborted','AbortError')}) as typeof fetch),/update was interrupted/);
 await assert.rejects(()=>currentPortfolio(true,(async()=>{throw new DOMException('deadline','TimeoutError')}) as typeof fetch),/Price update timed out/);
 await assert.rejects(()=>currentPortfolio(true,(async()=>{throw new TypeError('Load failed')}) as typeof fetch),/Check your connection and retry/);
 // Safari can also abort while reading the body, after headers have arrived.
 const interruptedBody=Response.json(state);interruptedBody.json=async()=>{throw new DOMException('Fetch is aborted','AbortError')};
 await assert.rejects(()=>currentPortfolio(true,(async()=>interruptedBody) as typeof fetch),/update was interrupted/);
 for(const status of [502,503,504])await assert.rejects(()=>currentPortfolio(true,(async()=>new Response('<html>Gateway error</html>',{status})) as typeof fetch),/price service.*retry/i);
 await assert.rejects(()=>currentPortfolio(true,(async()=>new Response('<html>Invalid response</html>')) as typeof fetch),/invalid response/);
 assert.equal((await get()).positions.length,0,'Retry succeeds after an interrupted request');
 console.log('Current portfolio: recent complete quotes are reused, partial updates keep the ledger available, and request failures are reported.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
