import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {readDataCache,saveDataCache} from '../src/server/storage';
const dir=mkdtempSync(join(tmpdir(),'history-cache-'));process.env.PORTFOLIO_DATA_DIR=dir;
async function main(){
 const payload={points:[{timestamp:'2026-10-01T00:00:00Z',valueCny:123}],warnings:[]};
 await saveDataCache('actual-curve-v1:owner-a:revision-1',payload);
 assert.deepEqual((await readDataCache<typeof payload>('actual-curve-v1:owner-a:revision-1'))?.series,payload);
 assert.equal(await readDataCache('actual-curve-v1:owner-b:revision-1'),null);
 assert.equal(await readDataCache('actual-curve-v1:owner-a:revision-2'),null);
 const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',"import {readDataCache} from './src/server/storage.ts'; const r=await readDataCache('actual-curve-v1:owner-a:revision-1');if(r?.series.points[0].valueCny!==123)process.exit(1)"],{cwd:process.cwd(),env:process.env,encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);console.log('History cache checks passed: persistent across processes, owner/input keys isolated.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>rmSync(dir,{recursive:true,force:true}));
