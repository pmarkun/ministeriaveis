import {test,before} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const {build}=require('../node_modules/.pnpm/esbuild@0.28.0/node_modules/esbuild/lib/main.js');
let api,seed,basePeople,db;const photos=new Map();
function adapter(database){return {prepare(sql){let params=[];return {bind(...p){params=p;return this},async first(){return database.prepare(sql).get(...params)||null},async all(){return {results:database.prepare(sql).all(...params)}},async run(){return database.prepare(sql).run(...params)}}}}}
before(async()=>{
 db=new DatabaseSync(':memory:');for(const file of (await fs.readdir('drizzle')).filter(f=>f.endsWith('.sql')).sort())db.exec(await fs.readFile('drizzle/'+file,'utf8'));
 globalThis.__ministeriaveisTestEnv={DB:adapter(db),BUCKET:{async put(id,bytes,opt){photos.set(id,{bytes,...opt})},async get(id){const p=photos.get(id);return p?{body:p.bytes,httpMetadata:p.httpMetadata}:null}}};
 const testTmp=await fs.mkdtemp(join(tmpdir(),'ministeriaveis-api-'));const bundle=join(testTmp,'api-test-bundle.mjs');
 await build({entryPoints:['app/api/[...path]/route.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm',plugins:[{name:'test-adapters',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'test-env',namespace:'test'}));b.onResolve({filter:/lib\/auth$/},()=>({path:'test-auth',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({contents:a.path==='test-env'?'export const env=globalThis.__ministeriaveisTestEnv;':'export async function getUser(){return globalThis.__ministeriaveisTestUser||null;} export async function handleAuth(){throw Error("Auth routes have dedicated integration tests")}'}));}}]});
 api=await import(pathToFileURL(bundle));const m=JSON.parse(await fs.readFile('data/ministries.json','utf8'));basePeople=JSON.parse(await fs.readFile('data/people.json','utf8'));seed={schemaVersion:1,title:'Teste local de escalação',scope:'top',ministries:m.slice(0,10),assignments:{[m[0].id]:basePeople[0].id},people:[],pending:[],unallocatedBudget:0,budgetIncomplete:false};
});
function user(id){globalThis.__ministeriaveisTestUser=id?{userId:id,email:id+'@example.invalid',fullName:null,displayName:'Teste local'}:null}
async function req(method,path,data){const r=new Request('https://ministeriaveis.test/api/'+path,{method,headers:{Origin:'https://ministeriaveis.test','Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});const res=await api[method](r);return {status:res.status,body:await res.json()}}
test('API: autenticação, versões, integridade, votos únicos, bifurcações e fotos',async()=>{
 user(null);assert.equal((await req('POST','versions',{payload:seed,parentId:null,ownerLabel:'Autor local'})).status,401);
 user('test-owner');const save=await req('POST','versions',{payload:seed,parentId:null,ownerLabel:'Autor local'});assert.equal(save.status,201);const a=save.body;assert.match(a.id,/^[a-f0-9]{24}$/);assert.equal(a.version,1);
 const duplicate=await req('POST','versions',{payload:seed,parentId:null,ownerLabel:'Autor local'});assert.equal(duplicate.body.id,a.id);assert.equal(duplicate.status,200);
 const revisionPayload=structuredClone(seed);revisionPayload.title='Segunda versão local';const b=(await req('POST','versions',{payload:revisionPayload,parentId:a.id,ownerLabel:'Autor local'})).body;assert.equal(b.parentId,a.id);assert.equal(b.rootId,a.id);assert.equal(b.version,2);assert.equal((await req('GET','versions/'+a.id)).body.payload.title,seed.title);
 const bad=structuredClone(seed);bad.ministries[0].attributes=[];assert.equal((await req('POST','versions',{payload:bad,parentId:null,ownerLabel:'Autor local'})).status,400);
 const pending=structuredClone(seed);pending.unallocatedBudget=1;assert.equal((await req('POST','versions',{payload:pending,parentId:null,ownerLabel:'Autor local'})).status,400);
 user('test-supporter');await req('POST','support/'+a.id);await req('POST','support/'+a.id);assert.equal((await req('GET','versions/'+a.id)).body.supports,1);
 user('test-owner');const ownFork=(await req('POST','versions',{payload:revisionPayload,parentId:b.id,fork:true,ownerLabel:'Autor local'})).body;assert.equal(ownFork.relation,'fork');assert.equal(ownFork.rootId,ownFork.id);user('test-supporter');
 const forkPayload=structuredClone(seed);forkPayload.title='Bifurcação local';const f=(await req('POST','versions',{payload:forkPayload,parentId:a.id,ownerLabel:'Outro autor local'})).body;assert.equal(f.relation,'fork');assert.equal(f.rootId,f.id);assert.equal(f.version,1);
 const community=(await req('GET','community')).body;assert.equal(community.participants,2);assert.equal(community.votes[seed.ministries[0].id][basePeople[0].id].count,2);
 await req('DELETE','support/'+a.id);assert.equal((await req('GET','versions/'+a.id)).body.supports,0);
 assert.equal((await req('GET','export')).body.versions.length,1);
 const bytes=await fs.readFile('public/photos/lula.jpg');const photoReq=new Request('https://ministeriaveis.test/api/photos',{method:'POST',headers:{Origin:'https://ministeriaveis.test','Content-Type':'image/jpeg'},body:bytes});const uploaded=await api.POST(photoReq);assert.equal(uploaded.status,201);const photo=await uploaded.json();const got=await api.GET(new Request('https://ministeriaveis.test'+photo.url));assert.equal(got.status,200);assert.equal((await got.arrayBuffer()).byteLength,bytes.byteLength);
 const wrong=new Request('https://ministeriaveis.test/api/photos',{method:'POST',headers:{Origin:'https://ministeriaveis.test'},body:'<script>bad image</script>'});assert.equal((await api.POST(wrong)).status,400);
 user('test-electoral-seed');const electoral=JSON.parse(await fs.readFile('data/elections-2026.json','utf8'));const electoralPayload=structuredClone(seed);electoralPayload.title='Nome importado do TSE';electoralPayload.assignments={[seed.ministries[0].id]:electoral.chamberIds[0]};const imported=await req('POST','versions',{payload:electoralPayload,parentId:null,ownerLabel:'Teste do catálogo'});assert.equal(imported.status,201);assert.equal(imported.body.payload.assignments[seed.ministries[0].id],electoral.chamberIds[0]);
 user('test-reallocation');const reorganized=structuredClone(seed);const removed=reorganized.ministries.shift();reorganized.assignments={[reorganized.ministries[0].id]:basePeople[0].id};reorganized.ministries[0].attributes.push(...removed.attributes);reorganized.unallocatedBudget=removed.budget;const economy=await req('POST','versions',{payload:reorganized,parentId:null,ownerLabel:'Reorganização'});assert.equal(economy.status,201);assert.equal(economy.body.payload.unallocatedBudget,removed.budget);
 const extra=structuredClone(seed);extra.ministries[0].budget+=5;assert.equal((await req('POST','versions',{payload:extra,parentId:null,ownerLabel:'Reorganização'})).status,400);extra.budgetJustification='Cortar R$ 5 bilhões de despesas administrativas fora das pastas escaladas.';const justified=await req('POST','versions',{payload:extra,parentId:null,ownerLabel:'Reorganização'});assert.equal(justified.status,201);assert.equal(justified.body.payload.budgetJustification,extra.budgetJustification);const loaded=await req('GET','versions/'+justified.body.id);assert.equal(loaded.body.payload.budgetJustification,extra.budgetJustification);
 user(null);assert.equal((await req('POST','support/'+a.id)).status,401);
 const summary=await req('GET','versions/'+a.id);assert.equal(summary.body.isOwner,false);assert.equal('owner_id' in summary.body,false);assert.equal('email' in summary.body,false);
});

test('API salva recorte editorial e pastas adicionadas, sem exigir opinião sobre as demais',async()=>{
 user('editorial-author');const all=JSON.parse(await fs.readFile('data/ministries.json','utf8'));const editorial=JSON.parse(await fs.readFile('data/editorial-2026.json','utf8'));const ids=new Set(editorial.ministryIds);const payload={...structuredClone(seed),title:'Minha seleção editorial',scope:'editorial',additionalMinistryIds:[],ministries:all.filter(m=>ids.has(m.id)),assignments:{'fazenda':basePeople[0].id}};
 const first=await req('POST','versions',{payload,parentId:null,ownerLabel:'Autor editorial'});assert.equal(first.status,201);assert.equal(first.body.payload.ministries.length,10);assert.equal(first.body.payload.pending.length,0);
 const added=structuredClone(payload);added.additionalMinistryIds=['previdencia'];added.ministries.push(all.find(m=>m.id==='previdencia'));added.title='Com mais uma pasta';const second=await req('POST','versions',{payload:added,parentId:first.body.id,ownerLabel:'Autor editorial'});assert.equal(second.status,201);assert.deepEqual(second.body.payload.additionalMinistryIds,['previdencia']);assert.equal(second.body.payload.unallocatedBudget,0);assert.equal((await req('GET','versions/'+first.body.id)).body.payload.ministries.length,10);
 const missing=structuredClone(added);missing.ministries=missing.ministries.filter(m=>m.id!=='previdencia');assert.equal((await req('POST','versions',{payload:missing,parentId:second.body.id,ownerLabel:'Autor editorial'})).status,400);
 const untracked=structuredClone(added);untracked.additionalMinistryIds=[];assert.equal((await req('POST','versions',{payload:untracked,parentId:null,ownerLabel:'Autor editorial'})).status,400);
});

test('API preserva pasta a critério do Presidente em versão parcial e rejeita referências contraditórias',async()=>{
 user('deferred-author');const all=JSON.parse(await fs.readFile('data/ministries.json','utf8'));const editorial=JSON.parse(await fs.readFile('data/editorial-2026.json','utf8'));const payload={...structuredClone(seed),scope:'editorial',additionalMinistryIds:[],deferredMinistryIds:['saude'],ministries:all.filter(m=>editorial.ministryIds.includes(m.id)&&m.id!=='saude'),assignments:{fazenda:basePeople[0].id}};
 const saved=await req('POST','versions',{payload,parentId:null,ownerLabel:'Autor parcial'});assert.equal(saved.status,201);assert.deepEqual(saved.body.payload.deferredMinistryIds,['saude']);assert.equal(saved.body.payload.pending.length,0);assert.equal(saved.body.payload.unallocatedBudget,0);assert.equal((await req('GET','versions/'+saved.body.id)).body.payload.ministries.length,9);
 const contradictory=structuredClone(payload);contradictory.ministries.push(all.find(m=>m.id==='saude'));assert.equal((await req('POST','versions',{payload:contradictory,parentId:null,ownerLabel:'Autor parcial'})).status,400);
 const escaped=structuredClone(payload);escaped.ministries[0].attributes.push(all.find(m=>m.id==='saude').attributes[0]);assert.equal((await req('POST','versions',{payload:escaped,parentId:null,ownerLabel:'Autor parcial'})).status,400);
});
