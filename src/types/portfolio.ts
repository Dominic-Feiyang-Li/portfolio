export const currencies = ['CNY', 'USD', 'HKD'] as const;
export type Currency = typeof currencies[number];
export const assetClasses = ['加密货币', '美股', 'A股 / ETF', '现金'] as const;
export type AssetClass = typeof assetClasses[number];
export type Rates = Record<Currency, number>;
export interface Position {
  id: string; symbol: string; name: string; category: AssetClass;
  accountId: string; currency: Currency; quantity: number;
  price: number; previousClose: number; averageCost: number | null;
  provider: 'auto' | 'manual'; quoteAt: string | null;
  quoteSource: string; quoteError: string | null;
}
export interface Account { id: string; name: string; note: string }
export interface Snapshot { id: string; timestamp: string; valueCny: number; categories: Record<AssetClass, number>; reason: string }
export interface SwapDetails {
  fromPositionId: string; toPositionId: string; toSymbol: string;
  fromQuantity: number; toQuantity: number; value: number | null;
  feeSide: 'from' | 'to'; feeQuantity: number;
}
export interface LedgerEntry {
  id: string; timestamp: string; type: '买入' | '卖出' | '币币兑换' | '持仓调整' | '持仓删除' | '账户变更';
  symbol: string; accountName: string; quantity: number; price: number | null;
  swap?: SwapDetails; currency: Currency; fee: number | null; realizedPnl: number | null; note: string;
}
export interface Settings { currency: Currency; autoRefresh: boolean; autoFx: boolean; refreshSeconds: number; rates: Rates; fxDate: string | null; fxSource: string; fxError: string | null }
export interface PortfolioState { version: 1; revision: number; positions: Position[]; accounts: Account[]; snapshots: Snapshot[]; ledger: LedgerEntry[]; settings: Settings; lastRefresh: string | null }
export type Mutation =
 | {action: 'position'; position: Position}
 | {action: 'delete-position'; id: string}
 | {action: 'account'; account: Account}
 | {action: 'delete-account'; id: string}
 | {action: 'settings'; settings: Settings}
 | ({action: 'swap'; timestamp: string} & Omit<SwapDetails, 'toSymbol'>)
 | {action: 'trade'; positionId: string; type: '买入' | '卖出'; quantity: number; price: number; fee: number; settleCash: boolean; timestamp: string};
