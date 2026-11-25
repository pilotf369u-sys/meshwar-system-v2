/* KINTO local image share — isolated optional OS share action.
 * Requires a real user gesture and a verified, locally selected compressed WebP File.
 * Never sends images automatically; WhatsApp link itself only shares text.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoCardImageShareV1=api;})(typeof globalThis!=='undefined'?globalThis:null,function(){
'use strict';
function validate(file){
 if(!file||file.type!=='image/webp'||!Number.isInteger(file.size)||file.size<30||file.size>204800)
 throw Error('INVALID_APPROVED_CARD_IMAGE');
 if(typeof file.name!=='string'||!/^kinto-card-[a-z0-9-]{1,48}[.]webp$/i.test(file.name))
 throw Error('CARD_IMAGE_NAME_INVALID');
 return file;
}
async function share(file,options){
 validate(file);
 const canShare=options?.canShare,send=options?.share;
 if(typeof canShare!=='function'||typeof send!=='function')throw Error('OS_IMAGE_SHARE_UNSUPPORTED');
 const payload={files:[file],title:'KINTO | بطاقة التحويل المعتمدة'};
 if(!canShare(payload))throw Error('OS_IMAGE_SHARE_UNSUPPORTED');
 // Must be called directly from a user click. Completion only means handoff
 // to OS share sheet; the user still chooses recipient and confirms send.
 await send(payload);
 return Object.freeze({openedShareSheet:true,sentByKinto:false,paymentConfirmed:false});
}
return Object.freeze({validate,share});
});
