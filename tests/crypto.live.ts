import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyState} from '../src/lib/portfolio';
import {readState,saveState} from '../src/server/store';
import {refresh} from '../src/server/quotes';
async function main(){
const dir=mkdtempSync(join(tmpdir(),'portfolio-crypto-live-'));process.env.PORTFOLIO_DATA_DIR=dir;
try {
 const s=emptyState();s.accounts=[{id:'test',name:'隔离测试',note:''}];
 s.positions=[['BTC','Bitcoin'],['ETH','Ethereum'],['ADA','Cardano']].map(([symbol,name])=>({id:symbol,symbol,name,category:'加密货币' as const,accountId:'test',currency:'USD' as const,quantity:1,price:1,previousClose:1,averageCost:1,provider:'auto' as const,quoteAt:null,quoteSource:'手动价格',quoteError:'此前更新失败'}));
 saveState(s,readState().revision);
 const result=await refresh();
 for(const p of result.positions){assert.equal(p.quoteError,null);assert.ok(p.price>0&&p.price!==1);assert.ok(p.previousClose>0);assert.match(p.quoteSource,/CoinLore|Coinbase|Kraken/);assert.ok(p.quoteAt);console.log(`${p.symbol}: ${p.price} USD · ${p.quoteSource} · ${p.quoteAt}`)}
 assert.deepEqual(readState().positions,result.positions);console.log('Live crypto refresh and persistence passed');
}finally{rmSync(dir,{recursive:true,force:true})}

}
main().catch(e=>{console.error(e);process.exitCode=1});
