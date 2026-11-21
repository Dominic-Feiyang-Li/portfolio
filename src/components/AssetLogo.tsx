import type {ReactNode} from 'react';
export default function AssetLogo({name,symbol}:{name:string;symbol?:string}){
 const cashSymbols:Record<string,string>={CNY:'¥',USD:'$',HKD:'$'};
 const currency=(symbol||name.split(' ')[0]).toUpperCase();
 if(/cash/i.test(name)&&cashSymbols[currency])return <span className="assetlogo" aria-hidden="true"><span className="cashsymbol">{cashSymbols[currency]}</span></span>;
 const key=(symbol||name).toUpperCase();let mark:ReactNode;
 if(name==='Nasdaq 100')mark=<><path d="M7 24V8l14 16V8M12 24l8-16"/></>;
 else if(name==='S&P 500')mark=<><path d="M6 22h5v-5h5v-5h6V7"/><path d="m17 7 5 0 0 5"/></>;
 else if(key==='BTC'||name==='Bitcoin')mark=<text x="16" y="23" textAnchor="middle" fill="currentColor" stroke="none" fontSize="23" fontFamily="Arial">₿</text>;
 else if(key==='ETH'||name==='Ethereum')mark=<><path d="m16 4 8 12-8 5-8-5Z"/><path d="m8 19 8 9 8-9-8 5Z"/><path d="M16 4v17" opacity=".4"/></>;
 else if(key==='ADA'||name==='Cardano')mark=<>{[[16,16,2],[11,11,1.5],[21,11,1.5],[11,21,1.5],[21,21,1.5],[16,6,1],[6,16,1],[26,16,1],[16,26,1],[7,7,.7],[25,7,.7],[7,25,.7],[25,25,.7]].map(([x,y,r],i)=><circle key={i} cx={x} cy={y} r={r} fill="currentColor" stroke="none"/>)}</>;
 else if(key==='TSLA'||name==='Tesla')mark=<><path d="M6 8q10-5 20 0M9 11q7-3 14 0M16 10v17m-3-15 3 15 3-15"/></>;
 else if(key==='ORCL'||name==='Oracle')mark=<rect x="5" y="10" width="22" height="12" rx="6" strokeWidth="2.5"/>;
 else if(name==='Gold')mark=<><path d="m7 22 3-10h12l3 10ZM10 12l5 10m7-10-5 10M13 8h6"/></>;
 else if(name==='Dividend')mark=<><path d="M16 27V14m0 5C6 19 6 7 6 7s11 0 10 12Zm0-4C16 6 26 6 26 6s0 10-10 9Z"/></>;
 else if(name==='Treasury')mark=<><path d="m5 11 11-6 11 6ZM7 26h18M9 14v9m7-9v9m7-9v9"/></>;
 else if(/cash/i.test(name))mark=<><rect x="4" y="8" width="24" height="16" rx="3"/><circle cx="16" cy="16" r="4"/><path d="M8 15v2m16-2v2"/></>;
 else mark=<><path d="m16 5 11 11-11 11L5 16Z"/><circle cx="16" cy="16" r="4"/></>;
 return <span className="assetlogo" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">{mark}</svg></span>;
}
