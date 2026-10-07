/* V424: bounded client-side preparation only. Server MUST independently verify media. */
(()=>{
'use strict';
const MAX_INPUT=12*1024*1024, MAX_OUTPUT=5*1024*1024, MAX_EDGE=1440;
const ACCEPT=new Set(['image/jpeg','image/png','image/webp','image/gif']);
function signature(type,b){
 if(type==='image/jpeg')return b[0]===255&&b[1]===216&&b[2]===255;
 if(type==='image/png')return [137,80,78,71,13,10,26,10].every((n,i)=>b[i]===n);
 if(type==='image/gif')return b.length>=6&&(['GIF87a','GIF89a'].includes(String.fromCharCode(...b.slice(0,6))));
 if(type==='image/webp')return String.fromCharCode(...b.slice(0,4))==='RIFF'&&String.fromCharCode(...b.slice(8,12))==='WEBP';
 return false;
}
async function prepare(file){
 if(!(file instanceof File)||!ACCEPT.has(file.type)||!file.size||file.size>MAX_INPUT)throw Error('صيغة أو حجم الملف غير مسموح.');
 const b=new Uint8Array(await file.slice(0,16).arrayBuffer());
 if(!signature(file.type,b))throw Error('توقيع الصورة غير صحيح.');
 if(file.type==='image/gif'){
  if(file.size>MAX_OUTPUT)throw Error('GIF أكبر من 5MB؛ اختر ملفاً أصغر للحفاظ على الحركة.');
  return file;
 }
 const bitmap=await createImageBitmap(file);
 try{
  if(!bitmap.width||!bitmap.height||bitmap.width*bitmap.height>36000000)throw Error('أبعاد الصورة غير مسموحة.');
  const ratio=Math.min(1,MAX_EDGE/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('تعذر تجهيز الصورة.');
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
  let blob=null;
  for(const quality of [.84,.72,.60]){
   blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
   if(blob&&blob.size<=MAX_OUTPUT)break;
  }
  if(!blob||!blob.size||blob.size>MAX_OUTPUT)throw Error('تعذر ضغط الصورة إلى الحجم المسموح.');
  return new File([blob],file.name.replace(/\.[^.]+$/,'')+'.webp',{type:'image/webp',lastModified:Date.now()});
 }finally{bitmap.close();}
}
window.KintoNoticeMediaPrepareV424=Object.freeze({prepare,MAX_OUTPUT,MAX_EDGE});
})();
