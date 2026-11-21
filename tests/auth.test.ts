import assert from 'node:assert/strict';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSession,validSession,readSession,hashPassword,verifyPassword,authenticate,requireSession,revokeSession,refreshRememberedSession,sessionSeconds,sessionCookieHeader} from '../src/server/auth';
import {insertUser,allowLogin} from '../src/server/identity-store';
import {checkOrigin,checkRequestOrigin} from '../src/server/http';
import {readState,saveState,exportHistory,applyMutation} from '../src/server/storage';
import {GET as portfolioGet,POST as portfolioPost} from '../src/app/api/portfolio/route';
import {GET as backupGet} from '../src/app/api/backup/route';
import {GET as historyGet} from '../src/app/api/history/route';
import {GET as exportGet} from '../src/app/api/export/route';
import {GET as assistantGet} from '../src/app/api/assistant/route';
import {GET as pricesGet} from '../src/app/api/prices/route';
import {GET as cronGet} from '../src/app/api/cron/valuations/route';
import {POST as login,DELETE as logout,GET as sessionGet} from '../src/app/api/auth/route';

async function main(){
 process.env.PORTFOLIO_DATA_DIR=mkdtempSync(join(tmpdir(),'portfolio-auth-'));process.env.PORTFOLIO_STORAGE='local';process.env.PORTFOLIO_AUTH_ENABLED='1';process.env.PORTFOLIO_SESSION_SECRET='x'.repeat(48);
 const secret='test-password',hash=await hashPassword(secret),hash2=await hashPassword(secret);
 assert.notEqual(hash,hash2);assert.ok(!hash.includes(secret));assert.ok(await verifyPassword(secret,hash));assert.ok(!await verifyPassword('wrong',hash));
 for(const id of ['test_alice','test_bob'])await insertUser({id,username:id,passwordHash:hash});
 assert.equal((await authenticate('test_alice',secret))?.id,'test_alice');assert.equal(await authenticate('test_alice','wrong'),null);assert.equal(await authenticate('unknown',secret),null);
 const now=Date.now(),a=await createSession({id:'test_alice',username:'test_alice'},true,now),b=await createSession({id:'test_bob',username:'test_bob'},false,now);
 assert.ok(await validSession(a));assert.ok(!await validSession(undefined));assert.ok(!await validSession(a+'x'));assert.ok(!await validSession(a,now+91*86400000));assert.ok(!await validSession(b,now+2*86400000));
 assert.ok(sessionCookieHeader(a,true).includes('Max-Age=7776000'));assert.ok(!sessionCookieHeader(b,false).includes('Max-Age'));assert.ok(sessionCookieHeader(a,true).includes('HttpOnly'));
 const user=await readSession(a,now+50*86400000);assert.ok(user);assert.ok(await refreshRememberedSession(a,user!,now+50*86400000));assert.ok(await validSession(a,now+100*86400000));assert.equal((await readSession(a))?.expiresAt,now+140*86400000);
 const base='http://localhost',request=(path:string,token?:string,method='GET',data?:unknown)=>new Request(base+path,{method,headers:{...(token?{cookie:'portfolio_session='+token}:{}),...(method!=='GET'?{origin:base,'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
 await assert.rejects(()=>requireSession(request('/api/portfolio')));assert.equal((await requireSession(request('/api/portfolio',a)))?.id,'test_alice');
 await assert.rejects(()=>checkOrigin(request('/api/portfolio')));await assert.rejects(()=>readState());
 for(const headers of [{host:'localhost',origin:'http://evil.example'},{host:'evil.example',origin:base},{host:'localhost'}] as Record<string,string>[])assert.throws(()=>checkRequestOrigin(new Request(base+'/api/portfolio',{method:'POST',headers})));
 assert.equal((await cronGet(request('/api/cron/valuations'))).status,401);
 const state=await readState('test_alice');applyMutation(state,{action:'account',account:{id:'private-account',name:'ALICE_PRIVATE',note:'private'}});await saveState(state,state.revision,false,{action:'account',account:state.accounts[0]},[],'test_alice');
 assert.equal((await readState('test_bob')).accounts.length,0);assert.equal((await readState('test_alice')).accounts[0].name,'ALICE_PRIVATE');assert.equal((await exportHistory('test_bob')).length,0);
 for(const [path,get] of [['/api/portfolio',portfolioGet],['/api/backup',backupGet],['/api/history',historyGet],['/api/export',exportGet],['/api/assistant',assistantGet],['/api/prices',pricesGet]] as const){assert.equal((await get(request(path))).status,401);const response=await get(request(path+'?userId=test_alice',b));assert.equal(response.status,200);assert.ok(!(await response.text()).includes('ALICE_PRIVATE'),path+' leaked another user')}
 const operation={action:'account',account:{id:'private-account',name:'BOB_PRIVATE',note:''}};
 assert.equal((await portfolioPost(request('/api/portfolio',b,'POST',{revision:0,mutation:operation,userId:'test_alice'}))).status,200);
 assert.equal((await readState('test_alice')).accounts[0].name,'ALICE_PRIVATE');assert.equal((await readState('test_bob')).accounts[0].name,'BOB_PRIVATE');
 const signed=await login(request('/api/auth',undefined,'POST',{username:'test_alice',password:secret,remember:true}));assert.equal(signed.status,200);assert.ok(signed.headers.get('set-cookie')?.includes('Max-Age=7776000'));
 const token=signed.headers.get('set-cookie')!.split(';')[0].split('=')[1];assert.equal((await sessionGet(request('/api/auth',token))).status,200);assert.equal((await logout(request('/api/auth',token,'DELETE'))).status,200);assert.ok(!await validSession(token));
 assert.equal((await login(request('/api/auth',undefined,'POST',{username:'test_alice',password:'wrong'}))).status,401);
 assert.equal((await login(request('/api/auth',undefined,'POST',{code:secret}))).status,400);
 for(let i=0;i<10;i++)assert.ok(await allowLogin('test-throttle'));assert.equal(await allowLogin('test-throttle'),false);
 await revokeSession(b);assert.ok(!await validSession(b));assert.equal((await portfolioGet(request('/api/portfolio',b))).status,401);
 process.env.PORTFOLIO_SESSION_SECRET='y'.repeat(48);assert.ok(!await validSession(a));
 assert.equal(sessionSeconds,90*86400);
 console.log('Authentication checks passed: salted passwords, independent users, all private APIs, forged owner rejection, remembered/temporary sessions, renewal, logout revocation and durable login throttling.');
}
void main().catch(error=>{console.error(error);process.exitCode=1});
