import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {emptyState,categories,hasMissingRates} from '@/lib/portfolio';
import type {PortfolioState,Mutation,LedgerEntry,Position} from '@/types/portfolio';
import {InputError,validateState} from './validation';
import {makeAudit,legacyAudit} from './history';
import type {AuditRecord,HistoryPage} from '@/types/history';
const databases=new Map<string,DatabaseSync>();
function db(userId?:string){if(userId&&!/^[a-z0-9_]{3,32}$/.test(userId))throw new Error('账号不正确');const file=userId?'user-'+userId+'.sqlite':'portfolio.sqlite';let database=databases.get(file);if(!database){const dir=resolve(/* turbopackIgnore: true */ process.env.PORTFOLIO_DATA_DIR||resolve(process.cwd(),'data'));mkdirSync(dir,{recursive:true});database=new DatabaseSync(resolve(dir,file));database.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS portfolio (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS backups (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, document TEXT NOT NULL); CREATE TABLE IF NOT EXISTS history (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, created_at TEXT NOT NULL, type TEXT NOT NULL, subject TEXT NOT NULL, account TEXT NOT NULL, document TEXT NOT NULL); CREATE INDEX IF NOT EXISTS history_type_sequence ON history(type,sequence); CREATE TABLE IF NOT EXISTS price_cache (key TEXT PRIMARY KEY, fetched_at INTEGER NOT NULL, document TEXT NOT NULL);');database.prepare('INSERT OR IGNORE INTO portfolio (id,revision,document) VALUES (1,0,?)').run(JSON.stringify(emptyState()));const existing=JSON.parse((database.prepare('SELECT document FROM portfolio WHERE id=1').get() as {document:string}).document) as PortfolioState;for(const l of existing.ledger)insertAudit(database,legacyAudit(l));databases.set(file,database);}return database}
export function readState(userId?:string):PortfolioState{const row=db(userId).prepare('SELECT document FROM portfolio WHERE id=1').get() as {document:string};return JSON.parse(row.document)}
export class ConflictError extends Error {status=409;constructor(){super('数据已在另一页面更新，请重试')}}
export function saveState(state:PortfolioState,revision:number,backup=false,operation?:Mutation,importedHistory:AuditRecord[]=[],userId?:string){const d=db(userId);d.exec('BEGIN IMMEDIATE');try{const old=readState(userId);if(old.revision!==revision)throw new ConflictError();if(backup){d.prepare('INSERT INTO backups (created_at,document) VALUES (?,?)').run(new Date().toISOString(),JSON.stringify(old));d.exec('DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT 20)')};const next=validateState({...state,revision:revision+1});d.prepare('UPDATE portfolio SET revision=?,document=? WHERE id=1').run(next.revision,JSON.stringify(next));for(const record of importedHistory)insertAudit(d,record);const audit=makeAudit(old,next,operation,backup);if(audit)insertAudit(d,audit);const oldEntries=new Set(old.ledger.map(l=>l.id));for(const l of next.ledger)if(!oldEntries.has(l.id)&&audit?.id!=='ledger:'+l.id)insertAudit(d,legacyAudit(l));d.exec('COMMIT');return next}catch(e){d.exec('ROLLBACK');throw e}}
export function takeSnapshot(state:PortfolioState,reason:string){if(hasMissingRates(state)||(!state.positions.length&&!state.snapshots.length))return;const totals=categories(state);const point={id:randomUUID(),timestamp:new Date().toISOString(),valueCny:Object.values(totals).reduce((s,v)=>s+v,0),categories:totals,reason};const last=state.snapshots.at(-1);if(reason==='行情更新'&&last&&last.reason==='行情更新'&&Date.parse(point.timestamp)-Date.parse(last.timestamp)<60000){state.snapshots[state.snapshots.length-1]=point}else state.snapshots.push(point);if(state.snapshots.length>100000)state.snapshots.shift()}
function entry(state:PortfolioState,data:Partial<LedgerEntry> & Pick<LedgerEntry,'type'|'accountName'>){state.ledger.unshift({id:randomUUID(),timestamp:new Date().toISOString(),symbol:'',quantity:0,price:0,currency:'CNY',fee:0,realizedPnl:0,note:'',...data})}
export function applyMutation(state:PortfolioState,m:Mutation):PortfolioState{
 switch(m.action){
 case 'position':{if(!state.accounts.some(a=>a.id===m.position.accountId))throw new InputError('请先添加账户');const idx=state.positions.findIndex(p=>p.id===m.position.id);if(state.positions.some(p=>p.id!==m.position.id&&p.accountId===m.position.accountId&&p.symbol===m.position.symbol&&p.currency===m.position.currency))throw new InputError('该账户已有此资产，请编辑现有持仓');const p={...m.position,quoteAt:new Date().toISOString(),quoteSource:m.position.category==='现金'?'面值':'手动价格',quoteError:null};if(idx<0)state.positions.push(p);else state.positions[idx]=p;entry(state,{type:'持仓调整',symbol:p.symbol,accountName:state.accounts.find(a=>a.id===p.accountId)!.name,quantity:p.quantity,price:p.price,currency:p.currency,note:idx<0?'录入期初持仓':'修改持仓（非交易）'});takeSnapshot(state,'持仓变更');break}
 case 'delete-position':{const p=state.positions.find(p=>p.id===m.id);if(!p)throw new InputError('持仓不存在');entry(state,{type:'持仓删除',symbol:p.symbol,accountName:state.accounts.find(a=>a.id===p.accountId)!.name,quantity:p.quantity,price:p.price,currency:p.currency});state.positions=state.positions.filter(p=>p.id!==m.id);takeSnapshot(state,'持仓删除');break}
 case 'account':{if(state.accounts.some(a=>a.id!==m.account.id&&a.name===m.account.name))throw new InputError('账户名称已存在');const idx=state.accounts.findIndex(a=>a.id===m.account.id);if(idx<0)state.accounts.push(m.account);else state.accounts[idx]=m.account;break}
 case 'delete-account':if(state.positions.some(p=>p.accountId===m.id))throw new InputError('请先移除或转移账户内的持仓');state.accounts=state.accounts.filter(a=>a.id!==m.id);break;
 case 'settings':state.settings=m.settings;takeSnapshot(state,'设置变更');break;
 case 'swap':{
  const from=state.positions.find(p=>p.id===m.fromPositionId),to=state.positions.find(p=>p.id===m.toPositionId);
  if(!from||!to||from.category!=='加密货币'||to.category!=='加密货币')throw new InputError('请选择两个加密货币持仓');
  if(from.symbol===to.symbol||from.id===to.id)throw new InputError('兑换币种不能相同');
  if(from.accountId!==to.accountId||from.currency!==to.currency)throw new InputError('兑换须使用同账户、同计价币种的持仓');
  if(!state.accounts.some(a=>a.id===from.accountId))throw new InputError('持仓所属账户不存在');
  const debit=m.fromQuantity+(m.feeSide==='from'?m.feeQuantity:0);
  const credit=m.toQuantity-(m.feeSide==='to'?m.feeQuantity:0);
  if(debit>from.quantity)throw new InputError('付出数量及手续费超过持仓');
  if(credit<=0)throw new InputError('手续费须小于收到数量');
  const feeValue=m.value===null?null:m.feeQuantity*m.value/(m.feeSide==='from'?m.fromQuantity:m.toQuantity);
  // Outgoing coin fees are additional disposal proceeds allocated to acquisition cost.
  // Incoming coin fees reduce net units; the gross acquisition value remains the cost.
  const cost=m.value===null?null:m.value+(m.feeSide==='from'?feeValue!:0);
  const averageCost=cost===null||(to.averageCost===null&&to.quantity>0)?null:(to.quantity*(to.averageCost??0)+cost)/(to.quantity+credit);
  if(![debit,credit,feeValue??0,cost??0,to.quantity+credit,averageCost??0].every(Number.isFinite))throw new InputError('兑换金额不正确');
  const realizedPnl=from.averageCost===null||m.value===null?null:m.value-debit*from.averageCost;
  from.quantity-=debit;to.averageCost=averageCost;to.quantity+=credit;
  const {action,timestamp,...details}=m;void action;
  entry(state,{type:'币币兑换',symbol:from.symbol,accountName:state.accounts.find(a=>a.id===from.accountId)!.name,quantity:m.fromQuantity,price:m.value===null?null:m.value/m.fromQuantity,currency:from.currency,fee:feeValue,realizedPnl,timestamp,swap:{...details,toSymbol:to.symbol},note:'币币兑换；不变更现金；成交数量不含手续费'});
  takeSnapshot(state,'交易记录');break;
 }
 case 'trade':{const p=state.positions.find(p=>p.id===m.positionId);if(!p||p.category==='现金')throw new InputError('请选择股票或加密货币持仓');const cost=m.quantity*m.price;let realized:number|null=0;if(m.type==='卖出'&&m.quantity>p.quantity+1e-10)throw new InputError('卖出数量超过持仓');if(m.type==='卖出'&&m.fee>cost)throw new InputError('手续费超过成交金额');if(m.settleCash){let cash=state.positions.find(c=>c.accountId===p.accountId&&c.category==='现金'&&c.currency===p.currency);if(m.type==='买入'&&(!cash||cash.quantity+1e-8<cost+m.fee))throw new InputError('账户现金不足，请先添加相同币种的现金持仓');if(!cash){cash={id:randomUUID(),symbol:p.currency,name:p.currency+' 现金',category:'现金',accountId:p.accountId,currency:p.currency,quantity:0,price:1,previousClose:1,averageCost:1,provider:'manual',quoteAt:new Date().toISOString(),quoteSource:'面值',quoteError:null} satisfies Position;state.positions.push(cash)}cash.quantity=Math.max(0,cash.quantity+(m.type==='买入'?-cost-m.fee:cost-m.fee))};if(m.type==='买入'){p.averageCost=p.averageCost===null&&p.quantity>0?null:(p.quantity*(p.averageCost||0)+cost+m.fee)/(p.quantity+m.quantity);p.quantity+=m.quantity}else {realized=p.averageCost===null?null:m.quantity*(m.price-p.averageCost)-m.fee;p.quantity=Math.max(0,p.quantity-m.quantity)};entry(state,{type:m.type,symbol:p.symbol,accountName:state.accounts.find(a=>a.id===p.accountId)!.name,quantity:m.quantity,price:m.price,currency:p.currency,fee:m.fee,realizedPnl:realized,timestamp:m.timestamp,note:m.settleCash?'已同步账户现金':'未同步账户现金'});takeSnapshot(state,'交易记录');break}
 }
 return state;
}

function insertAudit(database:DatabaseSync,record:AuditRecord){database.prepare('INSERT OR IGNORE INTO history (id,created_at,type,subject,account,document) VALUES (?,?,?,?,?,?)').run(record.id,record.timestamp,record.type,record.subject,record.account,JSON.stringify(record))}
export function readHistory(cursor?:number,scope='all',userId?:string):HistoryPage{
 const d=db(userId),filter=scope==='trades'?"type IN ('买入','卖出','币币兑换')":'1=1';
 const total=(d.prepare('SELECT COUNT(*) AS count FROM history WHERE '+filter).get() as {count:number}).count;
 const rows=d.prepare('SELECT sequence,document FROM history WHERE '+filter+' AND sequence < ? ORDER BY sequence DESC LIMIT 51').all(cursor||Number.MAX_SAFE_INTEGER) as {sequence:number;document:string}[];
 return {records:rows.slice(0,50).map(row=>JSON.parse(row.document)),total,nextCursor:rows.length>50?rows[49].sequence:null};
}
export function exportHistory(userId?:string):AuditRecord[]{return (db(userId).prepare('SELECT document FROM history ORDER BY sequence').all() as {document:string}[]).map(row=>JSON.parse(row.document))}

export function readPriceCache<T=import('@/types/prices').PriceSeries>(key:string){const row=db().prepare('SELECT fetched_at,document FROM price_cache WHERE key=?').get(key) as {fetched_at:number;document:string}|undefined;return row?{fetchedAt:row.fetched_at,series:JSON.parse(row.document) as T}:null}
export function savePriceCache<T=import('@/types/prices').PriceSeries>(key:string,series:T){db().prepare('INSERT INTO price_cache (key,fetched_at,document) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET fetched_at=excluded.fetched_at,document=excluded.document').run(key,Date.now(),JSON.stringify(series))}

export function readFixedValuations(userId?:string):import('./fixed-valuations').FixedValuation[]{const d=db(userId);d.exec('CREATE TABLE IF NOT EXISTS daily_valuations(timestamp TEXT PRIMARY KEY,document TEXT NOT NULL)');return (d.prepare('SELECT document FROM daily_valuations ORDER BY timestamp').all() as {document:string}[]).map(p=>JSON.parse(p.document))}
export function saveFixedValuation(point:import('./fixed-valuations').FixedValuation,userId?:string){const d=db(userId);d.exec('CREATE TABLE IF NOT EXISTS daily_valuations(timestamp TEXT PRIMARY KEY,document TEXT NOT NULL)');d.prepare('INSERT OR IGNORE INTO daily_valuations(timestamp,document) VALUES(?,?)').run(point.timestamp,JSON.stringify(point))}
