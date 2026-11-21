import {Skeleton} from '@/components/ui/skeleton';
import {holdingDisplayGroups} from '@/lib/holding-display';
import type {Position} from '@/types/portfolio';

export default function PortfolioPending({positions,failed}:{positions:Position[];failed:boolean}){
 const groups=holdingDisplayGroups(positions);
 return <>
  <section className="overview" aria-label="Portfolio overview"><div className="overviewmain">
   <div className="balanceheading"><p className="balancelabel">Total assets</p></div>
   <div className="balance"><span>—</span></div>
   <div className="gainrow"><span className="pendingstatus" role="status">{failed?'Portfolio unavailable':'Loading portfolio…'}</span></div>
   <div className="history simplehistory"><div className="chartreadout"/><div className="chartcanvas"><Skeleton className="pendingchart" aria-hidden="true"/></div><div className="pendingperiods" aria-hidden="true"><span>1W</span><span>1M</span><span>YTD</span><span>All</span></div></div>
  </div></section>
  <section className="portfolioallocation" aria-label="Asset allocation"><div className="allocationheading"><h2>Allocation</h2><span>By market value</span></div><div className="allocationcontent"><div className="allocationring pendingring" aria-hidden="true"/><div className="allocationentries">{groups.length?groups.map(g=><div className="allocationentry" key={g.key}><span className="allocationswatch"/><span>{g.name}</span><strong>—</strong></div>):Array.from({length:4},(_,i)=><Skeleton key={i} className="pendingentry" aria-hidden="true"/>)}</div></div></section>
  <section className="holdingssection" aria-label="My holdings"><div className="listtoolbar"><h2>Holdings</h2></div><div className="positionslist simpleholdings">{groups.length?groups.map(g=><div className="pendingholding" key={g.key}><span className="holdingname">{g.name}</span><span>—</span></div>):Array.from({length:3},(_,i)=><div className="pendingholding" key={i} aria-hidden="true"><Skeleton className="pendingname"/><span>—</span></div>)}</div></section>
  <section className="dailyreturns" aria-label="Daily returns"><div className="dailyreturnsheading"><h2>Daily returns</h2></div><Skeleton className="pendingcalendar" aria-hidden="true"/></section>
 </>;
}
