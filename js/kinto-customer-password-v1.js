(()=>{'use strict';
const $=s=>document.querySelector(s);
function open(){
 if($('#kintoPasswordDialog'))return;
 const overlay=document.createElement('div');overlay.id='kintoPasswordDialog';
 overlay.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:16px';
 overlay.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="kintoPasswordTitle" style="direction:rtl;width:min(100%,420px);max-height:90vh;overflow:auto;background:#0a2f23;color:#fff;border:1px solid #d8b65b;border-radius:18px;padding:22px"><h2 id="kintoPasswordTitle" style="font-size:19px;margin:0 0 18px">الأمان وكلمة المرور</h2><form id="kintoPasswordForm" autocomplete="off"><label style="display:block;margin:10px 0">كلمة المرور الحالية<input type="password" name="current" autocomplete="current-password" required style="display:block;width:100%;padding:12px;color:#111;background:#fff;border-radius:8px"></label><label style="display:block;margin:10px 0">كلمة المرور الجديدة<input type="password" name="next" autocomplete="new-password" minlength="8" required style="display:block;width:100%;padding:12px;color:#111;background:#fff;border-radius:8px"></label><label style="display:block;margin:10px 0">تأكيد كلمة المرور<input type="password" name="confirm" autocomplete="new-password" minlength="8" required style="display:block;width:100%;padding:12px;color:#111;background:#fff;border-radius:8px"></label><p id="kintoPasswordStatus" role="status" aria-live="polite"></p><button type="submit" style="padding:12px;border-radius:8px;background:#d8b65b;color:#102b21">حفظ كلمة المرور</button> <button id="kintoPasswordClose" type="button" style="padding:12px;border-radius:8px">إغلاق</button></form><p style="margin-top:12px">نسيت كلمة المرور؟ تواصل مع دعم KINTO من زر الدعم في قائمتك.</p></section>';
 document.body.append(overlay);const form=$('#kintoPasswordForm'),status=$('#kintoPasswordStatus');const close=()=>overlay.remove();
 $('#kintoPasswordClose').addEventListener('click',close);overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 form.addEventListener('submit',async e=>{e.preventDefault();const current=form.elements.current.value,next=form.elements.next.value,confirm=form.elements.confirm.value;
 if(next!==confirm){status.textContent='تأكيد كلمة المرور غير مطابق.';return}
 if(next===current||new TextEncoder().encode(next).length<8||new TextEncoder().encode(next).length>72){status.textContent='اختر كلمة مرور مختلفة بين 8 و72 بايت.';return}
 const token=window.KintoCustomerSessionV150?.read?.()?.token;
 if(!token){status.textContent='يرجى تسجيل الدخول مرة أخرى.';return}
 const button=form.querySelector('[type=submit]');button.disabled=true;status.textContent='جارٍ التحقق...';
 try{const supabase=await window.ensureCustomerPortalSupabase(),{data,error}=await supabase.rpc('customer_change_password_session_v1',{p_session_token:token,p_current_password:current,p_new_password:next});
 if(error)throw error;
 if(data?.ok){form.reset();status.textContent='تم تغيير كلمة المرور بنجاح.'}
 else{status.textContent=data?.error==='PASSWORD_CHANGE_TEMPORARILY_LOCKED'?'توقف مؤقت بعد محاولات غير صحيحة. حاول بعد 15 دقيقة.':data?.error==='PASSWORD_INPUT_INVALID'?'تحقق من كلمة المرور الجديدة.':'تعذر تغيير كلمة المرور؛ تحقق من الكلمة الحالية.'}
 }catch{status.textContent='الخدمة غير متاحة حالياً. لم يتم تغيير كلمة المرور.'}finally{button.disabled=false}
 });
 form.elements.current.focus();
}
window.KintoCustomerPasswordV1=Object.freeze({open});
})();