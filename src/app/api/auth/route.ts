import {createHash} from 'node:crypto';
import {authenticate,createSession,requireSession,requestToken,revokeSession,refreshRememberedSession,sessionCookieHeader} from '@/server/auth';
import {allowLogin} from '@/server/identity-store';
import {checkRequestOrigin,respond,failure} from '@/server/http';
import {InputError} from '@/server/validation';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){try{checkRequestOrigin(req);const user=await requireSession(req);if(!user)return respond({user:null});const response=respond({user:{id:user.id,username:user.username}});const token=requestToken(req)!;if(await refreshRememberedSession(token,user))response.headers.set('Set-Cookie',sessionCookieHeader(token,true));return response}catch(e){return failure(e)}}
export async function POST(req:Request){try{
 checkRequestOrigin(req);
 const text=await req.text();if(text.length>2000)throw new InputError('登录信息过长');
 let data;try{data=JSON.parse(text)}catch{throw new InputError('登录信息不正确')}
 const username=typeof data.username==='string'?data.username.trim().toLowerCase():'';
 if(!/^[a-z0-9_]{3,32}$/.test(username)||typeof data.password!=='string'||!data.password||data.password.length>256||data.remember!==undefined&&typeof data.remember!=='boolean')throw new InputError('账号或密码格式不正确');
 const ip=process.env.VERCEL==='1'?(req.headers.get('x-vercel-forwarded-for')||'unknown').split(',')[0].trim():'local';
 const digest=(value:string)=>createHash('sha256').update(value+process.env.PORTFOLIO_SESSION_SECRET).digest('hex');
 if(!await allowLogin(digest('ip:'+ip),60)||!await allowLogin(digest('user:'+ip+':'+username)))return respond({error:'尝试次数过多，请15分钟后重试'},429);
 const user=await authenticate(username,data.password);if(!user)return respond({error:'账号或密码不正确'},401);
 const remember=data.remember!==false,token=await createSession(user,remember),old=requestToken(req);if(old)await revokeSession(old);
 const response=respond({ok:true,user});response.headers.set('Set-Cookie',sessionCookieHeader(token,remember));return response;
 }catch(e){return failure(e)}}
export async function DELETE(req:Request){try{checkRequestOrigin(req);await revokeSession(requestToken(req));const response=respond({ok:true});response.headers.set('Set-Cookie',sessionCookieHeader('',false,true));return response}catch(e){return failure(e)}}
