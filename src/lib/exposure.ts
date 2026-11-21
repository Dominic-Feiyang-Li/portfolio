import type {Position,Rates} from '@/types/portfolio';
import {marketValue} from './portfolio';
export const exposureClasses=['纳指','标普','个股','债券/红利','黄金','现金'] as const;
export function exposureName(p:Pick<Position,'symbol'|'name'|'category'>){
 const symbol=p.symbol.toUpperCase(),name=p.name;
 if(p.category==='现金')return '现金';
 if(p.category==='加密货币')return '加密货币';
 if(['159501','159659','QQQM','QQQ'].includes(symbol)||/纳指|纳斯达克|NASDAQ/i.test(name))return '纳指';
 if(['513650','VOO','SPY','IVV','SPLG','SPYM'].includes(symbol)||/标普|S&P\s*500/i.test(name))return '标普';
 if(symbol==='512890'||/红利|股息|dividend/i.test(name))return '债券/红利';
 if(['511260','511010','511020','511100','TLT','IEF','SHY','BND','AGG','SGOV','BIL','GOVT','VGIT','VGLT'].includes(symbol)||/债券|国债|政金债|信用债|可转债|城投债|国开债|美债|短债|长债|中债|利率债|纯债|\bbond\b|treasury/i.test(name))return '债券/红利';
 if(['518850','518880','518800','159934','159937','GLD','IAU','GLDM','SGOL'].includes(symbol)||/黄金|\bgold\b/i.test(name))return '黄金';
 // Other equity holdings, including broad-market equity funds.
 return '个股';
}
export function groupPositions(rows:Position[]) {
 const groups=new Map<string,Position[]>();
 for(const position of rows){const name=exposureName(position);const members=groups.get(name);if(members)members.push(position);else groups.set(name,[position])}
 return [...groups].map(([name,positions])=>({name,positions}));
}
export function exposureAllocation(rows:Position[],rates:Rates){
 const groups=groupPositions(rows).map(group=>({...group,value:group.positions.reduce((sum,p)=>sum+marketValue(p,rates),0),symbols:[...new Set(group.positions.map(p=>p.symbol))]}));
 const total=groups.reduce((sum,g)=>sum+g.value,0);
 return groups.filter(g=>g.value>0).sort((a,b)=>b.value-a.value).map(g=>({...g,percent:total?g.value/total*100:0}));
}
