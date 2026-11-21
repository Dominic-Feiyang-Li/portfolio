'use client';
import {interfaceText,assetName,accountName} from '@/lib/labels';
import {holdingDisplayGroups,priceTimeLabel} from '@/lib/holding-display';
import {currentPortfolio,quotesNeedUpdate} from '@/lib/current-portfolio';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { ArrowLeft, Download, History, MoreHorizontal, RefreshCw, LogOut, Plus, Settings, Sparkles, WalletCards } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

import {useCallback,useEffect,useRef,useState} from 'react';
import {type PortfolioState,type Position,type Account,type Mutation} from '@/types/portfolio';
import {emptyState,summarize,marketValue,formatAmount,signed,hasMissingRates,currencySymbol} from '@/lib/portfolio';
import Modal from './Modal';
import HistoryPanel from './HistoryPanel';
import AllocationChart from './AllocationChart';
import DailyReturns from './DailyReturns';
import HoldingsList from './HoldingsList';
import PortfolioPending from './PortfolioPending';
import {PositionForm,AccountForm,TradeForm,SettingsForm} from './Forms';
import TodayReturn from './TodayReturn';
import HistoryChart,{dateLabel} from './HistoryChart';
type Dialog = {kind:'more'}|{kind:'position';position:Position|null}|{kind:'account';account:Account|null}|{kind:'trade';id?:string}|{kind:'settings'}|{kind:'delete-position';position:Position}|{kind:'delete-account';account:Account}|{kind:'import';state:PortfolioState}|null;
const InvestmentAssistant=dynamic(()=>import('./InvestmentAssistant'),{ssr:false});
export default function Dashboard({secured=false,username}:{secured?:boolean;username?:string}){
 const [state,setState]=useState<PortfolioState>(emptyState),[loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [tab,setTab]=useState('Portfolio'),[hidden,setHidden]=useState(false),[dialog,setDialog]=useState<Dialog>(null);
 const [assistantOpen,setAssistantOpen]=useState(false),[assistantStarted,setAssistantStarted]=useState(false);
 const navigate=(page:string)=>{setDialog(null);setTab(page);window.scrollTo(0,0)};
 useEffect(()=>{if(!secured)return;const renew=()=>{void fetch('/api/auth',{cache:'no-store'}).then(r=>{if(r.status===401)window.location.replace('/login')}).catch(()=>{})};renew();const timer=setInterval(renew,30*60*1000);return ()=>clearInterval(timer)},[secured]);
 const stateRef=useRef(state),lock=useRef(false),fileRef=useRef<HTMLInputElement>(null);
 const hasLedger=useRef(false);
 const [updating,setUpdating]=useState(false);
 const accept=useCallback((s:PortfolioState)=>{stateRef.current=s;hasLedger.current=true;setState(s);setLoaded(true)},[]);
 const load=useCallback(async()=>{const r=await fetch('/api/portfolio',{cache:'no-store'});if(r.status===401){window.location.replace('/login');throw new Error('Please sign in')}const data=await r.json();if(!r.ok)throw new Error(data.error);accept(data);return data as PortfolioState},[accept]);
 const refreshTask=useRef<Promise<void>|null>(null);
 const refreshFresh=useRef(false);
 const refresh=useCallback(async function updatePrices(fresh=false):Promise<void>{
  if(refreshTask.current){if(fresh&&!refreshFresh.current){await refreshTask.current;return updatePrices(true)}return refreshTask.current;}
  if(lock.current)return Promise.resolve();
  lock.current=true;refreshFresh.current=fresh;setBusy(true);setError('');
  const task=(async()=>{
   try{
    if(!hasLedger.current){
     const saved=await load();
     if(!fresh&&!quotesNeedUpdate(saved))return;
    }
    setUpdating(true);
    accept(await currentPortfolio(fresh));
   }catch(e){
    const detail=(e as Error).message||'Unable to update prices';
    if(detail==='Please sign in'){setLoaded(false);window.location.replace('/login')}
    setError(detail);
   }finally{
    lock.current=false;setBusy(false);setUpdating(false);refreshTask.current=null;
   }
  })();
  refreshTask.current=task;return task;
 },[accept,load]);
 useEffect(()=>{void refresh()},[refresh]);
 useEffect(()=>{if(!loaded||!state.settings.autoRefresh)return;const t=setInterval(()=>{if(document.visibilityState==='visible')void refresh()},state.settings.refreshSeconds*1000);return ()=>clearInterval(t)},[loaded,state.settings.autoRefresh,state.settings.refreshSeconds,refresh]);
 useEffect(()=>{
  let retry:ReturnType<typeof setTimeout>|undefined;
  const update=(event:Event)=>{
   clearTimeout(retry);
   if(document.visibilityState!=='visible')return
   if(lock.current&&!refreshTask.current){retry=setTimeout(()=>update(event),250);return}
   void refresh(event.type==='portfolio-updated');
  };
  const timer=secured?setInterval(()=>{if(document.visibilityState==='visible')void refresh()},60000):undefined;
  document.addEventListener('visibilitychange',update);window.addEventListener('focus',update);window.addEventListener('pageshow',update);window.addEventListener('portfolio-updated',update);
  return ()=>{clearTimeout(retry);clearInterval(timer);document.removeEventListener('visibilitychange',update);window.removeEventListener('focus',update);window.removeEventListener('pageshow',update);window.removeEventListener('portfolio-updated',update)};
 },[secured,refresh]);
 useEffect(()=>{if(!message)return;const t=setTimeout(()=>setMessage(''),3500);return ()=>clearTimeout(t)},[message]);
 const mutate=async(m:Mutation)=>{if(lock.current)return false;lock.current=true;setBusy(true);setError('');try{const r=await fetch('/api/portfolio',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:stateRef.current.revision,mutation:m})});const d=await r.json();if(!r.ok){if(r.status===409){await load();}throw new Error(d.error)}accept(d);setMessage('Saved');return true}catch(e){setError((e as Error).message);return false}finally{lock.current=false;setBusy(false)}};
 const savePosition=async(p:Position,newAccount:string)=>{if(p.accountId==='new'){const a={id:crypto.randomUUID(),name:newAccount,note:''};if(!await mutate({action:'account',account:a}))return;p.accountId=a.id}if(await mutate({action:'position',position:p})){setDialog(null);if(p.provider==='auto')void refresh(true)}};
 const importBackup=async()=>{if(dialog?.kind!=='import'||lock.current)return;lock.current=true;setBusy(true);try{const r=await fetch('/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:stateRef.current.revision,state:dialog.state})});const d=await r.json();if(!r.ok){if(r.status===409){await load();}throw new Error(d.error)}accept(d);setDialog(null);setMessage('Backup restored')}catch(e){setError((e as Error).message)}finally{lock.current=false;setBusy(false)}};
 const readBackup=async(file:File)=>{try{if(file.size>25_000_000)throw new Error('Backup files must be 25 MB or smaller');const data=JSON.parse(await file.text());if(data.version!==1||!Array.isArray(data.positions)||!Array.isArray(data.accounts)||!Array.isArray(data.snapshots)||!Array.isArray(data.ledger)||!data.settings)throw new Error('Invalid backup format');setDialog({kind:'import',state:data})}catch(e){setError((e as Error).message)}finally{if(fileRef.current)fileRef.current.value=''}};
 const currency=state.settings.currency,rate=state.settings.rates[currency],rows=state.positions,sum=summarize(rows,state.settings.rates),missing=hasMissingRates(state);
 const fmt=(cny:number)=>hidden?'••••••':!rate?'—':formatAmount(cny/rate,currency);
 const filtered=[...rows].sort((a,b)=>marketValue(b,state.settings.rates)-marketValue(a,state.settings.rates));
 const gain=sum.profit,unknownProfit=sum.unknownCost,percent=sum.profitPercent;
 const failures=state.positions.filter(p=>p.quoteError);
 return <main className="app simpleapp"><header className="appheader simpleheader"><h1 className="sr-only">Personal portfolio</h1>{tab==='Portfolio'?<span className="simplebrand"><Image src="/logo.png" width={40} height={40} alt="Portfolio" priority/></span>:<Button variant="ghost" className="backhome" onClick={()=>navigate('Portfolio')}><ArrowLeft data-icon="inline-start"/>Overview</Button>}<div className="headeractions"><Button className="primarybutton" size="icon" aria-label="Add asset" onClick={()=>setDialog({kind:'position',position:null})} disabled={!loaded||busy}><Plus/></Button><Button variant="ghost" size="icon" aria-label="More" disabled={!loaded} aria-haspopup="dialog" onClick={()=>setDialog({kind:'more'})}><MoreHorizontal/></Button></div></header>
 {error&&<div className="errorbar" role="alert"><span>{interfaceText(error)}</span>{!loaded&&<Button variant="outline" disabled={busy} onClick={()=>void refresh(true)}>Retry</Button>}{loaded&&<Button variant="outline" onClick={()=>setError('')} aria-label="Dismiss error">×</Button>}</div>}{message&&<div className="saved" role="status">{message}</div>}
 <div className="pagecontent" key={tab} aria-busy={!loaded||undefined}>
 {!loaded?<PortfolioPending positions={rows} failed={!!error}/>:<>
 {tab==='Portfolio'&&<>
 <section className="overview" aria-label="Portfolio overview"><div className="overviewmain">
 <HistoryChart snapshots={state.snapshots} hidden={hidden} summary={point=><div className="accountsummary">
  <div className="balanceheading"><p className="balancelabel">{point?'Historical value · CNY':'Total assets'}</p></div>
  <div className="balance"><span><button type="button" className="balancevisibility" aria-label={hidden?'Show balances':'Hide balances'} aria-pressed={hidden} onClick={()=>setHidden(!hidden)}>
   {hidden?'••••••':point?'¥'+formatAmount(point.valueCny,'CNY'):missing||!rate?'—':currencySymbol[currency]+fmt(sum.value)}
  </button></span></div>
  <div className="summarycontext">
   <div style={{visibility:point?'hidden':'visible'}} aria-hidden={!!point}>
    <TodayReturn revision={state.revision} currency={currency} hidden={hidden}/>
    <div className="overviewunrealized"><span>Unrealized P&amp;L</span> {hidden?'••••':unknownProfit?'Cost basis missing':missing||!rate?'—':signed(gain/rate)+' '+currency+' ('+signed(percent)+'%)'}</div>
    <p className="valuationstatus" role="status">{updating?'Updating prices · ':''}{failures.length||state.settings.fxError?'Some prices or rates retained · ':''}{state.lastRefresh?'Last checked '+dateLabel(state.lastRefresh,true)+' (UTC+8)':'Saved valuation'}</p>
   </div>
   {point&&<time className="inspectedtime" dateTime={point.timestamp}>{dateLabel(point.timestamp,true)} (UTC+8)</time>}
  </div>
 </div>}/>
 </div></section>
 <AllocationChart positions={rows} rates={state.settings.rates} currency={currency} hidden={hidden}/>
 <section className="holdingssection" aria-label="My holdings"><div className="listtoolbar"><h2>Holdings <span>{holdingDisplayGroups(filtered).length}  assets</span></h2></div>
 {!holdingDisplayGroups(filtered).length?<div className="empty"><h3>No holdings yet</h3><Button className="primarybutton" onClick={()=>setDialog({kind:'position',position:null})}>Add asset</Button></div>:<HoldingsList revision={state.revision} positions={filtered} accounts={state.accounts} rates={state.settings.rates} currency={currency} hidden={hidden}/>}
 </section>
 <DailyReturns revision={state.revision} hidden={hidden}/>
 {(missing||failures.length>0||state.settings.fxError)&&<div className="statuserrors">{missing&&<p>Some exchange rates are missing. Refresh prices or enter rates in Settings to complete the valuation.</p>}{state.settings.fxError&&<p>{interfaceText(state.settings.fxError)}</p>}{failures.map(p=><p key={p.id}>{assetName(p)}: {interfaceText(p.quoteError||'')}. <Button variant="outline" onClick={()=>setDialog({kind:'position',position:p})}>Edit price</Button></p>)}</div>}
 </>}
 {tab==='Accounts'&&<section className="accountpage"><div className="sectionheading"><h2>Accounts</h2><Button variant="outline" disabled={busy} onClick={()=>setDialog({kind:'account',account:null})}>Add account</Button></div>{!state.accounts.length?<div className="empty"><h3>No accounts yet</h3><Button variant="outline" onClick={()=>setDialog({kind:'account',account:null})}>Add account</Button></div>:<div className="accountgrid">{state.accounts.map(a=>{const ps=state.positions.filter(p=>p.accountId===a.id),v=summarize(ps,state.settings.rates);return <Card key={a.id} className="accountcard"><div><h3>{accountName(a)}</h3><Button variant="outline" onClick={()=>setDialog({kind:'account',account:a})} aria-label={`Edit account ${accountName(a)}`}>Edit</Button></div><strong>{fmt(v.value)} <small>{currency}</small></strong><span>{holdingDisplayGroups(ps).length}  assets</span><HoldingsList revision={state.revision} accountId={a.id} positions={ps} accounts={state.accounts} rates={state.settings.rates} currency={currency} hidden={hidden} onEdit={position=>setDialog({kind:'position',position})}/></Card>})}</div>}</section>}
 {tab==='History'&&<section className="recordpage"><div className="sectionheading"><h2>Trade history</h2><Button className="primarybutton" disabled={busy||!state.positions.some(p=>p.category!=='现金')} onClick={()=>setDialog({kind:'trade'})}>Record trade</Button></div><HistoryPanel revision={state.revision} hidden={hidden}/><div className="sectionheading historyheading"><h2>Historical valuations</h2><span>{state.snapshots.length}  records</span></div><div className="tablescroll"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Portfolio value / CNY</TableHead><TableHead>Reason</TableHead></TableRow></TableHeader><TableBody>{state.snapshots.slice(-60).reverse().map(p=><TableRow key={p.id}><TableCell>{dateLabel(p.timestamp,true)}</TableCell><TableCell>{hidden?'••••':formatAmount(p.valueCny,'CNY')}</TableCell><TableCell>{interfaceText(p.reason)}</TableCell></TableRow>)}</TableBody></Table></div></section>}
 {(tab==='Settings'||tab==='Backup')&&<section className="settingspage"><h2>{tab==='Backup'?'Backup & export':'Settings'}</h2>{username&&<p className="signedinuser">Signed in as: {username}  · Personal ledger</p>}<div className="settingsgrid">{tab==='Settings'&&<Card className="settingscard"><h3>Display & updates</h3><SettingsForm key={state.settings.currency} initial={state.settings} busy={busy} onSubmit={s=>void mutate({action:'settings',settings:s})}/></Card>}{tab==='Backup'&&<Card className="settingscard"><h3>Backup & export</h3><p>{secured?'Your accounts, holdings, trades and historical valuations are stored in the cloud.':'Your accounts, holdings, trades and historical valuations are stored on this computer.'}</p><div className="backupbuttons"><a className="button" href="/api/backup" download>Export full backup</a><Button variant="outline" onClick={()=>fileRef.current?.click()} disabled={busy}>Import backup</Button><a className="button" href="/api/export" download>Export holdings CSV</a></div><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void readBackup(f)}}/><h3 className="settingssub">Price sources</h3><dl className="sources"><dt>China stocks / ETFs & US stocks</dt><dd>Tencent public quotes · May be delayed</dd><dt>Crypto</dt><dd>CoinLore · USD / 24h, with Coinbase / Kraken as backups</dd><dt>Exchange rates</dt><dd>Frankfurter · Daily rates</dd><dt>Account sync</dt><dd>Not connected. Holdings are maintained through manual entries and trade records.</dd></dl><p className="formnote">Unrealized returns use average cost. Price changes use the previous stock close, CoinLore / Coinbase 24h prices, or the Kraken UTC daily open. Cross-currency returns use current exchange rates and exclude FX gains. Historical valuations are displayed using the current base-currency exchange rate.</p></Card>}</div></section>}
 </>}
 </div>
 {assistantStarted&&<InvestmentAssistant open={assistantOpen} onOpenChange={setAssistantOpen} positionCount={state.positions.length}/>}
 {loaded&&dialog&&<Modal dismissible={!busy} destructive={dialog.kind==='delete-position'||dialog.kind==='delete-account'||dialog.kind==='import'} title={dialog.kind==='more'?'More':dialog.kind==='position'?(dialog.position?'Edit holding':'Add asset'):dialog.kind==='account'?(dialog.account?'Edit account':'Add account'):dialog.kind==='trade'?'Record trade':dialog.kind==='settings'?'Settings':dialog.kind==='import'?'Import backup':'Confirm deletion'} onClose={()=>{if(!busy)setDialog(null)}}>
 {error&&<p className="modalerror" role="alert">{interfaceText(error)}</p>}
 {dialog.kind==='more'&&<div className="moreactions"><Button variant="ghost" onClick={()=>navigate('Accounts')}><WalletCards data-icon="inline-start"/>Accounts</Button>
 <Button variant="ghost" onClick={()=>navigate('History')}><History data-icon="inline-start"/>Trade history</Button>
 <Button variant="ghost" onClick={()=>navigate('Settings')}><Settings data-icon="inline-start"/>Settings</Button>
 <Button variant="ghost" onClick={()=>navigate('Backup')}><Download data-icon="inline-start"/>Backup &amp; export</Button>
 <Button variant="ghost" onClick={()=>{setDialog(null);setAssistantStarted(true);setAssistantOpen(true)}}><Sparkles data-icon="inline-start"/>AI Assistant</Button><Button variant="ghost" disabled={busy} onClick={()=>{setDialog(null);void refresh(true)}}><RefreshCw data-icon="inline-start"/>Refresh prices</Button>{secured&&<Button variant="ghost" onClick={async()=>{const r=await fetch('/api/auth',{method:'DELETE'});if(r.ok)window.location.replace('/login');else setError('Unable to sign out. Please try again.')}}><LogOut data-icon="inline-start"/>Sign out</Button>}</div>}
 {dialog.kind==='position'&&<>{dialog.position&&<details className="quotedetails"><summary>Quote details{dialog.position.quoteError?'  · Update failed':''}</summary><dl><div><dt>Source</dt><dd>{interfaceText(dialog.position.quoteSource||'Manual price')}</dd></div><div><dt>Price time</dt><dd>{priceTimeLabel(dialog.position)||'Face value'}</dd></div>{dialog.position.quoteError&&<div><dt>Status</dt><dd>{interfaceText(dialog.position.quoteError)}</dd></div>}</dl></details>}<PositionForm initial={dialog.position} accounts={state.accounts} busy={busy} onSubmit={savePosition} onDelete={dialog.position?()=>setDialog({kind:'delete-position',position:dialog.position!}):undefined}/>{dialog.position&&dialog.position.category!=='现金'&&<Button variant="outline" className="tradefromholding" onClick={()=>setDialog({kind:'trade',id:dialog.position!.id})}>Record a buy / sell</Button>}</>}
 {dialog.kind==='account'&&<AccountForm initial={dialog.account} busy={busy} onSubmit={async a=>{if(await mutate({action:'account',account:a}))setDialog(null)}} onDelete={dialog.account?()=>setDialog({kind:'delete-account',account:dialog.account!}):undefined}/>}
 {dialog.kind==='trade'&&<TradeForm positions={state.positions} accounts={state.accounts} busy={busy} initialId={dialog.id} onSubmit={async m=>{if(await mutate(m))setDialog(null)}}/>}
 {dialog.kind==='settings'&&<SettingsForm initial={state.settings} busy={busy} onSubmit={async s=>{if(await mutate({action:'settings',settings:s}))setDialog(null)}}/>}
 {dialog.kind==='delete-position'&&<><p>Delete {assetName(dialog.position)}? Trade records and historical valuations will be retained.</p><div className="formactions"><Button variant="outline" onClick={()=>setDialog({kind:'position',position:dialog.position})}>Cancel</Button><Button variant="destructive" className="dangerbutton" disabled={busy} onClick={async()=>{if(await mutate({action:'delete-position',id:dialog.position.id}))setDialog(null)}}>Delete</Button></div></>}
 {dialog.kind==='delete-account'&&<><p>Delete account “{accountName(dialog.account)}”? Transfer or remove its holdings first.</p><div className="formactions"><Button variant="outline" onClick={()=>setDialog(null)}>Cancel</Button><Button variant="destructive" className="dangerbutton" disabled={busy} onClick={async()=>{if(await mutate({action:'delete-account',id:dialog.account.id}))setDialog(null)}}>Delete account</Button></div></>}
 {dialog.kind==='import'&&<><p>This backup contains  {dialog.state.positions.length}  assets, {dialog.state.accounts.length}  accounts and  {dialog.state.snapshots.length}  historical valuations.</p><p>Importing replaces your current ledger. A local copy is saved before replacement.</p><div className="formactions"><Button variant="outline" onClick={()=>setDialog(null)}>Cancel</Button><Button className="primarybutton" disabled={busy} onClick={()=>void importBackup()}>Replace ledger</Button></div></>}
 </Modal>}
 </main>
}
