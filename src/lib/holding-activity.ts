import type {Currency} from '@/types/portfolio';

export interface HoldingTrade {
 id:string;
 timestamp:string;
 side:'Buy'|'Sell'|'Swap in'|'Swap out';
 quantity:number;
 price:number|null;
}
export interface HoldingActivity {
 id:string;
 trades:HoldingTrade[];
 today:{amount:number;basis:number;asOf:string}|null;
 currency:Currency;
}
