import {env} from 'cloudflare:workers';
import {getUser,handleAuth} from '../../../lib/auth';
import {canonicalJSON,people,fundingError} from '../../../lib/domain';
import {displayName} from '../../../lib/display-name';
import {integrityError} from '../../../lib/integrity';
import {saveSchema} from '../../../lib/validation';
import type {Selection,Version} from '../../../lib/types';
export const dynamic='force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
async function parse(req:Request){if(Number(req.headers.get('content-length')||0)>750_000)throw new Error('Dados muito grandes.');const text=await req.text();if(text.length>750_000)throw new Error('Dados muito grandes.');return JSON.parse(text);}
function decode(r:any,userId?:string):Version{return {id:r.id,title:r.title,ownerLabel:displayName(r.owner_label),payload:JSON.parse(r.payload),parentId:r.parent_id,rootId:r.root_id,version:r.version,createdAt:r.created_at,supports:Number(r.supports||0),isOwner:r.owner_id===userId,isSupported:!!r.is_supported,relation:r.relation};}
async function version(id:string,userId?:string){const r=await env.DB!.prepare('SELECT v.*, (SELECT COUNT(*) FROM supports s WHERE s.version_id=v.id) supports,(SELECT COUNT(*) FROM supports s WHERE s.version_id=v.id AND s.user_id=?) is_supported FROM versions v WHERE v.id=?').bind(userId||'',id).first();return r?decode(r,userId):null;}
function originOK(req:Request){const origin=req.headers.get('origin');return origin===new URL(req.url).origin&&req.headers.get('sec-fetch-site')!=='cross-site';}
async function handle(req:Request){
 const path=new URL(req.url).pathname.replace(/^\/api\//,'').split('/');if(path[0]==='auth')return handleAuth(req,path[1]||'');const user=await getUser(req);
 if(req.method==='GET'&&path[0]==='me')return json({user:user?{id:user.userId,name:displayName(user.fullName)}:null});
 if(path[0]==='photos'&&req.method==='GET'&&/^[a-f0-9-]{36}$/.test(path[1]||'')){const o=await env.BUCKET!.get('photos/'+path[1]);if(!o)return json({error:'Foto não encontrada.'},404);return new Response(o.body,{headers:{'Content-Type':o.httpMetadata?.contentType||'image/jpeg','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});}
 if(!env.DB)return json({error:'O banco de dados não está disponível.'},503);
 if(req.method==='GET'&&path[0]==='versions'&&path[1]){if(!/^[a-f0-9]{24}$/.test(path[1]))return json({error:'Endereço inválido.'},400);const v=await version(path[1],user?.userId);return v?json(v):json({error:'Escalação não encontrada.'},404);}
 if(req.method==='GET'&&path[0]==='history'&&path[1]){const v=await version(path[1],user?.userId);if(!v)return json({error:'Escalação não encontrada.'},404);const out=await env.DB.prepare('SELECT id,title,owner_label,parent_id,root_id,version,relation,created_at FROM versions WHERE root_id=? OR id=? ORDER BY created_at DESC LIMIT 100').bind(v.rootId,v.parentId||'').all();return json(out.results.map((row:any)=>({...row,owner_label:displayName(row.owner_label)})));}
 if(req.method==='GET'&&path[0]==='community'){
 const rows=await env.DB.prepare('SELECT v.*, (SELECT COUNT(*) FROM supports s WHERE s.version_id=v.id) supports FROM versions v WHERE NOT EXISTS (SELECT 1 FROM versions child WHERE child.parent_id=v.id AND child.root_id=v.root_id) ORDER BY supports DESC,v.created_at DESC LIMIT 24').all();
 const tally=await env.DB.prepare(`WITH latest AS (SELECT payload,ROW_NUMBER() OVER(PARTITION BY owner_id ORDER BY created_at DESC,id DESC) rn FROM versions), choices AS (SELECT a.key mid,a.value pid,l.payload FROM latest l,json_each(l.payload,'$.assignments') a WHERE rn=1 AND NOT EXISTS (SELECT 1 FROM json_each(l.payload,'$.ministries') m WHERE json_extract(m.value,'$.id')=a.key AND json_extract(m.value,'$.custom')=1)), tallies AS (SELECT mid,pid,COUNT(*) n,MAX((SELECT json(p.value) FROM json_each(c.payload,'$.people') p WHERE json_extract(p.value,'$.id')=c.pid LIMIT 1)) person FROM choices c GROUP BY mid,pid), ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY mid ORDER BY n DESC,pid) rank FROM tallies) SELECT mid,pid,n,person FROM ranked WHERE rank<=20`).all();
 const participant=await env.DB.prepare('SELECT COUNT(DISTINCT owner_id) n FROM versions').first<any>();
 const votes:Record<string,Record<string,{person:any;count:number}>>={};
 for(const row of tally.results as any[]){const p=people.find(p=>p.id===row.pid)||(row.person?JSON.parse(row.person):null);if(!p)continue;votes[row.mid]??={};votes[row.mid][row.pid]={person:p,count:Number(row.n)};}
 return json({versions:(rows.results as any[]).map(r=>decode(r,user?.userId)),votes,participants:Number(participant?.n||0)});
 }
 if(req.method==='GET'&&path[0]==='export'){if(!user)return json({error:'Entre para exportar suas versões.'},401);const rows=await env.DB.prepare('SELECT v.*,(SELECT COUNT(*) FROM supports s WHERE s.version_id=v.id) supports FROM versions v WHERE owner_id=? ORDER BY created_at').bind(user.userId).all();return json({schemaVersion:1,exportedAt:new Date().toISOString(),versions:(rows.results as any[]).map(r=>decode(r,user.userId))});}
 if(!['POST','DELETE'].includes(req.method))return json({error:'Rota não encontrada.'},404);
 if(!user)return json({error:'Entre com sua conta para salvar, apoiar ou enviar fotos.'},401);
 if(!originOK(req))return json({error:'Origem não permitida.'},403);
 if(req.method==='POST'&&path[0]==='versions'){
 const parsed=saveSchema.safeParse(await parse(req));if(!parsed.success)return json({error:parsed.error.issues[0]?.message||'Dados inválidos.'},400);
 const {payload,parentId,ownerLabel,fork:forkRequested}=parsed.data;const integrity=integrityError(payload);if(integrity)return json({error:integrity},400); if(payload.pending.length)return json({error:'Distribua todas as atribuições pendentes antes de salvar.'},400);
 const funding=fundingError(payload);if(funding)return json({error:funding},400);
 const known=new Set([...people,...payload.people].map(p=>p.id));const mids=new Set(payload.ministries.map(m=>m.id));if(mids.size!==payload.ministries.length||new Set(payload.people.map(p=>p.id)).size!==payload.people.length)return json({error:'Há identificadores duplicados.'},400);
 if(Object.entries(payload.assignments).some(([m,p])=>!mids.has(m)||!known.has(p)))return json({error:'Há indicações inválidas.'},400);
 const assigned=Object.values(payload.assignments);if(!assigned.length)return json({error:'Escale pelo menos uma pessoa.'},400);if(new Set(assigned).size!==assigned.length)return json({error:'Cada pessoa só pode ocupar uma pasta.'},400);
 const parent=parentId?await version(parentId,user.userId):null;if(parentId&&!parent)return json({error:'A versão de origem não existe.'},400);
 const relation=parent?((forkRequested||!parent.isOwner)?'fork':'revision'):'original';
 const canonical=canonicalJSON({payload,owner:user.userId,parentId,relation});const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));const id=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('').slice(0,24);
 const existing=await version(id,user.userId);if(existing)return json(existing);
 const now=new Date().toISOString();const root=relation==='revision'?parent!.rootId:id;const n=relation==='revision'?parent!.version+1:1;
 await env.DB.prepare('INSERT OR IGNORE INTO versions(id,owner_id,owner_label,title,payload,parent_id,root_id,version,relation,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id,user.userId,ownerLabel,payload.title,canonicalJSON(payload),parentId,root,n,relation,now).run();return json(await version(id,user.userId),201);
 }
 if(path[0]==='support'&&/^[a-f0-9]{24}$/.test(path[1]||'')){const v=await version(path[1],user.userId);if(!v)return json({error:'Escalação não encontrada.'},404);if(req.method==='DELETE')await env.DB.prepare('DELETE FROM supports WHERE version_id=? AND user_id=?').bind(v.id,user.userId).run();else await env.DB.prepare('INSERT OR IGNORE INTO supports(version_id,user_id,created_at) VALUES(?,?,?)').bind(v.id,user.userId,new Date().toISOString()).run();return json(await version(v.id,user.userId));}
 if(req.method==='POST'&&path[0]==='photos'){
 if(!env.BUCKET)return json({error:'Envio de fotos indisponível.'},503);
 const count=await env.DB.prepare("SELECT COUNT(*) n FROM uploads WHERE owner_id=? AND created_at>=?").bind(user.userId,new Date(Date.now()-86400000).toISOString()).first<any>();if(Number(count?.n||0)>=40)return json({error:'Limite diário de 40 fotos atingido.'},429);
 if(Number(req.headers.get('content-length')||0)>3_000_000)return json({error:'A foto precisa ter até 3 MB.'},413);
 const bytes=new Uint8Array(await req.arrayBuffer());if(bytes.length>3_000_000||bytes.length<12)return json({error:'A foto precisa ter até 3 MB.'},413);
 const type=bytes[0]===0xff&&bytes[1]===0xd8?'image/jpeg':bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71?'image/png':String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;
 if(!type)return json({error:'Use uma foto JPEG, PNG ou WebP.'},400);const id=crypto.randomUUID();await env.BUCKET.put('photos/'+id,bytes,{httpMetadata:{contentType:type}});await env.DB.prepare('INSERT INTO uploads(id,owner_id,content_type,created_at) VALUES(?,?,?,?)').bind(id,user.userId,type,new Date().toISOString()).run();return json({url:'/api/photos/'+id},201);
 }
 return json({error:'Rota não encontrada.'},404);
}
export async function GET(req:Request){try{return await handle(req)}catch(e){console.error('API read failed',e);return json({error:'Não foi possível carregar os dados. Tente novamente.'},500)}}
export async function POST(req:Request){try{return await handle(req)}catch(e){console.error('API write failed',e);return json({error:e instanceof SyntaxError?'JSON inválido.':'Não foi possível concluir a ação. Tente novamente.'},e instanceof SyntaxError?400:500)}}
export const DELETE=POST;
