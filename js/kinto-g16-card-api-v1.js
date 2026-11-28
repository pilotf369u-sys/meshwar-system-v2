/* KINTO G16 card image API adapter — standalone, NOT wired into existing UI.
 * The caller must use the existing Supabase client and verified session token.
 * Image reads are short-lived. No payment/order state mutation.
 */
(function(root,factory){const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoG16CardApiV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
'use strict';
const endpoint='kinto-card-images-v1';
function token(value){const t=String(value||'');if(t.length<20||t.length>512)throw Error('SESSION_TOKEN_REQUIRED');return t}
function method(value){const id=String(value||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))throw Error('INVALID_METHOD_ID');return id}
function api(invoke){
 if(typeof invoke!=='function')throw Error('API_INVOKER_REQUIRED');
 async function call(action,session,extra={}){
  const {data,error}=await invoke(endpoint,{body:{action,session_token:token(session),...extra}});
  if(error)throw Error('CARD_IMAGE_API_UNAVAILABLE');
  if(!data||data.ok!==true)throw Error(String(data?.error||'CARD_IMAGE_REQUEST_DENIED'));
  return data;
 }
 return Object.freeze({
  employeeCards(session){return call('employee_cards',session)},
  employeeImage(session,methodId){return call('employee_image',session,{method_id:method(methodId)})},
  adminRequestOtp(session,methodId,makeDefault=false){
   return call('admin_request_image_otp',session,{method_id:method(methodId),make_default:makeDefault===true});
  },
  async adminCommitImage(session,methodId,challengeId,code,image){
   method(methodId);
   if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(challengeId||'')))throw Error('INVALID_CHALLENGE_ID');
   if(!/^[0-9]{6}$/.test(String(code||'')))throw Error('INVALID_OTP_FORMAT');
   if(!image||image.type!=='image/webp'||image.size<30||image.size>204800||typeof image.arrayBuffer!=='function')
    throw Error('COMPRESSED_WEBP_REQUIRED');
   const bytes=new Uint8Array(await image.arrayBuffer());
   if(bytes.byteLength!==image.size)throw Error('IMAGE_SIZE_CHANGED');
   if(typeof btoa!=='function')throw Error('BASE64_UNAVAILABLE');
   let binary='';for(let offset=0;offset<bytes.length;offset+=8192){
    binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
   }
   return call('admin_commit_image',session,{
    method_id:methodId,challenge_id:String(challengeId),code:String(code),webp_base64:btoa(binary)
   });
  }
 });
}
return Object.freeze({create:api,token,method});
});
