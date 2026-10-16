/* Session-bound product/promotion upload tickets; no direct-upload fallback. */
(()=>{'use strict';
const URL='https://hsmmbloouskqdnptiiad.supabase.co',KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
async function ticket(storeId,file,purpose='product'){
 let session;try{session=JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')}catch{}
 if(!session?.token||(session.expiresAt&&Date.parse(session.expiresAt)<=Date.now()))throw Error('يرجى تسجيل دخول التاجر مجدداً لرفع الصورة.');
 const r=await fetch(URL+'/rest/v1/rpc/vendor_create_media_upload_session_v1',{method:'POST',headers:{apikey:KEY,Authorization:'Bearer '+KEY,'Content-Type':'application/json'},body:JSON.stringify({p_session_token:session.token,p_store_id:storeId,p_purpose:purpose,p_mime_type:file.type,p_byte_size:file.size})});
 const data=await r.json();if(!r.ok)throw Error(data?.message||'تعذر إنشاء تصريح رفع الصورة.');
 if(data?.bucket!=='product-images'||!data.path||!data.mime_type)throw Error('تصريح رفع الصورة غير صالح.');return data;
}
window.KintoVendorMediaV1={ticket};
})();
