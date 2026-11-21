export interface PricePoint {time:number;price:number}
export interface PriceSeries {points:PricePoint[];source:string;currency:'USD'|'CNY'|'HKD'}
export interface ValuePoint {timestamp:string;valueCny:number}
export interface DailyPnlPoint extends ValuePoint {openingValueCny:number;openingTimestamp:string;closingTimestamp:string;provisional:boolean;source?:'recorded'|'history';openCny?:number;highCny?:number;lowCny?:number;closeCny?:number}
export interface HistoricalPortfolio {points:ValuePoint[];sources:string[];warnings:string[];range:string;availableFrom:string|null;dailyPnl?:DailyPnlPoint[];fixedTimestamps?:string[];gapTimestamps?:string[];priceReturns?:import('@/lib/daily-returns').DailyReturn[]}
