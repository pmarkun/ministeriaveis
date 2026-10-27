import {ministries,people,referenceMinistries} from './domain';
import type {Selection} from './types';
export function integrityError(s:Selection):string|null{
 const required=referenceMinistries(s);
 const extras=s.additionalMinistryIds||[];if(new Set(extras).size!==extras.length||extras.some(id=>!ministries.some(m=>m.id===id)))return 'Há pastas de referência inválidas ou duplicadas.';
 const expected=new Set(required.flatMap(m=>m.attributes).map(a=>a.id));
 for(const a of [...s.ministries.flatMap(m=>m.attributes),...s.pending])if(ministries.some(m=>m.attributes.some(b=>b.id===a.id))&&!expected.has(a.id))return 'Inclua esta pasta de referência antes de realocar suas atribuições.';
 const counts=new Map<string,number>();const knownAttrs=new Map(ministries.flatMap(m=>m.attributes).map(a=>[a.id,a]));
 for(const m of s.ministries){for(const a of m.attributes){counts.set(a.id,(counts.get(a.id)||0)+1);const base=knownAttrs.get(a.id);if(base&&(base.text!==a.text||base.source!==a.source))return 'Uma atribuição legal foi alterada. Mantenha o texto de origem ao redistribuir.';}}
 if(Array.from(counts.values()).some(n=>n!==1))return 'Há atribuições duplicadas.';
 for(const m of required)for(const a of m.attributes)if(!counts.has(a.id))return 'Há atribuições da estrutura original sem destino.';
 const basePeople=new Set(people.map(p=>p.id));if(s.people.some(p=>basePeople.has(p.id)))return 'Uma pessoa cadastrada está usando um identificador da base.';
 if(s.people.some(p=>p.photo.startsWith('/photos/')))return 'A foto cadastrada precisa ser enviada ou ter URL pública.';
 return null;
}
