'use client';
import {holdingDisplayGroups} from '@/lib/holding-display';
import {marketValue} from '@/lib/portfolio';
import type {Position,Rates,Currency} from '@/types/portfolio';
const shades=Array.from({length:12},(_,i)=>`var(--allocation-${i+1})`);
export default function AllocationChart({positions,rates,hidden}:{positions:Position[];rates:Rates;currency:Currency;hidden:boolean}){
 const missing=positions.some(p=>p.quantity>0&&!(rates[p.currency]>0));
 const groups=holdingDisplayGroups(positions).map(g=>({...g,value:g.positions.reduce((n,p)=>n+marketValue(p,rates),0)})).filter(g=>g.value>0).sort((a,b)=>b.value-a.value);
 const total=groups.reduce((n,g)=>n+g.value,0);let offset=0;
 return <section className="portfolioallocation" aria-label="Asset allocation"><div className="allocationheading"><h2>Allocation</h2><span>By market value</span></div>{missing?<p className="emptytext">Update exchange rates to view allocation.</p>:!groups.length?<p className="emptytext">Add assets to see your allocation.</p>:<div className="allocationcontent"><div className="allocationring"><svg viewBox="0 0 200 200" role="img" aria-label="Portfolio allocation by asset"><circle cx="100" cy="100" r="78" fill="none" stroke="var(--border)" strokeWidth="20"/>{groups.map((g,i)=>{const pct=g.value/total*100,start=offset;offset+=pct;return <circle key={g.key} cx="100" cy="100" r="78" fill="none" stroke={shades[i%shades.length]} strokeWidth="20" pathLength="100" strokeDasharray={`${Math.max(.01,pct-.65)} ${100-Math.max(.01,pct-.65)}`} strokeDashoffset={-start} transform="rotate(-90 100 100)"><title>{g.name}: {hidden?'Hidden':pct.toFixed(1)+'%'}</title></circle>})}</svg><div className="allocationringcenter"><strong>{groups.length}</strong><span>assets</span></div></div><div className="allocationentries">{groups.map((g,i)=><div className="allocationentry" key={g.key}><span className="allocationswatch" style={{background:shades[i%shades.length]}}/><span>{g.name}</span><strong>{hidden?'•••':(g.value/total*100).toFixed(1)+'%'}</strong></div>)}</div></div>}</section>;
}
