import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url),{build}=require('../node_modules/.pnpm/esbuild@0.28.0/node_modules/esbuild/lib/main.js');
let api,db,seed;
const password='uma senha longa de teste 2026',nextPassword='outra senha longa de teste 2026';
function adapter(database){const result={prepare(sql){let params=[];return {bind(...p){params=p;return this},async first(){return database.prepare(sql).get(...params)||null},async all(){return {results:database.prepare(sql).all(...params)}},async run(){return database.prepare(sql).run(...params)}}},async batch(statements){database.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());database.exec('COMMIT');return result}catch(e){database.exec('ROLLBACK');throw e}}};return result}
before(async()=>{
 db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');for(const file of (await fs.readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())db.exec(await fs.readFile('drizzle/'+file,'utf8'));
 globalThis.__ministeriaveisAuthTestEnv={DB:adapter(db)};
 const testTmp=await fs.mkdtemp(join(tmpdir(),'ministeriaveis-auth-')),bundle=join(testTmp,'auth-bundle.mjs');
 await build({entryPoints:['app/api/[...path]/route.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm',plugins:[{name:'test-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'test-env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const env=globalThis.__ministeriaveisAuthTestEnv;'}));}}]});api=await import(pathToFileURL(bundle));
 const all=JSON.parse(await fs.readFile('data/ministries.json','utf8')),editorial=JSON.parse(await fs.readFile('data/editorial-2026.json','utf8')),ps=JSON.parse(await fs.readFile('data/people.json','utf8'));
 seed={schemaVersion:1,title:'Escalação de teste de autenticação',scope:'editorial',additionalMinistryIds:[],ministries:all.filter(m=>editorial.ministryIds.includes(m.id)),assignments:{fazenda:ps[0].id},people:[],pending:[],unallocatedBudget:0,budgetIncomplete:false};
});
async function req(method,path,data,cookie='',headers={}){const res=await api[method](new Request('https://ministeriaveis.test/api/'+path,{method,headers:{Origin:'https://ministeriaveis.test','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.1',...(cookie?{Cookie:cookie}:{}),...headers},...(data?{body:JSON.stringify(data)}:{})}));return {status:res.status,body:await res.json(),setCookie:res.headers.get('set-cookie'),cookie:res.headers.get('set-cookie')?.split(';')[0]||''}}
const register=(email)=>req('POST','auth/register',{email,password,name:'Teste de acesso'});
test('Cadastro usa senha protegida, cookie seguro e ignora identidade ChatGPT',async()=>{
 assert.equal((await req('POST','auth/register',{email:'short@example.invalid',password:'curta',name:'Teste'})).status,400);
 const a=await register('Pessoa@Example.Invalid');assert.equal(a.status,201);assert.equal(a.body.user.email,'pessoa@example.invalid');assert.match(a.setCookie,/HttpOnly/);assert.match(a.setCookie,/SameSite=Lax/);assert.match(a.setCookie,/Secure/);assert.match(a.body.recoveryCode,/^[a-f0-9-]{47}$/);
 const account=db.prepare('SELECT * FROM auth_accounts WHERE id=?').get(a.body.user.id);assert.match(account.password_hash,/^scrypt\$16384\$8\$5\$/);assert.ok(!account.password_hash.includes(password));assert.notEqual(account.recovery_hash,a.body.recoveryCode);assert.equal(db.prepare('SELECT token_hash FROM auth_sessions WHERE account_id=?').get(account.id).token_hash.includes(a.cookie.split('=')[1]),false);
 const me=await req('GET','me',null,a.cookie);assert.equal(me.body.user.id,account.id);assert.equal('recoveryCode' in me.body,false);assert.equal('password_hash' in me.body.user,false);
 assert.equal((await req('GET','me',null,'',{'oai-authenticated-user-id':account.id,'oai-authenticated-user-email':account.email})).body.user,null);
 assert.equal((await req('POST','versions',{payload:seed,parentId:null,ownerLabel:'Teste'},'',{'oai-authenticated-user-id':account.id,'oai-authenticated-user-email':account.email})).status,401);
 assert.equal((await register('pessoa@example.invalid')).status,409);
 assert.equal((await req('POST','auth/login',{email:account.email,password},'',{Origin:'https://attacker.invalid'})).status,403);
 assert.equal((await req('POST','auth/logout',null,a.cookie,{Origin:''})).status,403);
 assert.equal((await req('POST','auth/logout',null,a.cookie)).status,200);assert.equal((await req('GET','me',null,a.cookie)).body.user,null);
});
test('Entrar gira a sessão, versão pertence à conta e não confia em cabeçalhos',async()=>{
 const a=await register('owner@example.invalid'),b=await register('other@example.invalid');assert.equal((await req('POST','auth/login',{email:'owner@example.invalid',password:'senha errada'})).status,401);
 const login=await req('POST','auth/login',{email:'OWNER@example.invalid',password},a.cookie);assert.equal(login.status,200);assert.notEqual(login.cookie,a.cookie);assert.equal((await req('GET','me',null,a.cookie)).body.user,null);
 const saved=await req('POST','versions',{payload:seed,parentId:null,ownerLabel:'Autor A'},login.cookie);assert.equal(saved.status,201);assert.equal(saved.body.isOwner,true);
 const other=await req('GET','versions/'+saved.body.id,null,b.cookie,{'oai-authenticated-user-id':a.body.user.id,'oai-authenticated-user-email':a.body.user.email});assert.equal(other.body.isOwner,false);
 const fork=await req('POST','versions',{payload:seed,parentId:saved.body.id,ownerLabel:'Autor B'},b.cookie);assert.equal(fork.body.relation,'fork');assert.equal((await req('GET','export',null,b.cookie)).body.versions.length,1);
 const community=await req('GET','community');assert.ok(!JSON.stringify(community.body).includes('owner@example.invalid'));assert.ok(!JSON.stringify(community.body).includes('other@example.invalid'));
});
test('Recuperação é de uso único, troca senha e invalida sessões antigas inclusive concorrentes',async()=>{
 const a=await register('recover@example.invalid'),second=await req('POST','auth/login',{email:'recover@example.invalid',password});assert.equal(second.status,200);
 assert.equal((await req('POST','auth/recover',{email:'recover@example.invalid',code:'errado',password:nextPassword})).status,401);
 const reset=await req('POST','auth/recover',{email:'recover@example.invalid',code:a.body.recoveryCode,password:nextPassword});assert.equal(reset.status,200);assert.notEqual(reset.body.recoveryCode,a.body.recoveryCode);
 assert.equal((await req('GET','me',null,a.cookie)).body.user,null);assert.equal((await req('GET','me',null,second.cookie)).body.user,null);
 assert.equal((await req('POST','auth/login',{email:'recover@example.invalid',password})).status,401);assert.equal((await req('POST','auth/login',{email:'recover@example.invalid',password:nextPassword})).status,200);
 assert.equal((await req('POST','auth/recover',{email:'recover@example.invalid',code:a.body.recoveryCode,password})).status,401);
 const fake='f'.repeat(64);const fakeHash=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('session:'+fake))).toString('hex');db.prepare('INSERT INTO auth_sessions(token_hash,account_id,created_at,expires_at,credential_version) VALUES(?,?,?,?,?)').run(fakeHash,a.body.user.id,Date.now(),Date.now()+1000000,0);assert.equal((await req('GET','me',null,'ministeriaveis_session='+fake)).body.user,null);
});
test('Alterar senha exige senha atual, renova código e encerra outras sessões',async()=>{
 const a=await register('change@example.invalid'),second=await req('POST','auth/login',{email:'change@example.invalid',password});assert.equal((await req('POST','auth/password',{currentPassword:'errada',password:nextPassword},a.cookie)).status,401);
 const changed=await req('POST','auth/password',{currentPassword:password,password:nextPassword},a.cookie);assert.equal(changed.status,200);assert.notEqual(changed.body.recoveryCode,a.body.recoveryCode);assert.equal((await req('GET','me',null,second.cookie)).body.user,null);assert.equal((await req('GET','me',null,changed.cookie)).body.user.id,a.body.user.id);
 db.prepare('UPDATE auth_sessions SET expires_at=0 WHERE account_id=?').run(a.body.user.id);assert.equal((await req('GET','me',null,changed.cookie)).body.user,null);
});
test('Tentativas de senha são limitadas antes de repetir derivação cara',async()=>{for(let i=0;i<10;i++)assert.equal((await req('POST','auth/login',{email:'nobody@example.invalid',password:'errada'},'',{'CF-Connecting-IP':'192.0.2.2'})).status,401);assert.equal((await req('POST','auth/login',{email:'nobody@example.invalid',password:'errada'},'',{'CF-Connecting-IP':'192.0.2.2'})).status,429)});
