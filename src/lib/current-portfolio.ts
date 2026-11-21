import type {PortfolioState} from '@/types/portfolio';
import {hasMissingRates} from './portfolio';

export function quotesNeedUpdate(state:PortfolioState,now=Date.now()){
 const age=now-Date.parse(state.lastRefresh??'');
 return !(age>=0&&age<30000)||state.positions.some(p=>p.quantity>0&&p.provider==='auto'&&p.category!=='现金'&&(!p.quoteAt||!!p.quoteError))||
  (state.positions.length>0&&(hasMissingRates(state)||!state.settings.rates[state.settings.currency]||!!(state.settings.autoFx&&state.settings.fxError)));
}

export async function currentPortfolio(fresh:boolean,fetcher:typeof fetch=fetch):Promise<PortfolioState>{
 // The route has a 60-second server budget, including authentication and cloud
 // reads/writes. Allow the server to finish before the client gives up.
 const signal=AbortSignal.timeout(65000);
 let response:Response,state:PortfolioState&{error?:string};
 try{
  response=await fetcher('/api/refresh'+(fresh?'?fresh=1':''),{method:'POST',cache:'no-store',signal});
  if(response.status===401)throw new Error('Please sign in');
  if(response.status===504)throw new Error('The price service timed out. Please retry.');
  if(response.status===502||response.status===503)throw new Error('The price service is temporarily unavailable. Please retry.');
  state=await response.json();
 }catch(error){
  const name=(error as Error)?.name;
  if(signal.aborted||name==='TimeoutError')throw new Error('Price update timed out. Please retry.');
  if(name==='AbortError')throw new Error('The price update was interrupted. Please retry.');
  if(name==='SyntaxError')throw new Error('The price service returned an invalid response. Please retry.');
  if(name==='TypeError')throw new Error('Unable to connect to the price service. Check your connection and retry.');
  throw error;
 }
 if(!response.ok)throw new Error(state.error||'Unable to update prices');
 return state;
}
