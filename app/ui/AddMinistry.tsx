'use client';
import {useState} from 'react';
import {Plus} from 'lucide-react';
import type {Selection} from '../../lib/types';
import {availableMinistries} from '../../lib/domain';
export default function AddMinistry({selection,onAdd,readOnly=false}:{selection:Selection;onAdd:(id:string)=>void;readOnly?:boolean}){
 const [selected,setSelected]=useState('');
 const available=availableMinistries(selection);
 const selectedId=available.some(m=>m.id===selected)?selected:'';
 if(!available.length)return null;
 function add(e:React.FormEvent){e.preventDefault();if(!selectedId)return;onAdd(selectedId);setSelected('')}
 return <section className="ministry-choices" aria-label="Outros ministérios">
 {!readOnly?<form className="inline-ministry-form" onSubmit={add}><label htmlFor="other-ministry">Adicionar outro ministério ao campo</label><div className="inline-ministry-controls"><select id="other-ministry" value={selectedId} onChange={e=>setSelected(e.target.value)}><option value="">Escolha um ministério da lista…</option>{available.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select><button className="button primary" disabled={!selectedId}><Plus size={17}/> Adicionar ao campo</button></div></form>:null}
 <div className="presidential-list"><h3>A critério do Presidente <span>({available.length})</span></h3><p>Ainda não tenho opinião formada sobre estes ministérios. As escolhas ficam a critério do Presidente.</p><ul aria-label="Ministérios a critério do Presidente">{available.map(m=><li key={m.id}>{m.name}</li>)}</ul></div>
 </section>
}
