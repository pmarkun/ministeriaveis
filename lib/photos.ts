export const MAX_PHOTO_BYTES=3_000_000;
export class PhotoError extends Error{
 constructor(message:string,public status=400){super(message);}
}
export async function readPhoto(req:Request){
 const multipart=(req.headers.get('content-type')||'').toLowerCase().startsWith('multipart/form-data');
 const limit=MAX_PHOTO_BYTES+(multipart?65_536:0);
 if(Number(req.headers.get('content-length')||0)>limit)throw new PhotoError('A foto precisa ter até 3 MB após o ajuste.',413);
 const reader=req.body?.getReader(),chunks:Uint8Array[]=[];let length=0;
 if(reader){try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new PhotoError('A foto precisa ter até 3 MB após o ajuste.',413);}chunks.push(value);}}finally{reader.releaseLock();}}
 let bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 if(multipart){
  let form:FormData;try{form=await new Response(bytes,{headers:{'Content-Type':req.headers.get('content-type')!}}).formData()}catch{throw new PhotoError('Não foi possível ler o envio. Selecione a foto novamente.');}
  const files=form.getAll('photo');if(files.length!==1||typeof files[0]==='string')throw new PhotoError('Selecione uma foto para enviar.');
  bytes=new Uint8Array(await files[0].arrayBuffer());
 }
 if(bytes.length>MAX_PHOTO_BYTES)throw new PhotoError('A foto precisa ter até 3 MB após o ajuste.',413);
 if(bytes.length<12)throw new PhotoError('A foto está vazia ou incompleta. Escolha outro arquivo.');
 const type=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?'image/jpeg':
  [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n)?'image/png':
  String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'?'image/webp':null;
 if(!type)throw new PhotoError('Use uma foto JPEG, PNG ou WebP.');
 return {bytes,type};
}
