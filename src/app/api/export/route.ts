import {readState} from '@/server/storage';
import {checkOrigin,failure} from '@/server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
const cell=(x:unknown)=>'"'+String(x).replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
export async function GET(req:Request){try{const user=await checkOrigin(req);const s=await readState(user?.id);const rows=[['Symbol','Name','Asset class','Account','Currency','Quantity','Price','Average cost','Quote source','Quote time'],...s.positions.map(p=>[p.symbol,p.name,p.category,s.accounts.find(a=>a.id===p.accountId)?.name,p.currency,p.quantity,p.price,p.averageCost??'',p.quoteSource,p.quoteAt||''])];return new Response('\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="portfolio-holdings.csv"','Cache-Control':'no-store'}})}catch(e){return failure(e)}}
