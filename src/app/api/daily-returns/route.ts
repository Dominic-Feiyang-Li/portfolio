import {actualPortfolio} from '@/server/actual-history';
import {portfolioToday} from '@/server/portfolio-today';
import {exportHistory,readState} from '@/server/storage';
import {checkOrigin,respond,failure} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(req:Request){try{
 const user=await checkOrigin(req),now=Date.now(),state=await readState(user?.id);
 if(new URL(req.url).searchParams.get('period')==='today'){
  const history=await exportHistory(user?.id);
  return respond({day:new Date(now+8*3600000).toISOString().slice(0,10),revision:state.revision,summary:await portfolioToday(state,history,now).catch(()=>null)});
 }
 const history=await actualPortfolio(state,'ALL',user?.id,now);
 return respond({days:history.priceReturns??[],today:new Date(now+8*3600000).toISOString().slice(0,10),currency:'CNY'});
}catch(error){return failure(error)}}
