import {randomUUID} from 'node:crypto';
import type {PortfolioState,Mutation,LedgerEntry} from '@/types/portfolio';
import type {AuditRecord} from '@/types/history';
const snapshot=(state:PortfolioState)=>({positions:state.positions,accounts:state.accounts,settings:state.settings});
export function makeAudit(before:PortfolioState,after:PortfolioState,mutation?:Mutation,restore=false):AuditRecord|null {
 if(!mutation&&!restore)return null;
 const newTrade=after.ledger.find(l=>!before.ledger.some(old=>old.id===l.id));
 let type='导入备份',subject='账本',account='';
 if(mutation){switch(mutation.action){
 case 'swap':{type='币币兑换';const from=before.positions.find(p=>p.id===mutation.fromPositionId),to=after.positions.find(p=>p.id===mutation.toPositionId);subject=`${from?.symbol} → ${to?.symbol}`;account=after.accounts.find(a=>a.id===from?.accountId)?.name||'';break}
 case 'trade':case 'position':case 'delete-position':{
  const id=mutation.action==='trade'?mutation.positionId:mutation.action==='position'?mutation.position.id:mutation.id;
  const p=after.positions.find(p=>p.id===id)||before.positions.find(p=>p.id===id);
  subject=p?.symbol||'';account=(after.accounts.find(a=>a.id===p?.accountId)||before.accounts.find(a=>a.id===p?.accountId))?.name||'';
  type=mutation.action==='trade'?mutation.type:mutation.action==='delete-position'?'删除持仓':before.positions.some(p=>p.id===id)?'修改持仓':'新增持仓';break;
 }
 case 'account':case 'delete-account':{const id=mutation.action==='account'?mutation.account.id:mutation.id;const a=after.accounts.find(a=>a.id===id)||before.accounts.find(a=>a.id===id);subject=a?.name||'';account=subject;type=mutation.action==='delete-account'?'删除账户':before.accounts.some(a=>a.id===id)?'修改账户':'新增账户';break}
 case 'settings':type='修改设置';subject='设置';break;
 }}
 // Keep only affected objects, including cash changed by trade settlement.
 const old=snapshot(before),next=snapshot(after);
 if(!restore){
  const changedIds=new Set([...old.positions,...next.positions].filter(p=>JSON.stringify(old.positions.find(x=>x.id===p.id))!==JSON.stringify(next.positions.find(x=>x.id===p.id))).map(p=>p.id));
  old.positions=old.positions.filter(p=>changedIds.has(p.id));next.positions=next.positions.filter(p=>changedIds.has(p.id));
  const accounts=new Set([...old.accounts,...next.accounts].filter(a=>JSON.stringify(old.accounts.find(x=>x.id===a.id))!==JSON.stringify(next.accounts.find(x=>x.id===a.id))).map(a=>a.id));
  old.accounts=old.accounts.filter(a=>accounts.has(a.id));next.accounts=next.accounts.filter(a=>accounts.has(a.id));
 }
 return {id:newTrade&&!restore?'ledger:'+newTrade.id:randomUUID(),timestamp:new Date().toISOString(),type,subject,account,revision:after.revision,trade:newTrade||null,before:{positions:old.positions,accounts:old.accounts,...(restore||mutation?.action==='settings'?{settings:old.settings}:{})},after:{positions:next.positions,accounts:next.accounts,...(restore||mutation?.action==='settings'?{settings:next.settings}:{})},legacy:false};
}
export function legacyAudit(l:LedgerEntry):AuditRecord{return {id:'ledger:'+l.id,timestamp:l.timestamp,type:l.type,subject:l.symbol,account:l.accountName,revision:null,trade:l,before:null,after:null,legacy:true}}
