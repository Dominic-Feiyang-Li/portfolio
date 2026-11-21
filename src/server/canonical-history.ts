import type {AuditRecord} from '@/types/history';
// Imported legacy ledger rows can duplicate a full before/after restore event.
// Only suppress rows with an exact trade id, or matching changed holding and balance.
export function canonicalHistory(history:AuditRecord[]){return history.filter(r=>{
 if(!r.legacy)return true;
 return !history.some(restore=>{
  if(restore.type!=='导入备份'||!restore.before||!restore.after)return false;
  if(r.trade?.id&&restore.trade?.id===r.trade.id)return true;
  if(r.type!=='持仓调整'||!r.trade||Math.abs(Date.parse(restore.timestamp)-Date.parse(r.timestamp))>2000)return false;
  return restore.after.positions.some(p=>p.symbol===r.trade!.symbol&&(p.quantity===r.trade!.quantity||Math.abs((p.quantity-(restore.before!.positions.find(b=>b.id===p.id)?.quantity??0))-r.trade!.quantity)<1e-10)&&restore.after!.accounts.find(a=>a.id===p.accountId)?.name===r.trade!.accountName&&restore.before!.positions.find(b=>b.id===p.id)?.quantity!==p.quantity);
 });
})}
