/** Account identity must never expose an email, including legacy display labels. */
export function displayName(value:unknown):string{if(typeof value!=='string')return 'Participante';const name=value.trim();return name&&!name.includes('@')?name:'Participante';}
export function validDisplayName(value:string):boolean{return value.trim().length>=2&&value.trim().length<=60&&!value.includes('@');}
