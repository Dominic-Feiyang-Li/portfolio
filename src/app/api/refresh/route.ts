import {refresh} from '@/server/quotes';
import {checkOrigin,respond,failure} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(req:Request){const started=Date.now();try{const user=await checkOrigin(req);const state=await refresh(user?.id,new URL(req.url).searchParams.get('fresh')==='1');const durationMs=Date.now()-started;if(durationMs>10000)console.warn('price_refresh_slow',{durationMs});return respond(state)}catch(e){console.error('price_refresh_failed',{durationMs:Date.now()-started,errorName:(e as Error)?.name});return failure(e)}}
