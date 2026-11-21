import {InputError,object,num} from './validation';
import {cloudEnabled} from './cloud';
import {authEnabled,requireSession} from './auth';
export function checkRequestOrigin(req:Request){
 const url=new URL(req.url),host=req.headers.get('host')||url.host;
 if(cloudEnabled()){
  const configured=process.env.PORTFOLIO_ORIGIN;if(!configured)throw new Error('云端访问地址尚未配置');
  const allowed=new URL(configured);if(allowed.protocol!=='https:'||host!==allowed.host)throw new InputError('请求地址不正确');
  const origin=req.headers.get('origin');if(origin&&origin!==allowed.origin)throw new InputError('请求来源不正确');
 }else{
  if(!['127.0.0.1','localhost','[::1]'].includes(new URL('http://'+host).hostname))throw new InputError('仅允许本机访问');
  const origin=req.headers.get('origin');if(origin&&new URL(origin).host!==host)throw new InputError('请求来源不正确');
 }
 if(req.headers.get('sec-fetch-site')==='cross-site')throw new InputError('请求来源不正确');
 if(authEnabled()&&!['GET','HEAD'].includes(req.method)&&!req.headers.get('origin'))throw new InputError('请求来源不正确');
}
export async function checkOrigin(req:Request){checkRequestOrigin(req);return requireSession(req)}
export async function body(req:Request){await checkOrigin(req);const text=await req.text();if(text.length>25_000_000)throw new InputError('文件过大，最多 25 MB');try{return object(JSON.parse(text))}catch(e){if(e instanceof InputError)throw e;throw new InputError('数据格式不正确')}}
export function revision(x:unknown){return num(x,'版本号')}
export function respond(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}})}
export function failure(e:unknown){const error=e as {status?:number;message?:string};return respond({error:error.status?error.message:'无法完成操作，请检查服务配置或稍后重试'},error.status||500)}
