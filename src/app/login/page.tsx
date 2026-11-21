import LoginForm from '@/components/LoginForm';
import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {authEnabled,sessionCookie,readSession} from '@/server/auth';
export const dynamic='force-dynamic';
export default async function Login(){if(authEnabled()&&await readSession((await cookies()).get(sessionCookie)?.value))redirect('/');return <LoginForm/>}
