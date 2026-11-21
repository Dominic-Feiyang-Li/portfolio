import type {Position,Account,Settings,LedgerEntry} from './portfolio';
export interface AuditSnapshot {positions:Position[];accounts:Account[];settings?:Settings}
export interface AuditRecord {id:string;timestamp:string;type:string;subject:string;account:string;revision:number|null;trade:LedgerEntry|null;before:AuditSnapshot|null;after:AuditSnapshot|null;legacy:boolean}
export interface HistoryPage {records:AuditRecord[];nextCursor:number|null;total:number}
