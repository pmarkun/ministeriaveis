import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {realpathSync} from 'node:fs';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
const require=createRequire(import.meta.url),workerRequire=createRequire(realpathSync('node_modules/wrangler/package.json'));
const {build}=require('../node_modules/.pnpm/esbuild@0.28.0/node_modules/esbuild/lib/main.js'),{Miniflare}=workerRequire('miniflare');
test('Login próprio roda no Worker real com D1, cookie e derivação de senha nativa',async()=>{
 const temp=await fs.mkdtemp(join(tmpdir(),'ministeriaveis-worker-auth-')),file=join(temp,'worker.mjs');
 await build({stdin:{contents:`import {GET,POST,DELETE} from ${JSON.stringify(resolve('app/api/[...path]/route.ts'))};export default {fetch(request){return ({GET,POST,DELETE}[request.method]||GET)(request)}}`,resolveDir:process.cwd()},outfile:file,bundle:true,platform:'neutral',format:'esm',external:['cloudflare:workers','node:*']});
 const mf=new Miniflare({modules:true,modulesRoot:temp,scriptPath:file,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],log:new (workerRequire('miniflare').Log)(workerRequire('miniflare').LogLevel.ERROR)});
 try{
  const db=await mf.getD1Database('DB');for(const name of (await fs.readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){const sql=await fs.readFile('drizzle/'+name,'utf8');for(const statement of sql.split(';').map(s=>s.replace(/--> statement-breakpoint/g,'').trim()).filter(Boolean))await db.prepare(statement).run();}
  const email='worker-'+randomBytes(5).toString('hex')+'@example.invalid',password=randomBytes(24).toString('base64url');
  const request=async(action,data,cookie='')=>{const response=await mf.dispatchFetch('https://ministeriaveis.test/api/'+action,{method:data?'POST':'GET',headers:{Origin:'https://ministeriaveis.test','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
  const registered=await request('auth/register',{email,password,name:'Teste isolado do Worker'});assert.equal(registered.status,201,JSON.stringify(registered.body));assert.ok(registered.cookie);assert.ok(registered.body.recoveryCode);
  assert.equal((await request('me',null,registered.cookie)).body.user.id,registered.body.user.id);
  const login=await request('auth/login',{email,password},registered.cookie);assert.equal(login.status,200);assert.notEqual(login.cookie,registered.cookie);assert.equal((await request('me',null,registered.cookie)).body.user,null);
  const reset=await request('auth/recover',{email,code:registered.body.recoveryCode,password:randomBytes(24).toString('base64url')});assert.equal(reset.status,200);assert.equal((await request('me',null,login.cookie)).body.user,null);assert.equal((await request('me',null,reset.cookie)).body.user.id,registered.body.user.id);
  await request('auth/logout',{},reset.cookie);assert.equal((await request('me',null,reset.cookie)).body.user,null);
 }finally{await mf.dispose();await fs.rm(temp,{recursive:true,force:true});}
});
