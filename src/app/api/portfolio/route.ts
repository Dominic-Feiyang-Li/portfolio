import {readState,saveState,applyMutation} from '@/server/storage';
import {mutation} from '@/server/validation';
import {body,respond,failure,revision,checkOrigin} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){try{const user=await checkOrigin(req);return respond(await readState(user?.id))}catch(e){return failure(e)}}
export async function POST(req:Request){try{const user=await checkOrigin(req);const b=await body(req),state=await readState(user?.id),operation=mutation(b.mutation);return respond(await saveState(applyMutation(state,operation),revision(b.revision),false,operation,[],user?.id))}catch(e){return failure(e)}}
