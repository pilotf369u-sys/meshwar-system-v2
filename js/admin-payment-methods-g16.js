/* G16 phase 1: admin-only payment-method catalogue. No order/checkout integration. */
(()=>{'use strict';
const root=()=>document.getElementById('g16PaymentMethods');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>window.KintoAdminSessionV147?.read?.()?.token||'';
let methods=[],busy=false;
// Bank identity is inferred locally from the provider name. No third-party logo API,
// remote image requests or unverified official trademark claims.
const bankIdentity=name=>{
 const n=String(name||'').normalize('NFKD').toLocaleLowerCase('tr').replace(/[\u0300-\u036f]/g,'').replace(/[ıİ]/g,'i').replace(/[^a-z0-9\u0600-\u06ff]/g,'');
 const known=[['ziraat','Ziraat','Z'],['vakif','VakıfBank','V'],['isbank','İşbank','İ'],['garanti','Garanti BBVA','G'],['akbank','Akbank','A'],['yapikredi','Yapı Kredi','Y'],['qnb','QNB','Q'],['kuveytturk','Kuveyt Türk','K'],['halkbank','Halkbank','H'],['turkiyefinans','Türkiye Finans','T'],['الرافدين','الرافدين','ر'],['الرشيد','الرشيد','ر'],['كيكارد','Qi Card','Qi'],['fibabanka','Fibabanka','F']];
 const hit=known.find(x=>n.includes(x[0]));return {name:hit?.[1]||String(name||'مصرف غير محدد'),mark:hit?.[2]||'▣',matched:!!hit};
};
const customerMessage=m=>['تعليمات التحويل (معاينة إدارية فقط — غير متصلة بطلبات العملاء):',
 'وسيلة الدفع: '+(m.label||''),'المصرف / المزود: '+(m.provider||''),
 'اسم المستفيد: '+(m.recipient_name||''),'رقم الحساب: '+(m.account_reference||''),
 'حوّل فقط إلى البيانات المعروضة داخل طلبك في KINTO بعد اعتمادها أمنياً. لا تعتمد على أي رقم حساب يُرسل عبر الدردشة أو واتساب.',
 'أرفق إيصال التحويل داخل طلبك؛ إرسال الإيصال لا يعني تأكيد التسديد، ويؤكده الموظف بعد التحقق.',
 m.instructions?'تعليمات إضافية: '+m.instructions:''].filter(Boolean).join('\\n');
function bankBadge(provider){
 const b=bankIdentity(provider),wrap=document.createElement('span');
 wrap.className='g16-bank-mark';wrap.textContent=b.mark;wrap.title=b.matched?'رمز تلقائي للمصرف (ليس شعاره الرسمي)':'رمز افتراضي حتى اعتماد شعار المصرف';
 return wrap;
}

async function rpc(action='list',extra={}){
 const t=token();if(!t)throw Error('جلسة الأدمن غير متاحة. يرجى تسجيل الدخول مجدداً.');
 const sb=await window.ensureCustomerSupabase();
 const {data,error}=await sb.rpc('kinto_payment_admin_g16',{p_session_token:t,p_action:action,...extra});
 if(error)throw error;return data;
}
const message=(v,bad=false)=>{const el=document.getElementById('g16Message');if(el){el.textContent=v;el.style.color=bad?'#b91c1c':'#166534'}};
function paint(data){
 methods=data.methods||[];
 const list=document.getElementById('g16List');if(!list)return;
 document.getElementById('g16GatewayState').textContent='الدفع الإلكتروني: متوقف — الربط الفعلي سيضاف لاحقاً في مرحلة مستقلة';
 list.replaceChildren();const pv=document.getElementById('g16CustomerPreview');if(pv){pv.hidden=true;pv.textContent=''}
 for(const m of methods){
  const card=document.createElement('div');card.className='g16-method';
  const info=document.createElement('div');
  info.innerHTML='<b>'+esc(m.label)+'</b> <small>('+esc(m.method_type==='manual'?'تحويل يدوي':'بوابة مستقبلية')+')</small><p>'+esc(m.provider)+(m.method_type==='manual'?' — '+esc(m.recipient_name||'')+' — '+esc(m.account_reference||''):'')+'</p><small>'+esc(m.is_enabled?'مفعّل':'متوقف')+'</small>';
  const actions=document.createElement('div');
  const edit=document.createElement('button');edit.type='button';edit.textContent='تعديل';edit.onclick=()=>fill(m);actions.append(edit);
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent=m.is_enabled?'إيقاف':'تفعيل';toggle.disabled=m.method_type==='gateway';toggle.title=m.method_type==='gateway'?'لا يمكن تفعيل بوابة قبل ربطها والتحقق منها':'';toggle.onclick=()=>change('toggle',{p_id:m.id,p_enabled:!m.is_enabled});actions.append(toggle);
  const brand=document.createElement('div');brand.className='g16-bank-identity';brand.append(bankBadge(m.provider));const bankText=document.createElement('span');bankText.textContent=bankIdentity(m.provider).name;brand.append(bankText);info.prepend(brand);
  if(m.method_type==='manual'){
   const preview=document.createElement('button');preview.type='button';preview.textContent='معاينة رسالة العميل';preview.onclick=()=>{const out=document.getElementById('g16CustomerPreview');out.hidden=false;out.textContent=customerMessage(m);out.scrollIntoView({block:'nearest',behavior:'smooth'})};actions.append(preview);
  }
  card.append(info,actions);list.append(card);
 }
 if(!methods.length)list.textContent='لا توجد وسائل دفع مضافة بعد.';
}
function fill(m){
 const f=document.getElementById('g16Form');
 f.elements.methodId.value=m?.id||'';f.elements.methodType.value=m?.method_type||'manual';
 f.elements.methodType.disabled=!!m;
 f.elements.methodLabel.value=m?.label||'';f.elements.methodProvider.value=m?.provider||'';
 f.elements.recipientName.value=m?.recipient_name||'';f.elements.accountReference.value=m?.account_reference||'';
 f.elements.instructions.value=m?.instructions||'';
 fields();f.scrollIntoView({block:'nearest',behavior:'smooth'});
}
function fields(){
 const f=document.getElementById('g16Form'),manual=f.elements.methodType.value==='manual';
 document.getElementById('g16ManualFields').hidden=!manual;
 f.elements.accountReference.required=manual;
 document.getElementById('g16GatewayNote').hidden=manual;
}
async function change(action,args){
 if(busy)return;busy=true;message('جارٍ الحفظ...');
 try{const data=await rpc(action,args);paint(data);message('تم الحفظ بنجاح.');if(action==='create'||action==='update')fill(null)}
 catch(e){message(e?.message||'تعذر حفظ البيانات.',true)}
 finally{busy=false}
}
async function load(){
 if(!root()||busy)return;busy=true;message('جارٍ تحميل طرق الدفع...');
 try{paint(await rpc());message('إدارة طرق الدفع مستقلة حالياً عن الطلبات؛ لا يتم إرسال بيانات الدفع تلقائياً.')}
 catch(e){message(e?.message||'تعذر التحميل. تأكد من تنفيذ SQL الخاص بالمرحلة.',true)}
 finally{busy=false}
}
window.loadAdminPaymentMethodsG16=load;
window.addEventListener('DOMContentLoaded',()=>{
 const f=document.getElementById('g16Form');if(!f)return;
 f.elements.methodType.addEventListener('change',fields);
 document.getElementById('g16Reset').onclick=()=>fill(null);
 document.getElementById('g16Reload').onclick=load;
 f.addEventListener('submit',e=>{
  e.preventDefault();const x=f.elements;
  const args={p_label:x.methodLabel.value.trim(),p_provider:x.methodProvider.value.trim(),p_recipient_name:x.recipientName.value.trim(),p_account_reference:x.accountReference.value.trim(),p_instructions:x.instructions.value.trim()};
  if(x.methodId.value)change('update',{...args,p_id:x.methodId.value});
  else change('create',{...args,p_method_type:x.methodType.value});
 });
 fields();
 if(root().classList.contains('active-section'))load();
});
})();
