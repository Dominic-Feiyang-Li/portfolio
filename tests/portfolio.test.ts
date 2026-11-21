import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {emptyState,summarize} from '../src/lib/portfolio';
import {applyMutation,readState,saveState,ConflictError,readHistory,exportHistory} from '../src/server/store';
import {parseStocks,parseCoinLore,convertUsdQuote} from '../src/server/quotes';
import {validateState,InputError,validateHistory} from '../src/server/validation';
import {checkRequestOrigin} from '../src/server/http';
import {combineHistory,parseEastMoney,parseCoinHistory} from '../src/server/prices';
import {stateAtBoundary} from '../src/server/fixed-valuations';
import {makeAudit} from '../src/server/history';
import {parseYahooHistory,reconstructBoundaries} from '../src/server/daily-pnl';
import {dailyPnl,dailyCandles} from '../src/lib/pnl';
import {nearestTimestampIndex,smoothChart} from '../src/lib/chart';
import {exposureAllocation,groupPositions} from '../src/lib/exposure';
import type {Position,PortfolioState} from '../src/types/portfolio';
const temp=mkdtempSync(join(tmpdir(),'portfolio-unit-'));process.env.PORTFOLIO_DATA_DIR=temp;
let passed=0;function test(name:string,fn:()=>void){fn();passed++;console.log('✓ '+name)}
function fixture():PortfolioState{const s=emptyState();s.settings.rates={CNY:1,USD:7,HKD:.9};s.accounts=[{id:'a',name:'券商',note:''}];s.positions=[{id:'p',symbol:'TSLA',name:'Tesla',category:'美股',accountId:'a',currency:'USD',quantity:10,price:120,previousClose:110,averageCost:100,provider:'manual',quoteAt:null,quoteSource:'手动',quoteError:null},{id:'cash',symbol:'USD',name:'美元现金',category:'现金',accountId:'a',currency:'USD',quantity:1000,price:1,previousClose:1,averageCost:1,provider:'manual',quoteAt:null,quoteSource:'面值',quoteError:null}];return s}
try{
 test('每日 P&L 按北京时间零点边界计算，不使用成本或日内首条记录替代基准',()=>{
  const point=(time:string,valueCny:number)=>({timestamp:time,valueCny});
  const now=Date.parse('2026-10-03T12:00:00+08:00');
  const values=[point('2026-10-01T00:00:00+08:00',100),point('2026-10-01T12:00:00+08:00',500),point('2026-10-02T00:00:00+08:00',120),point('2026-10-02T13:00:00+08:00',50),point('2026-10-03T00:00:00+08:00',90),point('2026-10-03T11:00:00+08:00',110),point('2026-10-03T15:00:00+08:00',999)];
  const days=dailyPnl(values,'1W',now).points;
  assert.deepEqual(days.map(p=>p.valueCny),[20,-30,20]);
  assert.deepEqual(days.map(p=>p.openingValueCny),[100,120,90]);
  assert.equal(days[0].provisional,false);assert.equal(days[2].provisional,true);
  assert.equal(days[0].timestamp,'2026-09-30T16:00:00.000Z');
  assert.equal(dailyPnl(values,'1D',now).points.length,1);
  assert.equal(dailyPnl(values.slice(1),'1W',now).points[0].openingValueCny,120);
  const sparse=dailyPnl([point('2026-10-02T23:59:00+08:00',100),point('2026-10-03T11:00:00+08:00',103)],'1D',now).points;
  assert.equal(sparse[0].valueCny,3);assert.equal(sparse[0].openingTimestamp,'2026-10-02T23:59:00+08:00');
  assert.deepEqual(dailyPnl([point('2026-10-03T01:00:00+08:00',100),point('2026-10-03T11:00:00+08:00',103)],'1D',now).points,[]);
 });
 test('历史行情补齐北京时间每日零点，保留休市零收益且不使用未来收盘价',()=>{
  const s=fixture(),now=Date.parse('2026-10-03T12:00:00+08:00'),t=(v:string)=>Date.parse(v);
  const data=new Map([['p',{currency:'USD' as const,source:'测试行情',points:[{time:t('2026-09-25T15:00:00+08:00'),price:100},{time:t('2026-10-01T15:00:00+08:00'),price:110},{time:t('2026-10-03T10:00:00+08:00'),price:120}]}]]);
  const history=reconstructBoundaries(s,s.positions,data,'1W',now);
  const days=dailyPnl(history.points,'1W',now).points;
  assert.equal(days.length,7);assert.deepEqual(days.slice(-3).map(p=>p.valueCny),[700,0,700]);
  assert.equal(days.at(-1)?.openingValueCny,14700);assert.equal(days.at(-1)?.valueCny,700);
  assert.equal(reconstructBoundaries(s,s.positions,new Map(),'1W',now).points.length,0);
  const candleStart=t('2026-10-01T23:30:00+08:00');
  const result=parseYahooHistory({chart:{result:[{meta:{currency:'USD'},timestamp:[candleStart/1000],indicators:{quote:[{open:[100],close:[120]}]}}]}},3600000,false,now);
  assert.equal(result.points[0].time,candleStart);assert.equal(result.points[1].time,candleStart+3600000);
  const boundaries=reconstructBoundaries(s,s.positions,new Map([['p',result]]),'1W',now);
  const midnight=boundaries.points.find(p=>p.timestamp==='2026-10-01T16:00:00.000Z');
  assert.equal(midnight?.valueCny,14000);
 });
 test('P&L K线包含连续开高低收，日内高低不等于每日差值柱',()=>{
  const point=(timestamp:string,valueCny:number)=>({timestamp,valueCny}),now=Date.parse('2026-10-03T00:00:00+08:00');
  const candles=dailyCandles([point('2026-10-01T00:00:00+08:00',100),point('2026-10-01T09:00:00+08:00',130),point('2026-10-01T12:00:00+08:00',90),point('2026-10-02T00:00:00+08:00',120),point('2026-10-02T12:00:00+08:00',115),point('2026-10-03T00:00:00+08:00',110)],'1W',now);
  assert.equal(candles.length,2);assert.deepEqual(candles.map(p=>[p.openCny,p.highCny,p.lowCny,p.closeCny,p.valueCny]),[[0,30,-10,20,20],[20,20,10,10,-10]]);
 });
 test('固定零点估值可撤销零点之后的持仓与现金变更，不受任务执行时间影响',()=>{
  const before=fixture(),after=structuredClone(before);after.positions[0].quantity=20;after.positions[1].quantity=0;
  const audit=makeAudit(before,after,{action:'position',position:after.positions[0]})!;audit.timestamp='2026-10-03T00:15:00+08:00';
  const restored=stateAtBoundary(after,[audit],Date.parse('2026-10-03T00:00:00+08:00'));
  assert.deepEqual(restored.positions,before.positions);assert.deepEqual(stateAtBoundary(after,[audit],Date.parse('2026-10-03T01:00:00+08:00')).positions,after.positions);
 });
 test('统一估值、浮动盈亏与行情变动',()=>{const sum=summarize(fixture().positions,fixture().settings.rates);assert.equal(sum.value,15400);assert.equal(sum.profit,1400);assert.equal(sum.change,700);assert.equal(sum.profitPercent,20)});
 test('买入同步现金，手续费计入成本',()=>{const s=fixture();applyMutation(s,{action:'trade',positionId:'p',type:'买入',quantity:2,price:120,fee:2,settleCash:true,timestamp:new Date().toISOString()});assert.equal(s.positions[0].quantity,12);assert.equal(s.positions[0].averageCost,1242/12);assert.equal(s.positions[1].quantity,758);assert.equal(summarize(s.positions,s.settings.rates).value,15386)});
 test('卖出保留剩余成本，记录已实现盈亏',()=>{const s=fixture();applyMutation(s,{action:'trade',positionId:'p',type:'卖出',quantity:4,price:120,fee:3,settleCash:true,timestamp:new Date().toISOString()});assert.equal(s.positions[0].quantity,6);assert.equal(s.positions[0].averageCost,100);assert.equal(s.positions[1].quantity,1477);assert.equal(s.ledger[0].realizedPnl,77)});
 test('缺失成本保留空值，估值可用且不虚构盈亏',()=>{const s=fixture();s.positions[0].averageCost=null;const checked=validateState(s);assert.equal(checked.positions[0].averageCost,null);const sum=summarize(checked.positions,checked.settings.rates);assert.equal(sum.value,15400);assert.equal(sum.profit,0);assert.equal(sum.unknownCost,true);assert.equal(sum.change,700);});
 test('缺失成本买卖不伪造成本和已实现盈亏',()=>{const s=fixture();s.positions[0].averageCost=null;applyMutation(s,{action:'trade',positionId:'p',type:'买入',quantity:1,price:120,fee:1,settleCash:true,timestamp:new Date().toISOString()});assert.equal(s.positions[0].averageCost,null);applyMutation(s,{action:'trade',positionId:'p',type:'卖出',quantity:1,price:125,fee:1,settleCash:true,timestamp:new Date().toISOString()});assert.equal(s.ledger[0].realizedPnl,null);assert.equal(validateState(s).ledger[0].realizedPnl,null);});
 test('超卖与现金不足拒绝',()=>{assert.throws(()=>applyMutation(fixture(),{action:'trade',positionId:'p',type:'卖出',quantity:11,price:120,fee:0,settleCash:true,timestamp:new Date().toISOString()}),InputError);assert.throws(()=>applyMutation(fixture(),{action:'trade',positionId:'p',type:'买入',quantity:20,price:120,fee:0,settleCash:true,timestamp:new Date().toISOString()}),InputError)});
 test('最后一个持仓删除后记录零估值',()=>{const s=fixture();applyMutation(s,{action:'delete-position',id:'p'});applyMutation(s,{action:'delete-position',id:'cash'});assert.equal(s.snapshots.at(-1)?.valueCny,0)});
 test('有持仓账户不能删除',()=>assert.throws(()=>applyMutation(fixture(),{action:'delete-account',id:'a'}),InputError));
 test('坏备份和缺失账户拒绝',()=>{const s=fixture();s.positions[0].accountId='missing';assert.throws(()=>validateState(s),InputError);assert.throws(()=>validateState({...fixture(),positions:[{...fixture().positions[0],quantity:NaN}]}),InputError)});
 test('不接受跨站写入和未知主机',()=>{assert.throws(()=>checkRequestOrigin(new Request('http://localhost:3000/api/portfolio',{headers:{host:'localhost:3000',origin:'https://evil.example'}})),InputError);assert.throws(()=>checkRequestOrigin(new Request('http://localhost:3000/api/portfolio',{headers:{host:'evil.example:3000'}})),InputError)});
 test('真实股票格式解析及无效报价忽略',()=>{const f=Array(31).fill('');f[3]='352.84';f[4]='357.45';f[30]='2026-09-29 16:00:01';const q=parseStocks(`v_usTSLA="${f.join('~')}";v_invalid="1~N/A";`);assert.equal(q.usTSLA.price,352.84);assert.equal(q.usTSLA.previousClose,357.45);assert.equal(q.invalid,undefined)});
 test('Crypto 美元价格与 24h 基准反推正确',()=>{const q=parseCoinLore({id:'257',symbol:'ADA',name:'Cardano',nameid:'cardano',price_usd:'0.245',percent_change_24h:'-2'},Math.floor(Date.now()/1000));assert.equal(q.price,.245);assert.equal(q.previousClose,.25);assert.equal(q.source,'CoinLore · USD/24h')});
 test('Crypto 原币换算保持盈亏口径，不把 USDT 当美元',()=>{const q=parseCoinLore({id:'90',symbol:'BTC',name:'Bitcoin',nameid:'bitcoin',price_usd:'84000',percent_change_24h:'5'},Math.floor(Date.now()/1000));const c=convertUsdQuote(q,'CNY',{CNY:1,USD:7,HKD:.9});assert.equal(c.price,588000);assert.equal(c.previousClose,560000);assert.equal(convertUsdQuote(q,'USD',{CNY:1,USD:0,HKD:0}).price,84000);assert.throws(()=>convertUsdQuote(q,'HKD',{CNY:1,USD:0,HKD:0}),InputError)});
 test('Crypto 过期或缺失涨跌报价拒绝',()=>{const row={id:'90',symbol:'BTC',name:'Bitcoin',nameid:'bitcoin',price_usd:'84000',percent_change_24h:''};assert.throws(()=>parseCoinLore(row,Math.floor(Date.now()/1000)));assert.throws(()=>parseCoinLore({...row,percent_change_24h:'1'},1))});
 test('SQLite 保存重读、冲突检测与完整备份恢复',()=>{const first=readState();const saved=saveState(fixture(),first.revision);assert.equal(saved.revision,1);assert.equal(readState().positions.length,2);assert.throws(()=>saveState(fixture(),0),ConflictError);const restored=saveState(validateState(JSON.parse(JSON.stringify(saved))),saved.revision,true);assert.equal(restored.revision,2);assert.equal(readState().positions[0].quantity,10)});
 test('操作记录保存修改前后，冲突与坏数据不写记录',()=>{let s=readState();const op={action:'position' as const,position:{...s.positions[0],quantity:7}};const before=s.positions[0].quantity;const saved=saveState(applyMutation(s,op),s.revision,false,op);const row=readHistory().records[0];assert.equal(row.type,'修改持仓');assert.equal(row.before?.positions[0].quantity,before);assert.equal(row.after?.positions[0].quantity,7);const count=readHistory().total;assert.throws(()=>saveState(saved,0,false,op),ConflictError);assert.throws(()=>saveState({...saved,positions:[{...saved.positions[0],quantity:-1}]},saved.revision,false,op),InputError);assert.equal(readHistory().total,count);});
 test('买卖记录及同步现金变更永久保留，删除持仓和恢复旧账本不清空',()=>{let s=readState();const op={action:'trade' as const,positionId:'p',type:'卖出' as const,quantity:1,price:125,fee:1,settleCash:true,timestamp:new Date().toISOString()};s=saveState(applyMutation(s,op),s.revision,false,op);const trade=readHistory(undefined,'trades').records[0];assert.equal(trade.type,'卖出');assert.equal(trade.trade?.fee,1);assert.equal(trade.before?.positions.length,2);assert.equal(trade.after?.positions.length,2);const id=trade.id;const del={action:'delete-position' as const,id:'p'};s=saveState(applyMutation(s,del),s.revision,false,del);assert.ok(readHistory(undefined,'trades').records.some(r=>r.id===id));const restored=saveState(emptyState(),s.revision,true);assert.equal(restored.ledger.length,0);assert.ok(readHistory(undefined,'trades').records.some(r=>r.id===id));assert.equal(readHistory().records[0].type,'导入备份');const records=exportHistory();assert.deepEqual(validateHistory(JSON.parse(JSON.stringify(records))),records);saveState(restored,restored.revision,true,undefined,records);assert.equal(readHistory(undefined,'trades').records.filter(r=>r.id===id).length,1);});
 test('账户与设置修改留痕，分页不会遗漏记录',()=>{let s=readState();const account={action:'account' as const,account:{id:'audit-account',name:'日志测试',note:'之前'}};s=saveState(applyMutation(s,account),s.revision,false,account);const edit={...account,account:{...account.account,note:'之后'}};s=saveState(applyMutation(s,edit),s.revision,false,edit);assert.equal(readHistory().records[0].before?.accounts[0].note,'之前');assert.equal(readHistory().records[0].after?.accounts[0].note,'之后');for(let i=0;i<55;i++){const op={action:'settings' as const,settings:{...s.settings,currency:i%2?'USD' as const:'CNY' as const}};s=saveState(applyMutation(s,op),s.revision,false,op);}const first=readHistory();assert.equal(first.records.length,50);assert.ok(first.nextCursor);const second=readHistory(first.nextCursor!);assert.equal(new Set([...first.records,...second.records].map(r=>r.id)).size,first.total);assert.ok(first.records[0].before?.settings);assert.ok(first.records[0].after?.settings);});
 test('历史价格解析使用真实收盘价与时间，无效价格被忽略',()=>{assert.deepEqual(parseEastMoney({data:{klines:['2026-09-29,100,120','bad,0,NaN']}}),[{time:Date.parse('2026-09-29T00:00:00Z'),price:120}]);assert.equal(parseEastMoney({data:{klines:['2026-09-30 04:00,10,12']}},true)[0].time,Date.parse('2026-09-29T20:00:00Z'));assert.deepEqual(parseCoinHistory({price:[[1,3],[2,0],['bad',5]]}),[{time:1,price:3}]);});
 test('历史回算按当前数量及汇率，闭市沿用已有报价，不虚构缺失资产',()=>{const s=fixture(),now=Date.parse('2026-09-30T00:00:00Z');const data=new Map([['p',{points:[{time:now-3*86400000,price:100},{time:now-86400000,price:110}],currency:'USD' as const,source:'测试价格'}]]);const result=combineHistory(s,s.positions,data,'1W',now);assert.equal(result.points[0].valueCny,14000);assert.equal(result.points.at(-1)?.valueCny,15400);assert.equal(result.warnings.length,0);assert.equal(combineHistory(s,s.positions,new Map(),'1M',now).points.length,0);});
 test('所有纳指产品合并，现金合并且仓位占比合计100%',()=>{const s=fixture();const rows=[{...s.positions[0],id:'n1',symbol:'159501',name:'嘉实纳指',quantity:10,price:100},{...s.positions[0],id:'n2',symbol:'159659',name:'招商纳指',quantity:5,price:100},{...s.positions[0],id:'n3',symbol:'QQQM',name:'Invesco',quantity:1,price:100},s.positions[1]];const groups=exposureAllocation(rows,s.settings.rates);assert.equal(groups.filter(g=>g.name==='纳指').length,1);assert.equal(groups.find(g=>g.name==='纳指')?.value,11200);assert.ok(Math.abs(groups.reduce((sum,g)=>sum+g.percent,0)-100)<1e-10);});
 test('跨账户分组合并纳指、加密货币及美股个股，保持金额和原始持仓',()=>{
  const s=fixture(),p=s.positions[0];
  const rows:Position[]=[p,{...p,id:'orcl',symbol:'ORCL',name:'Oracle',accountId:'other'},
   {...p,id:'qqq',symbol:'QQQ',name:'Invesco QQQ Trust'},
   {...p,id:'ndx',symbol:'159659',name:'纳斯达克100 ETF 招商',category:'A股 / ETF',currency:'CNY'},
   {...p,id:'btc',symbol:'BTC',name:'Bitcoin',category:'加密货币',averageCost:null},
   {...p,id:'eth',symbol:'ETH',name:'Ethereum',category:'加密货币'},s.positions[1]];
  const before=JSON.stringify(rows),groups=exposureAllocation(rows,s.settings.rates);
  assert.equal(groups.find(g=>g.name==='纳指')?.positions.length,2);
  assert.deepEqual(groups.find(g=>g.name==='个股')?.symbols,['TSLA','ORCL']);
  assert.deepEqual(groups.find(g=>g.name==='加密货币')?.symbols,['BTC','ETH']);
  assert.equal(summarize(groups.find(g=>g.name==='加密货币')!.positions,s.settings.rates).unknownCost,true);
  assert.equal(groups.reduce((sum,g)=>sum+g.value,0),summarize(rows,s.settings.rates).value);
  assert.equal(groupPositions(rows).flatMap(g=>g.positions).length,rows.length);
  assert.equal(JSON.stringify(rows),before);
  assert.equal(groupPositions(rows.filter(p=>p.accountId==='other'))[0].positions.length,1);
 });
 test('零仓位和其他股票 ETF 纳入个股分类且保留明细',()=>{
  const p=fixture().positions[0],rows=[{...p,quantity:0},{...p,id:'etf',symbol:'IWM',name:'Russell 2000 ETF'}];
  const groups=groupPositions(rows);
  assert.equal(groups.find(g=>g.name==='个股')?.positions[0].quantity,0);
  assert.equal(groups.find(g=>g.name==='个股')?.positions.length,2);
 });
 test('走势图按真实时间定位，覆盖不等间距、端点和未抽样的数据点',()=>{
  const base=Date.parse('2026-10-01T00:00:00Z'),point=(n:number)=>({timestamp:new Date(base+n*1000).toISOString(),valueCny:n});
  const rows=[point(0),point(1),point(100)];
  assert.equal(nearestTimestampIndex([],base),null);
  assert.equal(nearestTimestampIndex([point(0)],base+99999),0);
  assert.equal(nearestTimestampIndex(rows,base-1000),0);
  assert.equal(nearestTimestampIndex(rows,base+2000),1);
  assert.equal(nearestTimestampIndex(rows,base+99000),2);
  assert.equal(nearestTimestampIndex(rows,base+200000),2);
  const dense=Array.from({length:2401},(_,i)=>point(i));
  assert.equal(nearestTimestampIndex(dense,base+1234000),1234);
 });
 console.log(`${passed} checks passed`);
}finally{rmSync(temp,{recursive:true,force:true})}

// Rounded chart segments retain real extrema, and the cursor follows the same curve.
{
 const points=[{x:0,y:50},{x:10,y:10},{x:35,y:80},{x:100,y:40}];
 const curve=smoothChart(points);
 assert.ok(curve.path.includes(' C '));
 for(const p of points)assert.deepEqual(curve.at(p.x),p);
 for(let i=0;i<points.length-1;i++){
  const a=points[i],b=points[i+1];
  for(let j=1;j<100;j++){
   const x=a.x+(b.x-a.x)*j/100,p=curve.at(x);
   assert.equal(p.x,x);
   assert.ok(p.y>=Math.min(a.y,b.y)&&p.y<=Math.max(a.y,b.y));
  }
 }
 assert.deepEqual(smoothChart([{x:5,y:10}]).at(20),{x:5,y:10});
 assert.equal(smoothChart([]).path,'');
}

{
 const p=fixture().positions[0];
 const cases=[['159501','嘉实纳指','纳指'],['QQQM','Invesco','纳指'],['513650','标普ETF','标普'],['VOO','Vanguard','标普'],['TSLA','Tesla','个股'],['600519','贵州茅台','个股'],['512890','红利低波ETF','债券/红利'],['CUSTOM','红利ETF','债券/红利'],['CUSTOM','Dividend ETF','债券/红利'],['511260','十年国债ETF','债券/红利'],['TLT','iShares','债券/红利'],['CUSTOM','中短债基金','债券/红利'],['518850','黄金ETF','黄金'],['GLD','SPDR','黄金']] as const;
 for(const [symbol,name,expected] of cases){
  assert.equal(groupPositions([{...p,symbol,name}])[0].name,expected);
 }
 assert.equal(groupPositions([{...p,symbol:'USD',category:'现金'}])[0].name,'现金');
 assert.equal(groupPositions([{...p,symbol:'BTC',category:'加密货币'}])[0].name,'加密货币');
}
