import {exposureName} from './exposure';
import type {Account,Position} from '@/types/portfolio';

// Presentation labels only. Stored categories and trade types remain unchanged.
const labels:Record<string,string>={
 '请选择两个加密货币持仓':'Select two crypto holdings','兑换币种不能相同':'Choose different coins','兑换须使用同账户、同计价币种的持仓':'Use holdings in the same account and pricing currency','付出数量及手续费超过持仓':'Payment plus fee exceeds your balance','手续费须小于收到数量':'Fee must be smaller than the received quantity','兑换金额不正确':'Invalid swap value','币币兑换；不变更现金；成交数量不含手续费':'Crypto swap; cash unchanged; quantities before fees',
 '现金':'Cash','加密货币':'Crypto','美股':'US stocks','A股 / ETF':'China stocks / ETFs',
 '币币兑换':'Crypto swap','买入':'Buy','卖出':'Sell','持仓调整':'Holding adjustment','新增持仓':'Holding added','修改持仓':'Holding updated','删除持仓':'Holding deleted','持仓删除':'Holding deleted','持仓变更':'Holding change','账户变更':'Account change','新增账户':'Account added','修改账户':'Account updated','删除账户':'Account deleted','导入备份':'Backup imported','修改设置':'Settings updated','设置变更':'Settings updated','行情更新':'Price update','交易记录':'Trade recorded','录入期初持仓':'Opening balance','修改持仓（非交易）':'Holding adjustment (not a trade)',
 '纳指':'Nasdaq','标普':'S&P 500','个股':'Individual stocks','债券/红利':'Bonds / dividends','黄金':'Gold','A股':'China brokerage','人民币现金':'CNY Cash','未设置':'Not set','面值':'Face value','手动价格':'Manual price','手动汇率':'Manual exchange rates',
 '请先登录':'Please sign in','登录尚未配置':'Sign in is not configured','登录信息过长':'Sign-in details are too long','登录信息不正确':'Invalid sign-in details','账号或密码格式不正确':'Invalid username or password format','账号或密码不正确':'Incorrect username or password','尝试次数过多，请15分钟后重试':'Too many attempts. Try again in 15 minutes.',
 '无法完成操作，请检查服务配置或稍后重试':'Unable to complete the operation. Check the service configuration or try again later.',
 '云端访问地址尚未配置':'The cloud URL is not configured','请求地址不正确':'Invalid request URL','请求来源不正确':'Invalid request origin','仅允许本机访问':'Local access only','文件过大，最多 25 MB':'Files must be 25 MB or smaller','数据格式不正确':'Invalid data format','日期不正确':'Invalid date','A股必须使用人民币计价':'China stocks must be priced in CNY','美股必须使用美元计价':'US stocks must be priced in USD','代码只能包含字母、数字、点或连字符':'Symbols can only contain letters, numbers, dots and hyphens','现金代码须与币种相同':'The cash symbol must match its currency','刷新设置不正确':'Invalid refresh settings','不支持的备份版本':'Unsupported backup version','备份格式不正确':'Invalid backup format','数据量超过限制':'Data exceeds the size limit','编号重复':'Duplicate ID','账户名称重复':'Duplicate account name','同一账户存在重复持仓':'Duplicate holding in this account','持仓所属账户不存在':'The holding’s account does not exist','记录编号重复':'Duplicate record ID','历史估值与类别总值不符':'Historical valuation does not match the category totals','现金设置不正确':'Invalid cash settings','不支持的操作':'Unsupported operation','操作记录格式不正确':'Invalid audit record','变更详情格式不正确':'Invalid change details','记录来源不正确':'Invalid record source',
 '数据已在另一页面更新，请重试':'Data was updated in another window. Please try again.','请先添加账户':'Add an account first','该账户已有此资产，请编辑现有持仓':'This asset already exists in the account. Edit the existing holding.','持仓不存在':'Holding not found','账户名称已存在':'This account name already exists','请先移除或转移账户内的持仓':'Remove or transfer this account’s holdings first','请选择股票或加密货币持仓':'Select a stock or crypto holding','卖出数量超过持仓':'Sell quantity exceeds your holding','手续费超过成交金额':'The fee exceeds the trade value','账户现金不足，请先添加相同币种的现金持仓':'Insufficient cash. Add a cash holding in the same currency first.','已同步账户现金':'Account cash updated','未同步账户现金':'Account cash not updated',
 '行情未返回有效价格':'No valid price was returned','美股代码不正确':'Invalid US stock symbol','A股 / ETF 使用六位代码':'China stocks / ETFs require a six-digit code','延时行情':'Delayed quotes','24h 行情数据不完整':'Incomplete 24h price data','行情时间过期':'The quote is out of date','缺少汇率，请先更新或设置汇率':'Exchange rate missing. Refresh or enter the rate in Settings.','行情格式错误':'Invalid quote format','加密货币代码不正确':'Invalid crypto symbol','不支持此交易对':'Unsupported trading pair','行情不可用':'Quotes unavailable','Kraken · UTC 日内':'Kraken · UTC daily','汇率暂不可用':'Exchange rates temporarily unavailable','未找到行情，请检查代码':'No quote found. Check the symbol.','行情连接失败，保留上次价格':'Price connection failed. Previous price retained.','未找到行情':'No quote found','行情暂不可用，保留上次价格':'Quotes unavailable. Previous price retained.','汇率不可用，保留上次价格':'Exchange rate unavailable. Previous price retained.','Frankfurter · 日汇率':'Frankfurter · Daily rates','汇率连接失败，保留已有汇率':'FX connection failed. Existing rates retained.',
 '旧交易缺少持仓和现金明细':'Legacy trades lack holding and cash details','补录交易与持仓调整的先后关系无法确认':'The order of backdated trades and holding adjustments cannot be verified','交易未记录对应的现金结算':'A trade has no recorded cash settlement','交易顺序与初始持仓不一致':'Trade order is inconsistent with opening holdings','缺少历史汇率':'Historical exchange rates are missing','历史汇率暂不可用':'Historical exchange rates are temporarily unavailable','暂无交易或估值记录':'No trade or valuation records yet',
 '真实交易与持仓变更记录':'Actual trades and holding changes','对应日期的历史行情及汇率':'Historical prices and exchange rates for each date','已保存的账本估值':'Saved portfolio valuations',
 '持仓编号':'Holding ID','资产名称':'Asset name','账户编号':'Account ID','数量':'Quantity','现价':'Price','参考价格':'Reference price','成本':'Cost basis','行情模式':'Pricing mode','行情来源':'Quote source','账户名称':'Account name','备注':'Notes','基准币种':'Base currency','刷新间隔':'Refresh interval','美元汇率':'USD rate','港币汇率':'HKD rate','汇率来源':'FX source','记录编号':'Record ID','历史估值':'Historical valuation','类别估值':'Category valuation','记录原因':'Reason','交易编号':'Trade ID','记录类型':'Record type','价格':'Price','费用':'Fee','已实现盈亏':'Realized return','版本号':'Revision','编号':'ID','交易类型':'Trade side','类别':'Asset class','币种':'Currency','代码':'Symbol','日期':'Date','文本':'Text','操作编号':'Operation ID','操作类型':'Action','操作对象':'Subject','账户':'Account'
};
export function interfaceText(value:string):string{
 if(labels[value])return labels[value];
 if(!/\p{Script=Han}/u.test(value))return value;
 if(value.endsWith('不正确'))return 'Invalid '+interfaceText(value.slice(0,-3)).toLowerCase();
 let result=value;
 for(const [source,target] of Object.entries(labels).sort((a,b)=>b[0].length-a[0].length))result=result.replaceAll(source,target);
 result=result.replaceAll('腾讯','Tencent').replaceAll('；','; ').replaceAll('：',': ').replaceAll('（缓存）',' (cached)');
 if(!/\p{Script=Han}/u.test(result))return result;
 if(value.includes('个时点暂无法核对'))return `${value.match(/\d+/)?.[0]??'Some'} observations could not be verified and remain blank.`;
 if(value.includes('历史报价过期'))return value.split('：')[0]+': Historical quote is out of date';
 if(value.includes('缺少历史行情或汇率'))return value.split('：')[0]+': Historical prices or exchange rates are missing';
 return 'Details unavailable in English. Please refresh or check the record.';
}
// Short display names for the China-listed funds in this portfolio.
const mainlandNames:Record<string,string>={
 '159501':'Nasdaq 100',
 '518850':'Gold',
 '511260':'Treasury',
 '512890':'Dividend',
 '513650':'S&P 500',
 '159659':'Nasdaq 100',
};
export function assetName(position:Pick<Position,'name'|'symbol'|'currency'|'category'>){
 if(position.category==='现金')return `${position.currency} Cash`;
 const exposure=exposureName(position);if(exposure==='纳指')return 'Nasdaq 100';if(exposure==='标普')return 'S&P 500';
 if(position.category==='A股 / ETF'&&mainlandNames[position.symbol])return mainlandNames[position.symbol];
 if(!/\p{Script=Han}/u.test(position.name))return (position.name||position.symbol).replace(/\s*\bETF\b/gi,'').trim();
 const names:Record<string,string>={'纳斯达克':'Nasdaq 100','纳指':'Nasdaq 100','标普':'S&P 500','黄金':'Gold','十年国债':'Treasury','国债':'Treasury','红利':'Dividend','沪深300':'CSI 300','中证500':'CSI 500'};
 return Object.entries(names).find(([key])=>position.name.includes(key))?.[1]||(position.category==='A股 / ETF'?'China-listed asset':position.symbol);
}
export function accountName(account:Pick<Account,'name'|'id'>){return /\p{Script=Han}/u.test(account.name)?labels[account.name]||`Account · ${account.id.slice(0,6)}`:account.name}
