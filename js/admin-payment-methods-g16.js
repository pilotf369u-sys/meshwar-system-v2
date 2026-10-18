/* G16 phase 1: admin-only payment-method catalogue. No order/checkout integration. */
(()=>{'use strict';
const root=()=>document.getElementById('g16PaymentMethods');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>window.KintoAdminSessionV147?.read?.()?.token||'';
let methods=[],settings={},busy=false,pendingChallenge='';
let p2ScriptPromise=null;
function mountPaymentProvidersP2(){
 const container=root(),form=document.getElementById('g16Form');
 if(!container||!form||document.getElementById('paymentProvidersP2'))return;
 const section=document.createElement('section');section.id='paymentProvidersP2';section.dir='rtl';
 section.style.cssText='max-width:900px;margin:14px 0;padding:14px;border:1px solid #cbd5e1;border-radius:10px;background:#f8fafc';
 section.innerHTML='<h4 style="margin:0 0 8px">مزودات الدفع — Payment-P2</h4><p id="paymentProvidersP2State" class="mini" role="status" aria-live="polite">المسار الفعلي يدوي والتحصيل الحقيقي مغلق.</p><div id="paymentProvidersP2List"></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" id="paymentProvidersP2Reload" class="btn-dark">تحديث القائمة</button><input id="paymentProvidersP2Reason" maxlength="500" placeholder="سبب إيقاف الطوارئ (8 أحرف على الأقل)" aria-label="سبب إيقاف الطوارئ"><button type="button" id="paymentProvidersP2Stop" class="btn-dark">إيقاف المحاولات الجديدة فوراً</button><button type="button" id="paymentProvidersP2Resume" class="btn-dark">طلب رفع الإيقاف</button></div><p id="paymentProvidersP2Status" class="mini" role="status" aria-live="polite"></p><p class="mini">محاكي KINTO مدرج للاختبارات المعزولة فقط ولا ينشئ تحصيلاً. شركات الدفع غير مربوطة حالياً. لا تدخل مفاتيح أو أسرار هنا. سيرفض الخادم رفع الإيقاف ما دام التكامل والاعتماد غير مكتملين.</p>';
 container.insertBefore(section,form);
}
async function loadPaymentProvidersP2(){
 mountPaymentProvidersP2();
 if(typeof window.loadPaymentProvidersP2==='function')return window.loadPaymentProvidersP2();
 if(!p2ScriptPromise){
  p2ScriptPromise=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src=new URL('js/admin-payment-providers-p2.js',document.baseURI).href;
   script.async=true;script.onload=resolve;script.onerror=()=>reject(Error('تعذر تحميل إعدادات Payment-P2.'));
   document.head.append(script);
  });
 }
 await p2ScriptPromise;
 if(typeof window.loadPaymentProvidersP2!=='function')throw Error('خدمة إعدادات Payment-P2 غير متاحة.');
 return window.loadPaymentProvidersP2();
}
async function secure(action,payload){
 const sb=await window.ensureCustomerSupabase();
 const {data,error}=await sb.functions.invoke('kinto-payment-security-g16',{body:{action,session_token:token(),...payload}});
 if(error){
  let detail='';
  try{const j=await error.context?.json?.();detail=String(j?.error||'')}catch{}
  const map={EMAIL_SEND_FAILED:'تعذر إرسال رمز الحماية إلى البريد الأمني.',ADMIN_DENIED:'انتهت جلسة الأدمن. سجّل الدخول مجدداً.',RATE_LIMIT:'تم بلوغ حد طلبات رمز الحماية. انتظر قليلاً ثم أعد المحاولة.',UNCONFIGURED:'إعدادات البريد الأمني غير مكتملة.'};
  throw Error(map[detail]||detail||error.message||'تعذر الاتصال بخدمة التحقق الأمني.');
 }
 if(!data?.ok)throw Error(data?.error||'تعذر التحقق الأمني.');return data;
}
// Bank identity is inferred locally from the provider name. No third-party logo API,
// remote image requests or unverified official trademark claims.
const bankIdentity=name=>{
 const n=String(name||'').normalize('NFKD').toLocaleLowerCase('tr').replace(/[\u0300-\u036f]/g,'').replace(/[ıİ]/g,'i').replace(/[^a-z0-9\u0600-\u06ff]/g,'');
 const known=[['ziraat','Ziraat','Z'],['vakif','VakıfBank','V'],['isbank','İşbank','İ'],['garanti','Garanti BBVA','G'],['akbank','Akbank','A'],['yapikredi','Yapı Kredi','Y'],['qnb','QNB','Q'],['kuveytturk','Kuveyt Türk','K'],['halkbank','Halkbank','H'],['turkiyefinans','Türkiye Finans','T'],['الرافدين','الرافدين','ر'],['الرشيد','الرشيد','ر'],['كيكارد','Qi Card','Qi'],['fibabanka','Fibabanka','F']];
 const hit=known.find(x=>n.includes(x[0]));return {name:hit?.[1]||String(name||'مصرف غير محدد'),mark:hit?.[2]||'▣',matched:!!hit};
};
const customerMessage=m=>['تعليمات التحويل:',
 'وسيلة الدفع: '+(m.label||''),'المصرف / المزود: '+(m.provider||''),
 'اسم المستفيد: '+(m.recipient_name||''),'رقم الحساب: '+(m.account_reference||''),
 'حوّل المبلغ فقط إلى بيانات الحساب المعروضة داخل طلبك في KINTO. لا تعتمد على أي رقم حساب يُرسل عبر الدردشة أو واتساب.',
 'أرفق إيصال التحويل داخل طلبك؛ إرسال الإيصال لا يعني تأكيد التسديد، ويؤكده الموظف بعد التحقق.',
 m.instructions?'تعليمات إضافية: '+m.instructions:''].filter(Boolean).join('\n');
function bankBadge(provider){
 const b=bankIdentity(provider),wrap=document.createElement('span');
 wrap.className='g16-bank-mark';wrap.textContent=b.mark;wrap.title=b.matched?b.name:'المصرف';
 return wrap;
}

async function rpc(action='list',extra={}){
 const t=token();if(!t)throw Error('جلسة الأدمن غير متاحة. يرجى تسجيل الدخول مجدداً.');
 const sb=await window.ensureCustomerSupabase();
 const {data,error}=await sb.rpc('kinto_payment_admin_g16',{p_session_token:t,p_action:action,...extra});
 if(error)throw error;return data;
}
async function runtimeRpc(action='get',extra={}){
 const t=token();if(!t)throw Error('جلسة الأدمن غير متاحة. يرجى تسجيل الدخول مجدداً.');
 const sb=await window.ensureCustomerSupabase();
 const {data,error}=await sb.rpc('kinto_payment_mode_admin_g16',{p_session_token:t,p_action:action,...extra});
 if(error){
  let detail='';try{const j=await error.context?.json?.();detail=String(j?.message||j?.error||'')}catch{}
  if(detail.includes('GATEWAY_INTEGRATION_NOT_DEPLOYED'))throw Error('لا يمكن تفعيل التحصيل الحي قبل اكتمال ربط البوابة ومراجعتها.');
  throw Error(detail||error.message||'تعذر حفظ إعداد مسار الدفع.');
 }
 if(!data?.payment_mode)throw Error(data?.error||'تعذر قراءة إعدادات مسار الدفع.');
 return data;
}
const message=(v,bad=false)=>{const el=document.getElementById('g16Message');if(el){el.textContent=v;el.style.color=bad?'#b91c1c':'#166534'}};
function runtimeStatus(v,bad=false){const el=document.getElementById('g16RuntimeStatus');if(el){el.textContent=v;el.style.color=bad?'#b91c1c':'#166534'}}
function setRuntimeControlsAvailable(available){
 for(const id of ['g16PaymentMode','g16GatewayEnvironment','g16SaveRuntime']){
  const el=document.getElementById(id);if(el)el.disabled=!available;
 }
 const gatewaySwitch=document.getElementById('g16GatewaySwitch');
 if(gatewaySwitch&&!available)gatewaySwitch.disabled=true;
}
function paintRuntime(data){
 settings=data||{};
 const mode=document.getElementById('g16PaymentMode'),env=document.getElementById('g16GatewayEnvironment');
 if(mode)mode.value=settings.payment_mode==='electronic'?'electronic':'manual';
 if(env)env.value=settings.gateway_environment==='live'?'live':'sandbox';
 const effective=settings.effective_payment_mode==='electronic'?'إلكتروني':'يدوي';
 const selected=settings.payment_mode==='electronic'?'إلكتروني (محدد، غير مفعّل)':'يدوي';
 const ready=settings.gateway_integration_ready===true;
 const state=document.getElementById('g16GatewayState');
 if(state)state.textContent='المسار المحدد: '+selected+' — المسار الفعلي حالياً: '+effective+' — التحصيل الإلكتروني '+(ready?'جاهز بعد الاعتماد':'مغلق حتى اكتمال الربط والاختبار');
 const sw=document.getElementById('g16GatewaySwitch');
 if(sw){sw.disabled=!ready;sw.textContent=!ready?'استقبال الدفع الإلكتروني مغلق':settings.gateways_enabled?'إيقاف استقبال المدفوعات الإلكترونية':'تفعيل استقبال المدفوعات الإلكترونية';}
 runtimeStatus(settings.payment_mode==='electronic'&&!ready?'تم حفظ اختيار الإلكتروني كإعداد فقط. لا تُنشأ محاولات تحصيل، ويبقى المسار الفعلي يدوياً حتى اكتمال الربط والاختبار.':'النظام اليدوي هو الافتراضي والفعلي حالياً.');
}
async function saveRuntime(){
 if(busy)return;
 const mode=document.getElementById('g16PaymentMode')?.value||'manual';
 const environment=document.getElementById('g16GatewayEnvironment')?.value||'sandbox';
 if(mode==='electronic'&&settings.payment_mode!=='electronic'&&!confirm('سيُحفظ اختيار الدفع الإلكتروني إعداداً للطلبات الجديدة، لكن التحصيل سيبقى مغلقاً حتى اكتمال الربط والاختبارات. الطلبات الجارية لن تتغير. متابعة؟'))return;
 if(environment==='live'&&!settings.gateway_integration_ready){runtimeStatus('بيئة الإنتاج غير متاحة قبل اكتمال ربط البوابة والمراجعة.',true);return}
 busy=true;runtimeStatus('جارٍ حفظ الإعدادات...');
 try{
  const updated=await runtimeRpc('set_mode',{p_payment_mode:mode});
  const withEnv=environment!==(updated.gateway_environment||'sandbox')?await runtimeRpc('set_environment',{p_gateway_environment:environment}):updated;
  paintRuntime(withEnv);
  runtimeStatus(mode==='electronic'&&!withEnv.gateway_integration_ready?'حُفظ الاختيار. الدفع الإلكتروني لا يستقبل عمليات حالياً؛ المسار الفعلي بقي يدوياً.':'تم حفظ إعداد المسار.');
 }catch(e){runtimeStatus(e?.message||'تعذر حفظ الإعدادات.',true);try{paintRuntime(await runtimeRpc('get'))}catch{}}
 finally{busy=false}
}
async function toggleGateway(){
 if(busy||!settings.gateway_integration_ready)return;
 const next=!settings.gateways_enabled;
 if(next&&!confirm('تأكيد تفعيل إنشاء محاولات دفع جديدة؟'))return;
 if(!next&&!confirm('إيقاف إنشاء محاولات دفع إلكترونية جديدة؟ ستستمر مطابقة العمليات السابقة.'))return;
 busy=true;runtimeStatus('جارٍ تحديث مفتاح إيقاف التحصيل...');
 try{paintRuntime(await runtimeRpc('gateway_switch',{p_enabled:next}));runtimeStatus(next?'تم تفعيل استقبال محاولات جديدة.':'تم إيقاف محاولات الدفع الجديدة؛ تبقى مطابقة العمليات السابقة مستمرة.')}
 catch(e){runtimeStatus(e?.message||'تعذر تحديث مفتاح الإيقاف.',true)}finally{busy=false}
}
function paint(data){
 methods=data.methods||[];
 const list=document.getElementById('g16List');if(!list)return;
 list.replaceChildren();const pv=document.getElementById('g16CustomerPreview');if(pv){pv.hidden=true;pv.textContent=''}
 for(const m of methods){
  const card=document.createElement('div');card.className='g16-method';
  const info=document.createElement('div');
  info.innerHTML='<b>'+esc(m.label)+'</b> <small>('+esc(m.method_type==='manual'?'تحويل يدوي':'بوابة مستقبلية')+')</small><p>'+esc(m.provider)+(m.method_type==='manual'?' — '+esc(m.recipient_name||'')+' — '+esc(m.account_reference||''):'')+'</p><small>'+esc(m.is_enabled?'مفعّل':'متوقف')+'</small>';
  const actions=document.createElement('div');
  const edit=document.createElement('button');edit.type='button';edit.textContent='تعديل';edit.onclick=()=>fill(m);actions.append(edit);
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent=m.is_enabled?'إيقاف':'تفعيل';toggle.disabled=m.method_type==='gateway';toggle.title=m.method_type==='gateway'?'لا يمكن تفعيل بوابة قبل ربطها والتحقق منها':'';toggle.onclick=()=>{if(!m.is_enabled&&m.method_type==='manual'&&!m.destination_verified_at)verifyDestination(m);else change('toggle',{p_id:m.id,p_enabled:!m.is_enabled})};actions.append(toggle);
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
function otpPanel(){
 let box=document.getElementById('g16OtpPanel');if(box)return box;
 const f=document.getElementById('g16Form');box=document.createElement('div');box.id='g16OtpPanel';box.hidden=true;box.dir='rtl';
 box.style.cssText='margin-top:12px;padding:12px;border:1px solid #8a7435;border-radius:10px;background:rgba(255,255,255,.04)';
 const title=document.createElement('div');title.textContent='تأكيد البريد الأمني';title.style.cssText='font-weight:700;margin-bottom:8px';
 const note=document.createElement('div');note.textContent='أدخل رمز الحماية المكوّن من 6 أرقام خلال 10 دقائق.';note.style.cssText='font-size:13px;margin-bottom:8px';
 const input=document.createElement('input');input.id='g16OtpCode';input.inputMode='numeric';input.autocomplete='one-time-code';input.maxLength=6;input.placeholder='رمز الحماية';input.style.cssText='max-width:180px;margin-left:8px';
 const verify=document.createElement('button');verify.type='button';verify.textContent='تأكيد الرمز';verify.onclick=confirmOtp;
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='إلغاء';cancel.style.marginInlineStart='6px';cancel.onclick=()=>{pendingChallenge='';box.hidden=true;message('تم إلغاء التحقق. لم تتغير بيانات الحساب.')};
 box.append(title,note,input,verify,cancel);f.insertAdjacentElement('afterend',box);return box;
}
function showOtp(challengeId){pendingChallenge=challengeId;const box=otpPanel();box.hidden=false;const input=box.querySelector('#g16OtpCode');input.value='';input.focus();box.scrollIntoView({block:'nearest',behavior:'smooth'});}
async function confirmOtp(){
 if(busy||!pendingChallenge)return;const input=document.getElementById('g16OtpCode'),code=String(input?.value||'').trim();
 if(!/^[0-9]{6}$/.test(code)){message('أدخل رمز الحماية المكوّن من 6 أرقام.',true);input?.focus();return}
 busy=true;message('جارٍ التحقق من الرمز...');
 try{await secure('verify',{challenge_id:pendingChallenge,code});pendingChallenge='';otpPanel().hidden=true;paint(await rpc());fill(null);message('تم التحقق من بيانات التحويل. الوسيلة بقيت متوقفة؛ فعّلها بعد مراجعة البيانات.');}
 catch(e){message(e?.message||'تعذر التحقق من الرمز.',true)}finally{busy=false}
}
async function verifyDestination(m,payload){
 if(busy)return;busy=true;message('جارٍ إرسال رمز الحماية إلى البريد الأمني...');
 try{
  const p=payload||{label:m.label,provider:m.provider,recipient_name:m.recipient_name,account_reference:m.account_reference,instructions:m.instructions};
  const req=await secure('request',{method_id:m?.id||null,payload:p});showOtp(req.challenge_id);message('تم إرسال رمز الحماية. أدخله في الخانة الظاهرة أدناه.');
 }catch(e){message(e?.message||'تعذر إكمال التحقق الأمني.',true)}finally{busy=false}
}
async function change(action,args){
 if(busy)return;busy=true;message('جارٍ الحفظ...');
 try{const data=await rpc(action,args);paint(data);message('تم الحفظ بنجاح.');if(action==='create'||action==='update')fill(null)}
 catch(e){message(e?.message||'تعذر حفظ البيانات.',true)}
 finally{busy=false}
}
async function load(){
 if(!root()||busy)return;busy=true;message('جارٍ تحميل طرق الدفع...');
 try{
  const catalog=await rpc();paint(catalog);
  try{
   const mode=await runtimeRpc('get');setRuntimeControlsAvailable(true);paintRuntime(mode);
   message('تم تحميل الإعدادات ووسائل الدفع؛ يبقى OTP مطلوباً عند تغيير بيانات التحويل.');
  }catch(e){
   paintRuntime({payment_mode:'manual',gateway_environment:'sandbox',gateways_enabled:false,gateway_integration_ready:false,effective_payment_mode:'manual'});
   setRuntimeControlsAvailable(false);
   runtimeStatus('إعداد وضع الدفع ينتظر تطبيق ترحيل G16؛ بقيت وسائل الدفع اليدوية متاحة.',true);
   message('تم تحميل وسائل الدفع اليدوية. إعداد وضع الدفع غير متاح حتى تطبيق SQL الخاص بـG16.');
  }
 }
 catch(e){message(e?.message||'تعذر تحميل وسائل الدفع. تحقق من ترحيل كتالوج G16.',true)}
 finally{busy=false;loadPaymentProvidersP2().catch(error=>status(error?.message||'تعذر تحميل إعدادات Payment-P2.',true))}
}
window.loadAdminPaymentMethodsG16=load;
window.addEventListener('DOMContentLoaded',()=>{
 const f=document.getElementById('g16Form');if(!f)return;
 f.elements.methodType.addEventListener('change',fields);
 document.getElementById('g16Reset').onclick=()=>fill(null);
 document.getElementById('g16Reload').onclick=load;
 document.getElementById('g16SaveRuntime').onclick=saveRuntime;
 document.getElementById('g16GatewaySwitch').onclick=toggleGateway;
 f.addEventListener('submit',e=>{
  e.preventDefault();const x=f.elements;
  const args={p_label:x.methodLabel.value.trim(),p_provider:x.methodProvider.value.trim(),p_recipient_name:x.recipientName.value.trim(),p_account_reference:x.accountReference.value.trim(),p_instructions:x.instructions.value.trim()};
  if(x.methodType.value==='manual'){
   const current=methods.find(m=>m.id===x.methodId.value);
   if(!current)return verifyDestination(null,{label:args.p_label,provider:args.p_provider,recipient_name:args.p_recipient_name,account_reference:args.p_account_reference,instructions:args.p_instructions});
   const sensitive=current.recipient_name!==args.p_recipient_name||current.account_reference!==args.p_account_reference;
   if(sensitive)return verifyDestination(current,{label:args.p_label,provider:args.p_provider,recipient_name:args.p_recipient_name,account_reference:args.p_account_reference,instructions:args.p_instructions});
   change('update',{...args,p_id:x.methodId.value});
  }else if(x.methodId.value)change('update',{...args,p_id:x.methodId.value});
  else change('create',{...args,p_method_type:x.methodType.value});
 });
 fields();
 if(root().classList.contains('active-section'))load();
});
})();
