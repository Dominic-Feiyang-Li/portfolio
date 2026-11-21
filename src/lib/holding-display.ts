import type {Position} from '@/types/portfolio';
import {assetName} from './labels';
import {exposureName} from './exposure';

// Display groups retain their original position objects for all edits and trades.
export function holdingDisplayGroups(positions:Position[]){
 const groups=new Map<string,{key:string;name:string;positions:Position[]}>();
 for(const position of positions){
  if(position.quantity<=0)continue;
  const exposure=exposureName(position);
  const index=exposure==='纳指'?'Nasdaq 100':exposure==='标普'?'S&P 500':null;
  const key=index?'index:'+index:'position:'+position.id;
  const group=groups.get(key);
  if(group)group.positions.push(position);else groups.set(key,{key,name:index??assetName(position),positions:[position]});
 }
 return [...groups.values()];
}

const beijingTime=new Intl.DateTimeFormat('sv-SE',{
 timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'
});

// Tencent stores the market timestamp in its source field. quoteAt for these
// records is the retrieval time, which can be days later after a market close.
export function priceTimeLabel(position:Position){
 if(position.category==='现金')return '';
 const {quoteSource,quoteAt,provider}=position;
 const marketTime=quoteSource?.match(/^腾讯 · (\d{4})-?(\d{2})-?(\d{2})\s?(\d{2}):?(\d{2}):?\d{2}$/);
 if(marketTime){
  const [,year,month,day,hour,minute]=marketTime;
  return 'Market time · '+year+'-'+month+'-'+day+' '+hour+':'+minute;
 }
 const manual=provider==='manual'||quoteSource==='手动价格';
 const time=Date.parse(quoteAt??'');
 if(!Number.isFinite(time))return manual?'Manual price · Time unknown':'Price time unknown';
 const label=manual?'Entered':quoteSource?.includes('response time')?'Source response':'Price record';
 return label+' · '+beijingTime.format(time)+' UTC+8';
}
