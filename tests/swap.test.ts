import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyState} from '../src/lib/portfolio';
import type {Position,Mutation} from '../src/types/portfolio';
import {mutation,validateState,validateHistory} from '../src/server/validation';
import {makeAudit} from '../src/server/history';
import {positionsAt} from '../src/server/actual-history';
import {reconcileLedger} from '../src/server/reconciliation';
const temp=mkdtempSync(join(tmpdir(),'portfolio-swap-'));process.env.PORTFOLIO_DATA_DIR=temp;
const {applyMutation,readState,saveState,readHistory}=require('../src/server/store') as typeof import('../src/server/store');
function fixture(){
 const state=emptyState();state.accounts=[{id:'a',name:'Test exchange',note:''}];
 const p:Position={id:'btc',symbol:'BTC',name:'Bitcoin',category:'加密货币',currency:'USD',accountId:'a',quantity:1,price:60000,previousClose:60000,averageCost:40000,provider:'manual',quoteAt:null,quoteSource:'',quoteError:null};
 state.positions=[p,{...p,id:'ada',symbol:'ADA',name:'Cardano',quantity:100,price:1,previousClose:1,averageCost:.5},{...p,id:'cash',symbol:'USD',name:'USD',category:'现金',quantity:10,price:1,previousClose:1,averageCost:1}];return state;
}
const op:Extract<Mutation,{action:'swap'}>={action:'swap',fromPositionId:'btc',toPositionId:'ada',fromQuantity:.1,toQuantity:6000,value:6000,feeQuantity:0,feeSide:'from',timestamp:'2026-11-01T12:00:00+08:00'};
try{
 const before=fixture(),state=applyMutation(structuredClone(before),mutation(op));
 assert.equal(state.positions[0].quantity,.9);assert.equal(state.positions[1].quantity,6100);assert.equal(state.positions[1].averageCost,6050/6100);assert.equal(state.positions[2].quantity,10);assert.equal(state.ledger.length,1);assert.equal(state.ledger[0].realizedPnl,2000);
 const audit=makeAudit(before,state,op)!;assert.equal(audit.before?.positions.length,2);assert.equal(audit.after?.positions.length,2);
 assert.equal(reconcileLedger(state,[audit]).unresolved.length,0);
 const restored=positionsAt(state.positions,[audit],Date.parse(op.timestamp)-1);assert.ok(Math.abs(restored.find(p=>p.id==='btc')!.quantity-1)<1e-12);assert.equal(restored.find(p=>p.id==='ada')?.quantity,100);
 assert.deepEqual(validateState(state).ledger,state.ledger);assert.deepEqual(validateHistory([audit]),[audit]);
 const incoming=applyMutation(fixture(),{...op,feeSide:'to',feeQuantity:10});assert.equal(incoming.positions[1].quantity,6090);assert.equal(incoming.positions[1].averageCost,6050/6090);assert.equal(incoming.ledger[0].fee,10);assert.equal(incoming.ledger[0].realizedPnl,2000);
 const outgoing=applyMutation(fixture(),{...op,feeQuantity:.001});assert.equal(outgoing.positions[0].quantity,.899);assert.equal(outgoing.positions[1].averageCost,6110/6100);assert.equal(outgoing.ledger[0].fee,60);assert.ok(Math.abs(outgoing.ledger[0].realizedPnl!-1960)<1e-8);
 const unvalued=applyMutation(fixture(),mutation({...op,value:null}));assert.equal(unvalued.positions[1].averageCost,null);assert.equal(unvalued.positions[0].averageCost,40000);assert.equal(unvalued.ledger[0].price,null);assert.equal(unvalued.ledger[0].fee,null);assert.equal(unvalued.ledger[0].realizedPnl,null);assert.deepEqual(validateState(unvalued).ledger,unvalued.ledger);
 const unknown=fixture();unknown.positions[0].averageCost=null;unknown.positions[1].averageCost=null;applyMutation(unknown,op);assert.equal(unknown.ledger[0].realizedPnl,null);assert.equal(unknown.positions[1].averageCost,null);
 const zero=fixture();zero.positions[1].quantity=0;zero.positions[1].averageCost=null;applyMutation(zero,op);assert.equal(zero.positions[1].averageCost,1);
 for(const bad of [{...op,toPositionId:'btc'},{...op,fromQuantity:2},{...op,fromQuantity:1,feeQuantity:.001},{...op,feeSide:'to' as const,feeQuantity:6000},{...op,toPositionId:'cash'}]){const s=fixture(),copy=structuredClone(s);assert.throws(()=>applyMutation(s,bad));assert.deepEqual(s,copy)}
 for(const field of ['fromQuantity','toQuantity','value','feeQuantity'])assert.throws(()=>mutation({...op,[field]:NaN}));
 for(const field of ['accountId','currency']){const s=fixture();Object.assign(s.positions[1],{[field]:'other'});assert.throws(()=>applyMutation(s,op))}
 let saved=saveState(fixture(),readState().revision);const original=structuredClone(saved);saved=saveState(applyMutation(saved,op),saved.revision,false,op);const history=readHistory(undefined,'trades');assert.equal(history.total,1);assert.equal(history.records[0].type,'币币兑换');assert.equal(history.records[0].legacy,false);assert.deepEqual(history.records[0].trade?.swap,saved.ledger[0].swap);assert.equal(readState().positions[2].quantity,original.positions[2].quantity);
 console.log('Crypto swap: balances, fees, cost, validation, atomic rejection, replay, backup and persistence passed');
}finally{rmSync(temp,{recursive:true,force:true})}
