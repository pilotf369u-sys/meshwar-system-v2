/* KINTO G16 verified bank destination card artwork.
 * No image storage, external bank logo, fetch or file upload.
 * Generates a downloadable WebP preview ONLY from previously approved G16
 * account data; visual is an informational KINTO bank destination card,
 * NEVER represents a real bank-issued plastic card or payment confirmation.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoG16DestinationCardArtworkV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const LIMIT=204800,WIDTH=960,HEIGHT=540;
 function clean(value,max){
  if(typeof value!=='string'||!value.trim()||value.length>max||
   /[\u0000-\u001f\u007f]/.test(value))throw Error('CARD_ARTWORK_FIELD_INVALID');
  return value.trim();
 }
 function validate(card){
  if(!card||card.method_type!=='manual'||card.is_enabled!==true||
    !Number.isFinite(Date.parse(card.destination_verified_at))||
    !card.destination_verified_at)throw Error('CARD_NOT_SERVER_APPROVED');
  return Object.freeze({
   id:clean(card.id,128),bank:clean(card.provider,80),
   title:clean(card.label,100),recipient:clean(card.recipient_name,100),
   account:clean(card.account_reference,150)
  });
 }
 function lines(ctx,value,maxWidth){
  const parts=value.split(' '),result=[],maxLines=3;
  let line='';
  for(const word of parts){
   const next=line?line+' '+word:word;
   if(ctx.measureText(next).width>maxWidth&&line){
    result.push(line);line=word;
   }else line=next;
   if(result.length>=maxLines)throw Error('CARD_ARTWORK_TEXT_TOO_LONG');
  }
  if(line)result.push(line);
  if(result.length>maxLines||result.some(x=>ctx.measureText(x).width>maxWidth))
   throw Error('CARD_ARTWORK_TEXT_TOO_LONG');
  return result;
 }
 async function create(card,options){
  const data=validate(card);
  const canvas=options?.document?.createElement?.('canvas');
  if(!canvas||typeof canvas.getContext!=='function'||typeof canvas.toBlob!=='function')
   throw Error('CARD_ARTWORK_UNSUPPORTED');
  canvas.width=WIDTH;canvas.height=HEIGHT;
  try{
   const ctx=canvas.getContext('2d');
   if(!ctx)throw Error('CARD_ARTWORK_UNSUPPORTED');
   const gradient=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);
   gradient.addColorStop(0,'#0a2f23');gradient.addColorStop(1,'#176645');
   ctx.fillStyle=gradient;ctx.fillRect(0,0,WIDTH,HEIGHT);
   ctx.strokeStyle='#c9ab64';ctx.lineWidth=5;ctx.strokeRect(20,20,WIDTH-40,HEIGHT-40);
   ctx.textAlign='right';ctx.textBaseline='top';
   ctx.fillStyle='#f2d68d';ctx.font='bold 58px sans-serif';ctx.fillText('KINTO',WIDTH-65,43);
   ctx.fillStyle='#ecf4ed';ctx.font='bold 33px sans-serif';
   for(const [i,l] of lines(ctx,data.title,WIDTH-120).entries())ctx.fillText(l,WIDTH-65,123+i*39);
   ctx.font='26px sans-serif';ctx.fillStyle='#bfdac9';
   ctx.fillText('المصرف / '+data.bank,WIDTH-65,225);
   ctx.fillText('اسم المستفيد',WIDTH-65,285);
   ctx.font='bold 33px sans-serif';ctx.fillStyle='#fff4d4';
   for(const [i,l] of lines(ctx,data.recipient,WIDTH-120).entries())ctx.fillText(l,WIDTH-65,321+i*36);
   ctx.font='26px sans-serif';ctx.fillStyle='#bfdac9';ctx.fillText('رقم الحساب أو البطاقة للتحويل',WIDTH-65,395);
   ctx.textAlign='left';ctx.direction='ltr';ctx.font='bold 31px monospace';ctx.fillStyle='#fff4d4';
   if(ctx.measureText(data.account).width>WIDTH-130)throw Error('CARD_ARTWORK_ACCOUNT_TOO_LONG');
   ctx.fillText(data.account,65,438);
   ctx.textAlign='right';ctx.direction='rtl';ctx.font='19px sans-serif';ctx.fillStyle='#e5cf96';
   ctx.fillText('بيانات التحويل المعتمدة من KINTO — ليست بطاقة مصرفية صادرة من البنك',WIDTH-65,490);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.83));
   if(!blob||blob.type!=='image/webp'||blob.size<30||blob.size>LIMIT)
    throw Error('CARD_ARTWORK_OUTPUT_UNSUPPORTED');
   return Object.freeze({blob,filename:'kinto-card-'+data.id.replace(/[^a-z0-9-]/gi,'').slice(0,48)+'.webp',
    type:'image/webp',approvedCardId:data.id,bankIssued:false,uploaded:false,
    sent:false,paymentConfirmed:false});
  }finally{canvas.width=0;canvas.height=0}
 }
 return Object.freeze({create,validate,WIDTH,HEIGHT,LIMIT});
});
