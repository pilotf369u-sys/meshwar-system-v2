/* Payment-P2 provider controls. This UI edits configuration only; no checkout calls. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const root=()=>$('paymentProvidersP2');
const token=()=>window.KintoAdminSessionV147?.read?.()?.token||'';
const protocolLabel={simulator:'محاكي معزول',hosted_checkout:'صفحة دفع مستضافة',api:'API خادمي',sdk:'SDK خادمي'};
let busy=false;

async function rpc(action='get',extra={}){
 const sessionToken=token();
 if(!sessionToken)throw Error('جلسة الأدمن غير متاحة. يرجى تسجيل الدخول مجدداً.');
 const sb=await window.ensureCustomerSupabase();
 const {data,error}=await sb.rpc('kinto_payment_provider_admin_p2',{
  p_session_token:sessionToken,p_action:action,...extra,
 });
 if(error)throw error;
 return data;
}

function status(text,bad=false){
 const el=$('paymentProvidersP2Status');
 if(el){el.textContent=text;el.style.color=bad?'#b91c1c':'#166534'}
}

function button(label,run,disabled=false){
 const el=document.createElement('button');el.type='button';el.textContent=label;el.disabled=disabled;
 el.addEventListener('click',run);return el;
}

function paint(data){
 const list=$('paymentProvidersP2List');if(!list)return;
 list.replaceChildren();
 const providers=Array.isArray(data?.providers)?data.providers:[];
 for(const provider of providers){
  const card=document.createElement('article');
  card.style.cssText='display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;padding:12px;margin:8px 0;border:1px solid #cbd5e1;border-radius:10px;background:#fff';
  const details=document.createElement('div');
  const title=document.createElement('strong');title.textContent=provider.display_name||provider.provider_key;
  const line=document.createElement('p');line.className='mini';
  line.textContent=(protocolLabel[provider.checkout_protocol]||'مزود مستقبلي')+
   (provider.test_only?' — للاختبار فقط':'')+' — '+(provider.enabled?'مفعّل كإعداد':'متوقف')+
   ' — '+(provider.integration_ready?'جاهزية تكامل مُثبتة':'غير مربوط')+
   ' — التحصيل الحقيقي مغلق';
  details.append(title,line);
  const controls=document.createElement('div');controls.style.cssText='display:flex;gap:8px;flex-wrap:wrap';
  controls.append(button(provider.selected?'المزود المحدد':'اختيار هذا المزود',
   ()=>run('select_provider',{p_provider_key:provider.provider_key}),
   !provider.enabled||provider.selected));
  controls.append(button(provider.enabled?'إيقاف المزود':'تفعيل الإعداد',
   ()=>run('set_provider_enabled',{p_provider_key:provider.provider_key,p_enabled:!provider.enabled}),false));
  card.append(details,controls);list.append(card);
 }
 if(!providers.length)list.textContent='لا توجد مزودات معرفة حالياً.';
 const stop=$('paymentProvidersP2Stop');
 if(stop)stop.textContent=data?.emergency_stop?'مفتاح الطوارئ مفعّل':'إيقاف المحاولات الجديدة فوراً';
 const state=$('paymentProvidersP2State');
 if(state)state.textContent='المسار الفعلي: يدوي — التحصيل الحقيقي: مغلق — المحاكي: اختبار بلا تحصيل — الإيقاف العام: '+(data?.emergency_stop?'مفعّل':'غير مفعّل');
}

async function run(action,extra={}){
 if(busy)return;
 busy=true;status('جارٍ حفظ إعداد المزود...');
 try{
  const data=await rpc(action,extra);
  if(data?.ok===false){paint(await rpc('get'));status('رفض الخادم الطلب: '+(data.error||'غير متاح حالياً'),true);return}
  const latest=action==='get'?data:await rpc('get');
  paint(latest);status('حُفظ الإعداد. يبقى وضع الدفع الفعلي يدوياً والتحصيل الإلكتروني مغلقاً.');
 }catch(error){status(error?.message||'تعذر حفظ إعدادات المزود.',true)}
 finally{busy=false}
}

async function stop(){
 const reason=$('paymentProvidersP2Reason')?.value?.trim()||'';
 if(reason.length<8){status('اكتب سبباً لا يقل عن 8 أحرف لتسجيل إيقاف الطوارئ.',true);return}
 await run('emergency_stop',{p_reason:reason});
}

async function load(){
 if(!root()||busy)return;
 status('جارٍ تحميل مزودات الدفع...');
 try{paint(await rpc('get'));status('الإعدادات محمية بجلسة الأدمن. لا يوجد تحصيل حقيقي في Payment-P2.')}
 catch(error){status(error?.message||'ترحيل Payment-P2 غير مطبق أو تعذر تحميله.',true)}
}

window.loadPaymentProvidersP2=load;
function bind(){
 if(!$('paymentProvidersP2'))return;
 $('paymentProvidersP2Reload')?.addEventListener('click',load);
 $('paymentProvidersP2Stop')?.addEventListener('click',stop);
 $('paymentProvidersP2Resume')?.addEventListener('click',()=>run('resume_new_payments'));
}
if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',bind,{once:true});
else bind();
})();
