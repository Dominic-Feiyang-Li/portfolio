import {timingSafeEqual} from 'node:crypto';
import {captureFixedValuation,BoundaryHistoryError} from '@/server/fixed-valuations';
import {listUsers} from '@/server/identity-store';
import {chinaDayStart} from '@/lib/pnl';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET,provided=Buffer.from(req.headers.get('authorization')??''),expected=Buffer.from('Bearer '+secret);
 if(!secret||secret.length<32||provided.length!==expected.length||!timingSafeEqual(provided,expected))return Response.json({error:'Unauthorized'},{status:401});
 const users=await listUsers(),target=chinaDayStart(Date.now()),result=[];
 for(const user of users)for(const offset of [0,1]){const boundary=target-offset*86400000;if(user.createdAt&&Date.parse(user.createdAt)>boundary){result.push({userId:user.id,timestamp:new Date(boundary).toISOString(),skipped:true});continue}try{result.push({userId:user.id,...await captureFixedValuation(user.id,boundary)})}catch(error){result.push(error instanceof BoundaryHistoryError?{userId:user.id,timestamp:new Date(boundary).toISOString(),skipped:true}:{userId:user.id,timestamp:new Date(boundary).toISOString(),error:'固定估值未完成，将保留既有数据'})}}
 return Response.json({target:new Date(target).toISOString(),result},{status:result.some(p=>'error' in p)?503:200,headers:{'Cache-Control':'no-store'}});
}
