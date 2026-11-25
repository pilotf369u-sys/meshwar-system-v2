/* KINTO card-image preparation v1. No storage, no upload, no order access.
 * Pure validation plus browser-only image compression. Never persist PAN/OTP/CVV.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KintoCardImagePrepareV1=api;})(typeof globalThis!=='undefined'?globalThis:null,function(){
'use strict';
const ACCEPTED=Object.freeze(['image/jpeg','image/png','image/webp']);
const MAX_SOURCE_BYTES=5*1024*1024,MAX_EDGE=1200,MAX_OUTPUT_BYTES=200*1024;
function validate(file){
 if(!file||!ACCEPTED.includes(file.type))throw Error('UNSUPPORTED_CARD_IMAGE_TYPE');
 if(!Number.isSafeInteger(file.size)||file.size<=0||file.size>MAX_SOURCE_BYTES)throw Error('CARD_IMAGE_SOURCE_SIZE');
 return true;
}
function scaledDimensions(w,h,maxEdge=MAX_EDGE){
 if(!Number.isFinite(w)||!Number.isFinite(h)||w<1||h<1)throw Error('INVALID_IMAGE_DIMENSIONS');
 const ratio=Math.min(1,maxEdge/Math.max(w,h));return {width:Math.max(1,Math.round(w*ratio)),height:Math.max(1,Math.round(h*ratio))};
}
async function prepare(file,win){
 validate(file);
 if(!win?.createImageBitmap||!win.document?.createElement)throw Error('IMAGE_PREPARE_UNSUPPORTED');
 const bitmap=await win.createImageBitmap(file);let canvas;
 try{
  const {width,height}=scaledDimensions(bitmap.width,bitmap.height);
  canvas=win.document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('CANVAS_UNAVAILABLE');
  context.fillStyle='#fff';context.fillRect(0,0,width,height);context.drawImage(bitmap,0,0,width,height);
  let blob=null;
  for(const quality of [0.82,0.7,0.58,0.46]){
   blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
   if(blob&&blob.size<=MAX_OUTPUT_BYTES)break;
  }
  if(!blob||blob.type!=='image/webp'||blob.size>MAX_OUTPUT_BYTES)throw Error('CARD_IMAGE_TOO_LARGE_AFTER_COMPRESSION');
  return blob;
 }finally{bitmap.close?.();if(canvas){canvas.width=0;canvas.height=0}}
}
return Object.freeze({validate,scaledDimensions,prepare,ACCEPTED,MAX_SOURCE_BYTES,MAX_EDGE,MAX_OUTPUT_BYTES});
});
