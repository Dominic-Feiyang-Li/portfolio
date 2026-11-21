import {assetClasses, type Position, type Rates, type Currency, type PortfolioState} from '@/types/portfolio';
export const marketValue = (p: Position,rates: Rates) => p.quantity*p.price*rates[p.currency];
export const totalProfit = (p: Position,rates: Rates) => p.category==='现金'||p.averageCost===null?0:p.quantity*(p.price-p.averageCost)*rates[p.currency];
export const priceProfit = (p: Position,rates: Rates) => p.category==='现金'?0:p.quantity*(p.price-p.previousClose)*rates[p.currency];
export function summarize(rows: Position[],rates: Rates) {
 const value=rows.reduce((s,p)=>s+marketValue(p,rates),0);
 const profit=rows.reduce((s,p)=>s+totalProfit(p,rates),0);
 const change=rows.reduce((s,p)=>s+priceProfit(p,rates),0);
 const cost=rows.reduce((s,p)=>s+(p.category==='现金'||p.averageCost===null?0:p.quantity*p.averageCost*rates[p.currency]),0);
 const previous=rows.reduce((s,p)=>s+(p.category==='现金'?0:p.quantity*p.previousClose*rates[p.currency]),0);
 return {value,profit,change,unknownCost:rows.some(p=>p.category!=='现金'&&p.quantity>0&&p.averageCost===null),profitPercent:cost?profit/cost*100:0,changePercent:previous?change/previous*100:0};
}
export function formatAmount(value: number,currency: Currency,digits=2) {return new Intl.NumberFormat('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value)}
export const signed = (n:number,digits=2) => `${n>0?'+':''}${n.toFixed(digits)}`;
export const currencySymbol: Record<Currency,string> = {CNY:'¥',USD:'$',HKD:'HK$'};
export function hasMissingRates(state:PortfolioState){return state.positions.some(p=>p.quantity>0&&state.settings.rates[p.currency]<=0)}
export function categories(state: PortfolioState){return Object.fromEntries(assetClasses.map(c=>[c,state.positions.filter(p=>p.category===c).reduce((s,p)=>s+marketValue(p,state.settings.rates),0)])) as Record<typeof assetClasses[number],number>}
export function emptyState():PortfolioState {return {version:1,revision:0,positions:[],accounts:[],snapshots:[],ledger:[],lastRefresh:null,settings:{currency:'USD',autoRefresh:true,autoFx:true,refreshSeconds:60,rates:{CNY:1,USD:0,HKD:0},fxDate:null,fxSource:'未设置',fxError:null}}}
