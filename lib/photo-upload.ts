// Browser-only preparation. Keep large camera photos out of the upload request.
export async function preparePhoto(file:File):Promise<Blob>{
 if(!file.size)throw Error('A foto está vazia. Escolha outro arquivo.');
 if(file.size>20_000_000)throw Error('Escolha uma foto de até 20 MB.');
 if(file.type&&!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Use uma foto JPEG, PNG ou WebP. Se estiver em HEIC, exporte como JPEG.');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  image.src=url;
  try{await image.decode()}catch{throw Error('Não foi possível abrir esta foto. Tente outro arquivo JPEG, PNG ou WebP.');}
  const scale=Math.min(1,1600/Math.max(image.naturalWidth,image.naturalHeight));
  if(scale===1&&file.size<=3_000_000)return file;
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  const context=canvas.getContext('2d');if(!context)throw Error('Não foi possível preparar a foto neste navegador.');
  context.drawImage(image,0,0,canvas.width,canvas.height);
  const encode=(type:string,quality:number)=>new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,type,quality));
  let photo=await encode('image/webp',.85);
  if(!photo||photo.size>3_000_000){context.globalCompositeOperation='destination-over';context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);photo=await encode('image/jpeg',.82);}
  if(!photo||photo.size>3_000_000)throw Error('Não foi possível reduzir a foto. Escolha uma imagem menor.');
  return photo;
 }finally{URL.revokeObjectURL(url);}
}
