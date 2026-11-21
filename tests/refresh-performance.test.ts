import assert from 'node:assert/strict';
import {emptyState} from '../src/lib/portfolio';
import {applyMutation} from '../src/server/store';
import {refresh} from '../src/server/quotes';

const originalFetch=globalThis.fetch;
const keys=['PORTFOLIO_STORAGE','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'] as const;
const env=keys.map(key=>[key,process.env[key]] as const);
process.env.PORTFOLIO_STORAGE='supabase';
process.env.SUPABASE_URL='https://db.example.invalid';
process.env.SUPABASE_SERVICE_ROLE_KEY='test-only';

async function scenario(owner:string,conflicts=0){
 let remote=emptyState();remote.accounts=[{id:'a',name:'Test',note:''}];
 remote.settings={...remote.settings,currency:'CNY',autoFx:false,rates:{CNY:1,USD:7,HKD:.9}};
 remote.positions=[['BTC','Bitcoin'],['ETH','Ethereum'],['BTC','Bitcoin']].map(([symbol,name],i)=>({id:'p'+i,symbol,name,category:'加密货币',accountId:'a',currency:i===2?'CNY':'USD',quantity:1,price:1,previousClose:1,averageCost:1,provider:'auto',quoteAt:null,quoteSource:'',quoteError:null}));
 const actions:string[]=[],urls:string[]=[];
 globalThis.fetch=(async(input,init)=>{
  const url=String(input);urls.push(url);
  if(url.startsWith(process.env.SUPABASE_URL!)){
   const {action,args}=JSON.parse(String(init?.body));assert.equal(args.userId,owner);actions.push(action);
   if(action==='read')return Response.json(remote);
   assert.equal(action,'save');
   if(conflicts>0){
    conflicts--;
    remote=applyMutation(remote,{action:'trade',positionId:'p0',type:'买入',quantity:2,price:25,fee:0,settleCash:false,timestamp:new Date().toISOString()});remote.revision++;
   }
   if(args.revision!==remote.revision)return Response.json({message:'portfolio_conflict'},{status:409});
   assert.deepEqual(args.records,[],'A quote update must not manufacture trade audit records');
   remote=args.state;return Response.json(remote);
  }
  assert.ok(url.includes('/api/ticker/?id=90,80'),'One request covers known coins and deduplicates cross-currency BTC holdings');
  assert.equal(init?.cache,'no-store');
  return Response.json([{id:'90',symbol:'BTC',name:'Bitcoin',nameid:'bitcoin',price_usd:'100',percent_change_24h:'1'},{id:'80',symbol:'ETH',name:'Ethereum',nameid:'ethereum',price_usd:'50',percent_change_24h:'1'}],{headers:{Date:new Date().toUTCString()}});
 }) as typeof fetch;
 const value=await refresh(owner,true);
 assert.deepEqual(value.positions.map(p=>p.price),[100,50,700]);
 assert.ok(value.positions.every(p=>p.quoteAt&&!p.quoteError));
 assert.equal(urls.filter(u=>u.includes('coinlore')).length,1);
 return {value,actions};
}

async function main(){
 const fast=await scenario('fast_quotes');
 assert.deepEqual(fast.actions,['read','save'],'Normal cloud refresh uses two DB round trips instead of four, plus unchanged route authentication');
 const concurrent=await scenario('concurrent_trade',1);
 assert.deepEqual(concurrent.actions,['read','save','read','save']);
 assert.equal(concurrent.value.positions[0].quantity,3,'A trade committed during refresh survives quote rebasing');
 assert.equal(concurrent.value.ledger.length,1);
 assert.equal(concurrent.value.revision,2);
 await assert.rejects(()=>scenario('busy_trade',2),/数据已在另一页面更新/,'Repeated contention is bounded and never silently overwrites trades');
 console.log('Refresh performance: one batched quote request, no unused backups, two DB calls, concurrent-trade preservation and bounded retries passed.');
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>{globalThis.fetch=originalFetch;for(const [key,value] of env){if(value===undefined)delete process.env[key];else process.env[key]=value}});
