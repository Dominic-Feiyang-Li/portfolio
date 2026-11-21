import {emptyState} from '@/lib/portfolio';
import type {PortfolioState,Mutation} from '@/types/portfolio';
import type {AuditRecord,HistoryPage} from '@/types/history';
import {validateState} from './validation';
import {makeAudit,legacyAudit} from './history';
import {ConflictError} from './store';

export function cloudEnabled(){return process.env.PORTFOLIO_STORAGE==='supabase'||process.env.VERCEL==='1'}
export async function cloudRpc<T>(action:string,args:Record<string,unknown>={},rpc:'portfolio_rpc'|'portfolio_auth_rpc'|'portfolio_valuation_rpc'='portfolio_rpc'):Promise<T>{
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!key)throw new Error('云端数据库尚未配置');
 const r=await fetch(url.replace(/\/$/,'')+'/rest/v1/rpc/'+rpc,{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({action,args}),cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!r.ok){const error=await r.json().catch(()=>({}));if(error.message==='portfolio_conflict')throw new ConflictError();throw new Error('云端数据库请求失败')}
 return await r.json() as T;
}
export async function cloudRead(userId:string){const state=await cloudRpc<PortfolioState|null>('read',{userId});return state?validateState(state):emptyState()}
export async function cloudSave(userId:string,state:PortfolioState,revision:number,backup=false,operation?:Mutation,importedHistory:AuditRecord[]=[],before?:PortfolioState){
 // Quote refreshes can reuse their owner snapshot. The RPC still locks and
 // compares revisions atomically, so concurrent trades cannot be overwritten.
 const old=before??await cloudRead(userId);if(old.revision!==revision)throw new ConflictError();
 const next=validateState({...state,revision:revision+1}),records=[...importedHistory],audit=makeAudit(old,next,operation,backup);
 if(audit)records.push(audit);const ids=new Set(records.map(r=>r.id)),oldIds=new Set(old.ledger.map(l=>l.id));
 for(const entry of next.ledger)if(!oldIds.has(entry.id)&&!ids.has('ledger:'+entry.id))records.push(legacyAudit(entry));
 return cloudRpc<PortfolioState>('save',{state:next,revision,backup,records,userId});
}
export async function cloudHistory(userId:string,cursor?:number,scope='all'):Promise<HistoryPage>{
 if(scope!=='trades')return cloudRpc<HistoryPage>('history',{cursor:cursor||Number.MAX_SAFE_INTEGER,scope,userId});
 // Older deployed RPCs filter out swaps. Read the owner's durable journal instead;
 // end offsets remain stable when newer records are appended between pages.
 const all=await cloudRpc<AuditRecord[]>('export-history',{userId});
 const trades=all.filter(r=>['买入','卖出','币币兑换'].includes(r.type));
 const end=Math.min(cursor??trades.length,trades.length),start=Math.max(0,end-50);
 return {records:trades.slice(start,end).reverse(),total:trades.length,nextCursor:start||null};
}
