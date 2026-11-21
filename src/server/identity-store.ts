import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {cloudEnabled,cloudRpc} from './cloud';
export interface User {id:string;username:string}
export interface UserRecord extends User {passwordHash:string}
export interface SessionRecord extends User {expiresAt:number;remember:boolean}
let database:DatabaseSync;
function db(){if(!database){const dir=resolve(/* turbopackIgnore: true */ process.env.PORTFOLIO_DATA_DIR||resolve(process.cwd(),'data'));mkdirSync(dir,{recursive:true});database=new DatabaseSync(resolve(dir,'identity.sqlite'));database.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,remember INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS login_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL);`)}return database}
const rpc=<T>(action:string,args:Record<string,unknown>)=>cloudRpc<T>(action,args,'portfolio_auth_rpc');
export async function findUser(username:string):Promise<UserRecord|null>{if(cloudEnabled())return rpc('find-user',{username});const row=db().prepare('SELECT id,username,password_hash AS passwordHash FROM users WHERE username=?').get(username);return row as unknown as UserRecord??null}
export async function insertUser(user:UserRecord){if(!/^[a-z0-9_]{3,32}$/.test(user.id)||user.id!==user.username)throw new Error('账号格式不正确');if(cloudEnabled())return rpc('create-user',{user});db().prepare('INSERT INTO users(id,username,password_hash) VALUES(?,?,?)').run(user.id,user.username,user.passwordHash)}
export async function insertSession(hash:string,userId:string,expiresAt:number,remember:boolean){if(cloudEnabled())return rpc('session-create',{hash,userId,expiresAt,remember});const d=db();d.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());d.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,remember) VALUES(?,?,?,?)').run(hash,userId,expiresAt,Number(remember))}
export async function findSession(hash:string,now:number):Promise<SessionRecord|null>{if(cloudEnabled())return rpc('session-read',{hash,now});const row=db().prepare('SELECT u.id,u.username,s.expires_at AS expiresAt,s.remember FROM sessions s JOIN users u ON u.id=s.user_id WHERE token_hash=? AND expires_at>?').get(hash,now) as unknown as SessionRecord|undefined;return row?{...row,remember:!!row.remember}:null}
export async function renewSession(hash:string,expiresAt:number){if(cloudEnabled())return rpc('session-renew',{hash,expiresAt});db().prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').run(expiresAt,hash)}
export async function deleteSession(hash:string){if(cloudEnabled())return rpc('session-delete',{hash});db().prepare('DELETE FROM sessions WHERE token_hash=?').run(hash)}
export async function allowLogin(key:string,limit=10){if(cloudEnabled())return rpc<boolean>('login-attempt',{key,limit});const d=db(),now=Date.now();d.prepare('DELETE FROM login_attempts WHERE expires_at <= ?').run(now);d.prepare('INSERT INTO login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1').run(key,now+900000);return (d.prepare('SELECT attempts FROM login_attempts WHERE key=?').get(key) as {attempts:number}).attempts<=limit}

export async function listUsers():Promise<(User&{createdAt?:string})[]>{return cloudEnabled()?cloudRpc<User[]>('users',{},'portfolio_valuation_rpc'):db().prepare('SELECT id,username FROM users ORDER BY id').all() as unknown as User[]}
