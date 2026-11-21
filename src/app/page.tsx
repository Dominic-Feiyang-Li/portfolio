import Dashboard from '@/components/Dashboard';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {authEnabled,sessionCookie,readSession} from '@/server/auth';
export const dynamic='force-dynamic';
export default async function Page(){const secured=authEnabled(),user=secured?await readSession((await cookies()).get(sessionCookie)?.value):null;if(secured&&!user)redirect('/login');return <Dashboard secured={secured} username={user?.username}/>}
