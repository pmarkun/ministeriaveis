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
test('Worker real: login próprio, upload multipart, R2 e foto na escalação salva',async()=>{
 const temp=await fs.mkdtemp(join(tmpdir(),'ministeriaveis-worker-auth-')),file=join(temp,'worker.mjs');
 await build({stdin:{contents:`import {GET,POST,DELETE} from ${JSON.stringify(resolve('app/api/[...path]/route.ts'))};export default {fetch(request){return ({GET,POST,DELETE}[request.method]||GET)(request)}}`,resolveDir:process.cwd()},outfile:file,bundle:true,platform:'neutral',format:'esm',external:['cloudflare:workers','node:*']});
 const mf=new Miniflare({modules:true,modulesRoot:temp,scriptPath:file,compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],log:new (workerRequire('miniflare').Log)(workerRequire('miniflare').LogLevel.ERROR)});
 try{
  const db=await mf.getD1Database('DB');for(const name of (await fs.readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort()){const sql=await fs.readFile('drizzle/'+name,'utf8');for(const statement of sql.split(';').map(s=>s.replace(/--> statement-breakpoint/g,'').trim()).filter(Boolean))await db.prepare(statement).run();}
  const email='worker-'+randomBytes(5).toString('hex')+'@example.invalid',password=randomBytes(24).toString('base64url');
  const request=async(action,data,cookie='')=>{const response=await mf.dispatchFetch('https://ministeriaveis.test/api/'+action,{method:data?'POST':'GET',headers:{Origin:'https://ministeriaveis.test','Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]}};
  const registered=await request('auth/register',{email,password,name:'Teste isolado do Worker'});assert.equal(registered.status,201,JSON.stringify(registered.body));assert.ok(registered.cookie);assert.ok(registered.body.recoveryCode);
  assert.equal((await request('me',null,registered.cookie)).body.user.id,registered.body.user.id);
  const login=await request('auth/login',{email,password},registered.cookie);assert.equal(login.status,200);assert.notEqual(login.cookie,registered.cookie);assert.equal((await request('me',null,registered.cookie)).body.user,null);
  // Exercise the same multipart body sent by the browser, with real D1/R2 bindings.
  const original=await fs.readFile('public/photos/lula.jpg');
  const sendPhoto=async(body,cookie=login.cookie,origin='https://ministeriaveis.test')=>{const wire=new Request('https://ministeriaveis.test/api/photos',{method:'POST',headers:{Origin:origin,...(cookie?{Cookie:cookie}:{})},body});return mf.dispatchFetch(wire.url,{method:'POST',headers:Object.fromEntries(wire.headers),body:new Uint8Array(await wire.arrayBuffer())});};
  const form=()=>{const body=new FormData();body.append('photo',new Blob([original],{type:'image/jpeg'}),'portrait.jpg');return body};
  assert.equal((await sendPhoto(form(),'')).status,401);
  assert.equal((await sendPhoto(form(),login.cookie,'https://other.test')).status,403);
  const uploaded=await sendPhoto(form());assert.equal(uploaded.status,201,await uploaded.clone().text());const photo=await uploaded.json();assert.match(photo.url,/^\/api\/photos\/[a-f0-9-]{36}$/);
  const stored=await mf.dispatchFetch('https://ministeriaveis.test'+photo.url);assert.equal(stored.status,200);assert.equal(stored.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await stored.arrayBuffer()),original);
  const bucket=await mf.getR2Bucket('BUCKET');assert.equal((await bucket.list()).objects.length,1);
  const invalid=new FormData();invalid.append('photo',new Blob(['<script>not a photo</script>'],{type:'image/jpeg'}),'fake.jpg');assert.equal((await sendPhoto(invalid)).status,400);
  assert.equal((await sendPhoto(new FormData())).status,400);
  const oversized=new FormData();oversized.append('photo',new Blob([new Uint8Array(3_000_001)],{type:'image/jpeg'}),'large.jpg');assert.equal((await sendPhoto(oversized)).status,413);
  assert.equal((await bucket.list()).objects.length,1);assert.equal((await db.prepare('SELECT COUNT(*) n FROM uploads').first()).n,1);
  const ministries=JSON.parse(await fs.readFile('data/ministries.json','utf8')).slice(0,10);
  const person={id:'person-worker-photo',name:'Pessoa de teste',bio:'Perfil isolado de teste de foto.',party:'Não informado',gender:'Não informado',race:'Não informado',demographicSource:'',reference:'https://example.org/profile',photo:photo.url,photoSource:'https://example.org/profile',ministryIds:[ministries[0].id],sourceType:'community',verifiedAt:'2026-10-28'};
  const payload={schemaVersion:1,title:'Escalação com foto enviada',scope:'top',ministries,assignments:{[ministries[0].id]:person.id},people:[person],pending:[],unallocatedBudget:0,budgetIncomplete:false};
  const saved=await request('versions',{payload,parentId:null,ownerLabel:'Teste isolado'},login.cookie);assert.equal(saved.status,201,JSON.stringify(saved.body));
  const loaded=await request('versions/'+saved.body.id);assert.equal(loaded.body.payload.people[0].photo,photo.url);
  const reset=await request('auth/recover',{email,code:registered.body.recoveryCode,password:randomBytes(24).toString('base64url')});assert.equal(reset.status,200);assert.equal((await request('me',null,login.cookie)).body.user,null);assert.equal((await request('me',null,reset.cookie)).body.user.id,registered.body.user.id);
  await request('auth/logout',{},reset.cookie);assert.equal((await request('me',null,reset.cookie)).body.user,null);
 }finally{await mf.dispose();await fs.rm(temp,{recursive:true,force:true});}
});
