'use client';
import {interfaceText} from '@/lib/labels';
import {useState} from 'react';
import Image from 'next/image';
import {ArrowUpRight} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card,CardHeader,CardTitle,CardContent} from '@/components/ui/card';
import {Field,FieldLabel,FieldGroup,FieldError} from '@/components/ui/field';
export default function LoginForm(){
 const [username,setUsername]=useState(''),[password,setPassword]=useState(''),[remember,setRemember]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password,remember})});const data=await r.json();if(!r.ok)throw new Error(data.error);window.location.replace('/')}catch(e){setError((e as Error).message);setBusy(false)}}
 return <main className="loginpage"><h1 className="sr-only">Account sign in</h1>
  <section className="loginformarea"><Card className="logincard"><CardHeader><span className="loginbrand"><Image src="/logo.png" width={48} height={48} alt="Portfolio" priority/></span><CardTitle>Sign in</CardTitle></CardHeader><CardContent><form onSubmit={submit} method="post"><FieldGroup><Field><FieldLabel htmlFor="username">Username</FieldLabel><Input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Enter your username" value={username} onChange={e=>setUsername(e.target.value)} required autoFocus disabled={busy}/></Field><Field data-invalid={!!error}><FieldLabel htmlFor="password">Password</FieldLabel><Input id="password" name="password" type="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} required disabled={busy} aria-invalid={!!error}/>{error&&<FieldError>{interfaceText(error)}</FieldError>}</Field><Field><label className="rememberlogin"><input type="checkbox" name="remember" checked={remember} onChange={e=>setRemember(e.target.checked)} disabled={busy}/><span>Keep me signed in</span></label></Field><Field><Button type="submit" disabled={busy}>{busy?'Signing in…':'Sign in'}<ArrowUpRight data-icon="inline-end"/></Button></Field></FieldGroup></form></CardContent></Card></section>
 </main>
}
