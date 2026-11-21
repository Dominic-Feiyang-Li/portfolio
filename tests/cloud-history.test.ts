import assert from 'node:assert/strict';
import {cloudHistory} from '../src/server/cloud';
const original=global.fetch;
const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_URL='https://example.invalid';process.env.SUPABASE_SERVICE_ROLE_KEY='test';
const entries=Array.from({length:61},(_,i)=>({id:String(i),type:i%2?'买入':'币币兑换'}));
async function main(){try{
 global.fetch=async(_url,init)=>{const b=JSON.parse(String(init?.body));assert.equal(b.action,'export-history');assert.equal(b.args.userId,'owner');return Response.json([...entries,{id:'adjustment',type:'修改持仓'}])};
 const first=await cloudHistory('owner',undefined,'trades');assert.equal(first.records.length,50);assert.equal(first.total,61);assert.equal(first.nextCursor,11);assert.equal(first.records[0].id,'60');
 entries.push({id:'61',type:'币币兑换'});
 const second=await cloudHistory('owner',first.nextCursor!,'trades');assert.equal(second.records.length,11);assert.equal(second.nextCursor,null);assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,61);
 console.log('Cloud trade history: swaps included on legacy RPC, owner isolation and stable pagination passed');
}finally{global.fetch=original;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SERVICE_ROLE_KEY;else process.env.SUPABASE_SERVICE_ROLE_KEY=oldKey}}
main().catch(e=>{console.error(e);process.exitCode=1});
