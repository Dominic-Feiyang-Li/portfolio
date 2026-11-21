// Run against the intended environment. Input is a private JSON file, never source or CLI password arguments.
import {readFileSync} from 'node:fs';
import {hashPassword} from '../src/server/auth';
import {insertUser,findUser} from '../src/server/identity-store';
async function main(){
 const file=process.env.PORTFOLIO_USERS_FILE;if(!file)throw new Error('Set PORTFOLIO_USERS_FILE to a private JSON file');
 const users=JSON.parse(readFileSync(file,'utf8')) as {username:string;password:string}[];
 if(!Array.isArray(users)||users.length>100)throw new Error('账号文件格式不正确');
 for(const item of users){const username=item.username?.trim().toLowerCase();if(!/^[a-z0-9_]{3,32}$/.test(username)||typeof item.password!=='string')throw new Error('账号文件格式不正确');if(await findUser(username)){console.log(username+': already exists; password unchanged');continue}await insertUser({id:username,username,passwordHash:await hashPassword(item.password)});console.log(username+': created')}
}
void main().catch(()=>{console.error('账号创建失败，请检查私密文件格式、目标环境和数据库迁移');process.exitCode=1});
