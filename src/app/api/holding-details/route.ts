import {checkOrigin,failure,respond} from '@/server/http';
import {exportHistory,readState} from '@/server/storage';
import {holdingActivity} from '@/server/holding-activity';
import {holdingDisplayGroups} from '@/lib/holding-display';
import {InputError} from '@/server/validation';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{
  const user=await checkOrigin(req),params=new URL(req.url).searchParams;
  const state=await readState(user?.id),account=params.get('account');
  const positions=account?state.positions.filter(p=>p.accountId===account):state.positions;
  const group=holdingDisplayGroups(positions).find(g=>g.key===params.get('group'));
  if(!group)throw new InputError('持仓不存在');
  const history=await exportHistory(user?.id),now=Date.now();
  const items=await Promise.all(group.positions.map(p=>holdingActivity(p,state,history,now)));
  return respond({items});
 }catch(e){return failure(e)}
}
