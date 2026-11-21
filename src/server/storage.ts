// Local SQLite remains available. Vercel always uses durable cloud storage and fails closed if unconfigured.
import {authEnabled,AuthError} from './auth';
import * as local from './store';
import {cloudEnabled,cloudRead,cloudSave,cloudHistory,cloudRpc} from './cloud';
import type {PortfolioState,Mutation} from '@/types/portfolio';
import type {AuditRecord} from '@/types/history';
import type {PriceSeries} from '@/types/prices';
export {applyMutation,takeSnapshot,ConflictError} from './store';
function owner(userId?:string){if((cloudEnabled()||authEnabled())&&!userId)throw new AuthError();return userId}
export async function readState(userId?:string){owner(userId);return cloudEnabled()?cloudRead(userId!):local.readState(userId)}
export async function saveState(state:PortfolioState,revision:number,backup=false,operation?:Mutation,history:AuditRecord[]=[],userId?:string){owner(userId);return cloudEnabled()?cloudSave(userId!,state,revision,backup,operation,history):local.saveState(state,revision,backup,operation,history,userId)}
export async function saveQuoteState(state:PortfolioState,before:PortfolioState,userId?:string){owner(userId);return cloudEnabled()?cloudSave(userId!,state,before.revision,false,undefined,[],before):local.saveState(state,before.revision,false,undefined,[],userId)}
export async function readHistory(cursor?:number,scope='all',userId?:string){owner(userId);return cloudEnabled()?cloudHistory(userId!,cursor,scope):local.readHistory(cursor,scope,userId)}
export async function exportHistory(userId?:string){owner(userId);return cloudEnabled()?cloudRpc<AuditRecord[]>('export-history',{userId}):local.exportHistory(userId)}
export async function readPriceCache(key:string){return cloudEnabled()?cloudRpc<{fetchedAt:number;series:PriceSeries}|null>('cache-read',{key}):local.readPriceCache(key)}
export async function savePriceCache(key:string,series:PriceSeries){if(cloudEnabled())await cloudRpc('cache-save',{key,series});else local.savePriceCache(key,series)}

export async function readFixedValuations(userId:string){owner(userId);return cloudEnabled()?cloudRpc<import('./fixed-valuations').FixedValuation[]>('read',{userId},'portfolio_valuation_rpc'):local.readFixedValuations(userId)}
export async function saveFixedValuation(point:import('./fixed-valuations').FixedValuation,userId:string){owner(userId);if(cloudEnabled())await cloudRpc('save',{userId,point},'portfolio_valuation_rpc');else local.saveFixedValuation(point,userId)}

// Server-only cache namespace; private derived results must include owner and input fingerprint in the key.
export async function readDataCache<T>(key:string){return cloudEnabled()?cloudRpc<{fetchedAt:number;series:T}|null>('cache-read',{key}):local.readPriceCache<T>(key)}
export async function saveDataCache<T>(key:string,series:T){if(cloudEnabled())await cloudRpc('cache-save',{key,series});else local.savePriceCache<T>(key,series)}
