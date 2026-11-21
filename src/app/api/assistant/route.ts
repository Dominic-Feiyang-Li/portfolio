import {assistantConfigured,chatMessages,portfolioReply} from '@/server/assistant';
import {body,checkOrigin,failure,respond} from '@/server/http';
import {readState} from '@/server/storage';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
export async function GET(req:Request){try{const user=await checkOrigin(req);return respond({configured:assistantConfigured(),provider:'DeepSeek',skills:[]})}catch(error){return failure(error)}}
export async function POST(req:Request){
 try{
  const user=await checkOrigin(req);
  const input=await body(req),messages=chatMessages(input.messages);
  if(!assistantConfigured())return respond({error:'AI 助手尚未配置，请在服务端设置 DeepSeek 密钥'},503);
  const state=await readState(user?.id);
  return portfolioReply({state,messages,signal:req.signal,allowWrites:input.allowWrites===true,owner:user?.id,requestId:typeof input.requestId==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(input.requestId)?input.requestId:crypto.randomUUID()});
 }catch(error){return failure(error)}
}
