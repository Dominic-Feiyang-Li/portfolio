// Cloud verification is read-only and never prints private data or credentials.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
// API/CLI uploads must include binary public assets as well as source files.
// Check the uploaded build directory, not the currently live deployment.
for(const path of ['logo.png','icons/icon-192.png','icons/icon-512.png']){
 const file=new URL('../public/'+path,import.meta.url);
 const bytes=await readFile(file).catch(()=>assert.fail('Missing public/'+path+': include the entire public directory in the deployment upload'));
 assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Invalid PNG: public/'+path);
}
console.log('Public logo and app icons are present.');
if(process.env.VERCEL!=='1')process.exit(0);
const base=process.env.PORTFOLIO_ORIGIN,url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(base&&url&&key,'Cloud configuration is incomplete');
const r=await fetch(url+'/rest/v1/rpc/portfolio_rpc',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({action:'health',args:{}}),signal:AbortSignal.timeout(20000)});
assert.equal(r.status,200,'Cloud database connection failed');assert.deepEqual(await r.json(),{ready:true});
console.log('Read-only database health check passed.');
