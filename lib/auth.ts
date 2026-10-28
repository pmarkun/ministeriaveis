import {env} from 'cloudflare:workers';
import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {z} from 'zod';
import {displayName,validDisplayName} from './display-name';
export type AccountUser={id:string;name:string};
export type AuthUser={userId:string;fullName:string;email:string};
const COOKIE='ministeriaveis_session',TTL=30*86400_000;
const emailSchema=z.string().trim().toLowerCase().email().max(254);
const passwordSchema=z.string().min(12,'Use pelo menos 12 caracteres na senha.').max(128,'Use no máximo 128 caracteres na senha.');
const credentials=z.object({email:emailSchema,password:z.string().min(1).max(128)});
const registration=z.object({email:emailSchema,password:passwordSchema,name:z.string().trim().min(2,'Informe seu nome ou apelido.').max(60).refine(validDisplayName,'Use um nome ou apelido, sem e-mail.')});
const recovery=z.object({email:emailSchema,code:z.string().min(1).max(100),password:passwordSchema});
const change=z.object({currentPassword:z.string().min(1).max(128),password:passwordSchema});
const response=(data:unknown,status=200,cookie?:string)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(cookie?{'Set-Cookie':cookie}:{})}});
export function sessionToken(req:Request){const value=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);return value&&/^[a-f0-9]{64}$/.test(value)?value:null;}
export async function digest(value:string){return Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))).toString('hex');}
function equal(a:string,b:string){return /^[a-f0-9]+$/.test(a)&&a.length===b.length&&timingSafeEqual(Buffer.from(a,'hex'),Buffer.from(b,'hex'));}
async function derive(password:string,salt:string){return new Promise<Buffer>((resolve,reject)=>scrypt(password,Buffer.from(salt,'hex'),32,{N:16384,r:8,p:5,maxmem:32*1024*1024},(e,key)=>e?reject(e):resolve(key)));}
export async function hashPassword(password:string){const salt=randomBytes(16).toString('hex');return 'scrypt$16384$8$5$'+salt+'$'+(await derive(password,salt)).toString('hex');}
export async function verifyPassword(password:string,stored:string){const parts=stored.split('$');if(parts.length!==6||parts.slice(0,4).join('$')!=='scrypt$16384$8$5'||!/^[a-f0-9]{32}$/.test(parts[4])||!/^[a-f0-9]{64}$/.test(parts[5]))return false;return equal((await derive(password,parts[4])).toString('hex'),parts[5]);}
const dummy='scrypt$16384$8$5$'+'0'.repeat(32)+'$'+'0'.repeat(64);
function cookie(req:Request,token:string,maxAge=TTL/1000){return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol==='https:'?'; Secure':''}`;}
export async function getUser(req:Request):Promise<AuthUser|null>{const token=sessionToken(req);if(!token||!env.DB)return null;const row=await env.DB.prepare('SELECT a.id,a.name,a.email FROM auth_sessions s JOIN auth_accounts a ON a.id=s.account_id WHERE s.token_hash=? AND s.expires_at>? AND s.credential_version=a.credential_version').bind(await digest('session:'+token),Date.now()).first<any>();return row?{userId:row.id,fullName:displayName(row.name),email:row.email}:null;}
function publicUser(u:any):AccountUser{return {id:u.id,name:displayName(u.name)};}
async function newSession(req:Request,userId:string,credentialVersion=0){const token=randomBytes(32).toString('hex'),now=Date.now(),old=sessionToken(req);const statements=[];if(old)statements.push(env.DB!.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await digest('session:'+old)));statements.push(env.DB!.prepare('INSERT INTO auth_sessions(token_hash,account_id,created_at,expires_at,credential_version) SELECT ?,id,?,?,credential_version FROM auth_accounts WHERE id=? AND credential_version=?').bind(await digest('session:'+token),now,now+TTL,userId,credentialVersion));await env.DB!.batch(statements);return cookie(req,token);}
function recoveryCode(){return randomBytes(20).toString('hex').match(/.{1,5}/g)!.join('-');}
const codeHash=(email:string,code:string)=>digest('recovery:'+email+':'+code.replace(/[\s-]/g,'').toLowerCase());
async function limit(key:string,max:number){const now=Date.now(),window=Math.floor(now/900_000),id=await digest('limit:'+key+':'+window);const row=await env.DB!.prepare('INSERT INTO auth_limits(id,hits,expires_at) VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits').bind(id,(window+1)*900_000).first<any>();return Number(row?.hits||0)<=max;}
async function cleanup(){const now=Date.now();await env.DB!.batch([env.DB!.prepare('DELETE FROM auth_limits WHERE id IN (SELECT id FROM auth_limits WHERE expires_at<? LIMIT 100)').bind(now),env.DB!.prepare('DELETE FROM auth_sessions WHERE token_hash IN (SELECT token_hash FROM auth_sessions WHERE expires_at<? LIMIT 100)').bind(now)]);}
export async function handleAuth(req:Request,action:string):Promise<Response>{
 if(req.method!=='POST')return response({error:'Rota não encontrada.'},404);
 if(req.headers.get('origin')!==new URL(req.url).origin||req.headers.get('sec-fetch-site')==='cross-site')return response({error:'Origem não permitida.'},403);
 if(!env.DB)return response({error:'Acesso indisponível. Tente novamente.'},503);
 if(!['register','login','logout','recover','password','profile'].includes(action))return response({error:'Rota não encontrada.'},404);
 if(action==='logout'){const token=sessionToken(req);if(token)await env.DB.prepare('DELETE FROM auth_sessions WHERE token_hash=?').bind(await digest('session:'+token)).run();return response({ok:true},200,cookie(req,'',0));}
 // Cloudflare supplies this header; it is never used as identity.
 const ip=req.headers.get('cf-connecting-ip')||'unavailable';
 if(!await limit('ip:'+ip+':'+action,action==='register'?8:40))return response({error:'Muitas tentativas. Aguarde 15 minutos e tente novamente.'},429);
 if(Number(req.headers.get('content-length')||0)>4096)return response({error:'Dados muito grandes.'},413);
 const text=await req.text();if(new TextEncoder().encode(text).length>4096)return response({error:'Dados muito grandes.'},413);
 let body:unknown;try{body=JSON.parse(text)}catch{return response({error:'Dados inválidos.'},400)}
 await cleanup();
 if(action==='register'){
  const result=registration.safeParse(body);if(!result.success)return response({error:result.error.issues[0].message},400);const {email,password,name}=result.data;
  const hash=await hashPassword(password),code=recoveryCode(),id='account-'+crypto.randomUUID();
  const account=await env.DB.prepare('INSERT INTO auth_accounts(id,email,name,password_hash,recovery_hash,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(email) DO NOTHING RETURNING id,name,email').bind(id,email,name,hash,await codeHash(email,code),Date.now()).first<any>();
  if(!account)return response({error:'Não foi possível criar esta conta. Se você já se cadastrou, entre ou recupere seu acesso.'},409);
  return response({user:publicUser(account),recoveryCode:code},201,await newSession(req,id));
 }
 if(action==='login'){
  const result=credentials.safeParse(body);if(!result.success)return response({error:'Confira o e-mail e a senha.'},400);const {email,password}=result.data;
  if(!await limit('login:'+email,10))return response({error:'Muitas tentativas. Aguarde 15 minutos e tente novamente.'},429);
  const account=await env.DB.prepare('SELECT id,name,email,password_hash,credential_version FROM auth_accounts WHERE email=?').bind(email).first<any>();
  const valid=await verifyPassword(password,account?.password_hash||dummy);if(!account||!valid)return response({error:'E-mail ou senha incorretos.'},401);
  return response({user:publicUser(account)},200,await newSession(req,account.id,account.credential_version));
 }
 if(action==='recover'){
  const result=recovery.safeParse(body);if(!result.success)return response({error:result.error.issues[0].message},400);const {email,code,password}=result.data;
  if(!await limit('recover:'+email,5))return response({error:'Muitas tentativas. Aguarde 15 minutos e tente novamente.'},429);
  const account=await env.DB.prepare('SELECT id,name,email,recovery_hash FROM auth_accounts WHERE email=?').bind(email).first<any>();const hash=await codeHash(email,code);
  if(!account||!equal(hash,account.recovery_hash))return response({error:'E-mail ou código de recuperação inválidos.'},401);
  const nextCode=recoveryCode();const changed=await env.DB.prepare('UPDATE auth_accounts SET password_hash=?,recovery_hash=?,credential_version=credential_version+1 WHERE id=? AND recovery_hash=? RETURNING id,credential_version').bind(await hashPassword(password),await codeHash(email,nextCode),account.id,hash).first<any>();if(!changed)return response({error:'Este código já foi usado. Use o código mais recente.'},401);
  await env.DB.prepare('DELETE FROM auth_sessions WHERE account_id=?').bind(account.id).run();return response({user:publicUser(account),recoveryCode:nextCode},200,await newSession(req,account.id,changed.credential_version));
 }
 const user=await getUser(req);if(!user)return response({error:'Entre para alterar a senha.'},401);
 if(action==='profile'){
  const parsed=z.object({name:z.string().trim().refine(validDisplayName,'Use um nome ou apelido de 2 a 60 caracteres, sem e-mail.')}).safeParse(body);if(!parsed.success)return response({error:parsed.error.issues[0].message},400);
  await env.DB.batch([env.DB.prepare('UPDATE auth_accounts SET name=? WHERE id=?').bind(parsed.data.name,user.userId),env.DB.prepare("UPDATE versions SET owner_label=? WHERE owner_id=? AND (trim(owner_label)='' OR instr(owner_label,'@')>0)").bind(parsed.data.name,user.userId)]);
  return response({user:{id:user.userId,name:parsed.data.name}});
 }
 const result=change.safeParse(body);if(!result.success)return response({error:result.error.issues[0].message},400);
 const account=await env.DB.prepare('SELECT password_hash FROM auth_accounts WHERE id=?').bind(user.userId).first<any>();
 if(!account||!await verifyPassword(result.data.currentPassword,account.password_hash))return response({error:'Senha atual incorreta.'},401);
 const nextCode=recoveryCode();const changed=await env.DB.prepare('UPDATE auth_accounts SET password_hash=?,recovery_hash=?,credential_version=credential_version+1 WHERE id=? AND password_hash=? RETURNING id,credential_version').bind(await hashPassword(result.data.password),await codeHash(user.email,nextCode),user.userId,account.password_hash).first<any>();if(!changed)return response({error:'O acesso mudou. Entre novamente.'},401);
 await env.DB.prepare('DELETE FROM auth_sessions WHERE account_id=?').bind(user.userId).run();return response({user:{id:user.userId,name:displayName(user.fullName)},recoveryCode:nextCode},200,await newSession(req,user.userId,changed.credential_version));
}
