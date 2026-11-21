import {actualPortfolio} from '@/server/actual-history';
import {historicalDailyPnl} from '@/server/daily-pnl';
import {readState} from '@/server/storage';
import {historicalPortfolio,priceRanges} from '@/server/prices';
import {checkOrigin,respond,failure} from '@/server/http';
import {InputError} from '@/server/validation';
import {assetClasses} from '@/types/portfolio';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){try{const user=await checkOrigin(req);const url=new URL(req.url),range=url.searchParams.get('range')||'1M',category=url.searchParams.get('category')||'全部',account=url.searchParams.get('account')||'all',metric=url.searchParams.get('metric')||'value';if(!['value','pnl','actual'].includes(metric))throw new InputError('走势类型不正确');if(!priceRanges.includes(range)||category!=='全部'&&!assetClasses.includes(category as typeof assetClasses[number]))throw new InputError('时间或分类不正确');if(metric==='actual'&&(account!=='all'||category!=='全部'))throw new InputError('实际走势目前仅支持全部账户与资产');const s=await readState(user?.id);if(account!=='all'&&!s.accounts.some(a=>a.id===account))throw new InputError('账户不存在');const rows=s.positions.filter(p=>(category==='全部'||p.category===category)&&(account==='all'||p.accountId===account));return respond(metric==='actual'?await actualPortfolio(s,range,user?.id):metric==='pnl'?await historicalDailyPnl(s,rows,range,category):await historicalPortfolio(s,rows,range))}catch(e){return failure(e)}}
