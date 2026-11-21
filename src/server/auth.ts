import {randomBytes,createHmac,scrypt,timingSafeEqual} from 'node:crypto';
import {cloudEnabled} from './cloud';
import {findUser,findSession,insertSession,deleteSession,renewSession,type User,type SessionRecord} from './identity-store';
export const sessionCookie='portfolio_session';
export const sessionSeconds=90*24*60*60;
export const temporarySessionSeconds=24*60*60;
export function authEnabled(){return cloudEnabled()||process.env.PORTFOLIO_AUTH_ENABLED==='1'||!!process.env.PORTFOLIO_ACCESS_CODE_HASH}
function signingKey(){const secret=process.env.PORTFOLIO_SESSION_SECRET;if(!secret||secret.length<32)throw new Error('登录尚未配置');return secret}
function tokenHash(token:string){return createHmac('sha256',signingKey()).update(token).digest('hex')}
const derive=(password:string,salt:string)=>new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:16384,r:8,p:1},(error,key)=>error?reject(error):resolve(key)));
export async function hashPassword(password:string){if(password.length<6||password.length>256)throw new Error('密码长度应为6至256位');const salt=randomBytes(24).toString('hex');return 'scrypt-v1:'+salt+':'+(await derive(password,salt)).toString('hex')}
export async function verifyPassword(password:string,encoded:string){try{const [version,salt,hash,...rest]=encoded.split(':');if(rest.length||version!=='scrypt-v1'||!/^[a-f0-9]{48}$/.test(salt)||!/^[a-f0-9]{128}$/.test(hash))return false;return timingSafeEqual(await derive(password,salt),Buffer.from(hash,'hex'))}catch{return false}}
// Equalize expensive password work for unknown usernames; do not reveal which account exists.
const dummyHash='scrypt-v1:'+'0'.repeat(48)+':'+'0'.repeat(128);
export async function authenticate(username:string,password:string):Promise<User|null>{const user=await findUser(username);const valid=await verifyPassword(password,user?.passwordHash??dummyHash);return user&&valid?{id:user.id,username:user.username}:null}
export async function createSession(user:User,remember=true,now=Date.now()){const token=randomBytes(32).toString('base64url'),seconds=remember?sessionSeconds:temporarySessionSeconds;await insertSession(tokenHash(token),user.id,now+seconds*1000,remember);return token}
export async function readSession(token:string|undefined,now=Date.now()):Promise<SessionRecord|null>{if(!token||!/^[A-Za-z0-9_-]{43}$/.test(token))return null;return findSession(tokenHash(token),now)}
export async function validSession(token:string|undefined,now=Date.now()){return !!await readSession(token,now)}
export function requestToken(req:Request){return (req.headers.get('cookie')||'').split(';').map(v=>v.trim()).find(v=>v.startsWith(sessionCookie+'='))?.slice(sessionCookie.length+1)}
export async function requireSession(req:Request){if(!authEnabled())return undefined;const user=await readSession(requestToken(req));if(!user)throw new AuthError();return user}
export async function revokeSession(token:string|undefined){if(token&&/^[A-Za-z0-9_-]{43}$/.test(token))await deleteSession(tokenHash(token))}
export async function refreshRememberedSession(token:string,user:SessionRecord,now=Date.now()){if(!user.remember||user.expiresAt-now>sessionSeconds*1000/2)return false;await renewSession(tokenHash(token),now+sessionSeconds*1000);return true}
export function sessionCookieHeader(token:string,remember:boolean,clear=false){return `${sessionCookie}=${clear?'':token}; Path=/; HttpOnly; SameSite=Strict${cloudEnabled()?'; Secure':''}${clear?'; Max-Age=0':remember?'; Max-Age='+sessionSeconds:''}`}
export class AuthError extends Error {status=401;constructor(){super('请先登录')}}
