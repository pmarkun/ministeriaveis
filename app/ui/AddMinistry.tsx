'use client';
import {useState} from 'react';
import {Plus,Search,Check} from 'lucide-react';
import type {Selection} from '../../lib/types';
import {availableMinistries,money} from '../../lib/domain';
import {Modal} from './primitives';
export default function AddMinistry({selection,onAdd,onClose,onCreate}:{selection:Selection;onAdd:(id:string)=>void;onClose:()=>void;onCreate:()=>void}){
 const [query,setQuery]=useState(''),[added,setAdded]=useState<string[]>([]);
 const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const available=availableMinistries(selection),list=available.filter(m=>normalize(m.name).includes(normalize(query)));
 return <Modal title="Adicionar ministério da lista" onClose={onClose} wide><p>Escolha apenas as pastas sobre as quais você quer opinar. As demais continuam a critério do Presidente.</p><label className="search"><Search size={19}/><input autoFocus aria-label="Buscar ministério" placeholder="Buscar por nome do ministério" value={query} onChange={e=>setQuery(e.target.value)}/></label>{added.length?<p className="added-feedback" role="status"><Check size={16}/> {added.length} {added.length===1?'ministério adicionado':'ministérios adicionados'} à sua escalação.</p>:null}<div className="ministry-catalog">{list.map(m=><article className="catalog-row" key={m.id}><div><h3>{m.name}</h3><p>{money(m.budget)} · {m.attributes.length} atribuições</p></div><button className="button secondary" aria-label={'Adicionar '+m.name} onClick={()=>{onAdd(m.id);setAdded([...added,m.id])}}><Plus size={17}/> Adicionar</button></article>)}</div>{!list.length?<p className="notice">{available.length?'Nenhum ministério corresponde à busca.':'Todas as pastas da lista já fazem parte da sua estrutura.'}</p>:null}<div className="catalog-footer"><button className="text-button" onClick={onCreate}>Quer propor uma pasta nova?</button><button className="button primary" onClick={onClose}>Voltar ao campo</button></div></Modal>
}
