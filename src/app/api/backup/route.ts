import {readState,saveState,takeSnapshot,exportHistory} from '@/server/storage';
import {validateState,validateHistory,object} from '@/server/validation';
import {body,respond,failure,revision,checkOrigin} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){try{const user=await checkOrigin(req);return new Response(JSON.stringify({...await readState(user?.id),history:await exportHistory(user?.id)},null,2),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="portfolio-backup.json"','Cache-Control':'no-store'}})}catch(e){return failure(e)}}
export async function POST(req:Request){try{const user=await checkOrigin(req);const b=await body(req),state=validateState(b.state),history=validateHistory(object(b.state).history);takeSnapshot(state,'恢复备份');return respond(await saveState(state,revision(b.revision),true,undefined,history,user?.id))}catch(e){return failure(e)}}
