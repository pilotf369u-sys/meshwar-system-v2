(()=>{'use strict';
 const $=id=>document.getElementById(id),staff=document.body.dataset.workspace==='staff',core=window.KintoWorldCore;
 const url='https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/',key='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
 let busy=false;const draftKey='kinto_world_review_draft_v1';
 function actor(){if(!staff){const s=window.KintoCustomerSessionV150?.read();if(!s?.token)throw Error('سجّل الدخول بحساب العميل أولًا');return{role:'customer',token:s.token};}const role=$('staffRole').value;const s=role==='admin'?window.KintoAdminSessionV147?.read():window.KintoEmployeeSessionV143?.read();if(!s?.token)throw Error('سجّل الدخول في لوحة دورك أولًا، ثم افتح هذه الصفحة في التبويب نفسه');return{role,token:s.token};}
 async function rpc(name,args){const response=await fetch(url+name,{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(args),credentials:'omit',cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.message||'تعذر تنفيذ العملية');return data;}
 const messages={WORLD_ACCESS_DENIED:'حسابك غير مخصص لمسار المتاجر العالمية. يحدد الأدمن الموظف المخوّل.',WORLD_REVISION_CONFLICT:'تغير الطلب. أعد تحميله وراجعه قبل المحاولة.',WORLD_QUOTE_EXPIRED_OR_STATE:'انتهت صلاحية العرض أو تغير الطلب. اطلب مراجعة جديدة.',WORLD_GATEWAY_NOT_CONNECTED:'البوابة غير مربوطة بهذا المسار بعد. لا يوجد تحصيل إلكتروني.',WORLD_PAYMENT_VERIFICATION_REQUIRED:'يلزم تحقق الموظف من وصول كامل المبلغ والعملة ومرجع التحويل.'};
 async function run(fn){if(busy)return;busy=true;document.body.classList.add('busy');try{$('notice').textContent='جارٍ التحقق…';await fn();$('notice').textContent='تم بنجاح';}catch(e){$('notice').textContent=messages[e.message]||(/PGRST202|function.*not find|Could not find/.test(e.message)?'المسار غير مفعّل على الخادم بعد؛ لم يُرسل طلب.':e.message);}finally{busy=false;document.body.classList.remove('busy');}}
 function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
 function field(form,name,label,type='text',value=''){const l=el('label',label),input=document.createElement('input');input.name=name;input.type=type;if(type==='number'){input.min='0';input.step='0.01';}if(type==='checkbox')input.checked=Boolean(value);else input.value=value;input.required=true;l.append(input);form.append(l);return input;}
 function action(card,o,name,label,fields=[]){const form=el('form');for(const f of fields)field(form,...f);const b=el('button',label);form.append(b);form.onsubmit=e=>{e.preventDefault();run(async()=>{const a=actor(),data={};for(const f of form.querySelectorAll('input'))data[f.name]=f.type==='checkbox'?f.checked:f.type==='datetime-local'?new Date(f.value).toISOString():f.value;await rpc('kinto_world_action_v1',{p_role:a.role,p_session_token:a.token,p_order_id:o.id,p_expected_revision:o.revision,p_action:name,p_data:data});await load();});};card.append(form);}
 function render(orders){$('orders').replaceChildren();if(!orders.length)$('orders').append(el('p','لا توجد طلبات في هذا المسار.'));
 for(const o of orders){const c=el('article',undefined,'card');c.append(el('h2',o.reference),el('span',core.states[o.state]||o.state,'badge'));
 for(const p of o.request.items){if(/^https:\/\/([A-Za-z0-9-]+\.)*(dsmcdn\.com|trendyolcdn\.com)\//.test(p.image||'')){const image=el('img');image.src=p.image;image.alt=p.title;image.loading='lazy';image.referrerPolicy='no-referrer';image.className='product-image';c.append(image);}c.append(el('h3',p.title),el('p',`المقاس: ${p.size||'لا يوجد'} • اللون: ${p.color||'لا يوجد'} • الكمية: ${p.quantity}`));if(/^https:\/\/(www\.)?trendyol\.com\//.test(p.url||'')){const link=el('a','فتح صفحة المنتج');link.href=p.url;link.target='_blank';link.rel='noopener noreferrer';c.append(link);}}
 for(const q of o.estimates||[])c.append(el('p',`تقدير المنتجات: ${q.amount} ${q.currency} — لا يشمل الشحن، ويخضع للمراجعة`));
 if(staff&&o.request.contact)c.append(el('p',o.request.contact.name+' • '+o.request.contact.phone),el('p',o.request.contact.address));
 if(o.quote?.total)c.append(el('p',`المنتجات: ${o.quote.goods} ${o.quote.currency}`),el('p',`الشحن: ${o.quote.shipping} ${o.quote.currency}`),el('strong',`الإجمالي: ${o.quote.total} ${o.quote.currency}`),el('p','صلاحية العرض: '+new Date(o.quote.expires_at).toLocaleString('ar')),el('p',o.quote.instructions,'instructions'));
 if(o.quote?.reason)c.append(el('p',o.quote.reason));
 if(o.payment)c.append(el('p','مرجع التحويل: '+(o.payment.customer_reference||'—')));
 if(o.purchase)c.append(el('p','مرجع الشراء: '+o.purchase.reference),el('p','التتبع: '+(o.purchase.tracking||'لم يضف بعد')));
 if(!staff){
  if(['review','quoted'].includes(o.state))action(c,o,'cancel','إلغاء طلب المراجعة');
  if(o.state==='quoted'){action(c,o,'request_review','طلب إعادة المراجعة');c.append(el('p','بعد موافقتك على العرض وإتمام التحويل، سجّل مرجعه. تسجيل المرجع لا يعني تأكيد وصول المبلغ.'));action(c,o,'transfer','أوافق على العرض وأبلغ عن التحويل',[['reference','مرجع التحويل']]);const gateway=el('button','الدفع بالبوابة — غير متاح حاليًا');gateway.disabled=true;c.append(gateway);}
 }else{
  if(['review','quoted'].includes(o.state)){
   action(c,o,'quote','اعتماد العرض وإرسال تعليمات التحويل',[['goods','قيمة المنتجات النهائية','number'],['shipping','تكلفة الشحن المعتمدة (0 للمجاني)','number'],['currency','عملة التحصيل','text','IQD'],['expires_at','صالح حتى (خلال 48 ساعة)','datetime-local'],['instructions','تعليمات التحويل واسم المستفيد'],['can_ship','تحققت من إمكانية الشحن','checkbox'],['availability_checked','راجعت التوفر والسعر والخيارات','checkbox']]);
   action(c,o,'reject','تعذر قبول الطلب',[['reason','سبب التعذر']]);
  }
  if(o.state==='transfer_pending')action(c,o,'reject_transfer','لم يصل التحويل — إعادة للمراجعة',[['reason','نتيجة التحقق'],['not_received_verified','تحققت أن المبلغ لم يصل، وليس تحويلًا جزئيًا','checkbox']]);
  if(o.state==='transfer_pending')action(c,o,'confirm_transfer','تأكيد وصول المبلغ',[['amount','المبلغ المستلم','text',o.quote.total],['currency','العملة','text',o.quote.currency],['reference','مرجع التحقق المصرفي'],['bank_verified','تحققت فعليًا من وصول المبلغ إلى الحساب','checkbox']]);
  if(o.state==='paid')action(c,o,'purchase','تسجيل تنفيذ الشراء',[['reference','مرجع شراء المتجر'],['availability_rechecked','أعدت التحقق من التوفر والخيارات','checkbox'],['within_paid_amount','لا زيادة على المبلغ الذي وافق عليه العميل','checkbox']]);
  if(['paid','purchased'].includes(o.state))action(c,o,'refund_required','تعذر التنفيذ — يحتاج استردادًا',[['reason','سبب الاسترداد']]);
  if(o.state==='refund_pending')action(c,o,'confirm_refund','تسجيل إعادة كامل المبلغ',[['amount','المبلغ المعاد','text',o.quote.total],['currency','العملة','text',o.quote.currency],['reference','مرجع عملية الاسترداد الفعلية']]);
  if(o.state==='purchased')action(c,o,'ship','تسجيل الشحن',[['tracking','مرجع التتبع']]);
  if(o.state==='shipping')action(c,o,'deliver','تسجيل التسليم');
 }
 $('orders').append(c);
 }}
 async function load(){const a=actor();render(await rpc('kinto_world_list_v1',{p_role:a.role,p_session_token:a.token}));}
 $('policy').textContent=core.policy;$('refresh').onclick=()=>run(load);
 if(staff){$('staffRole').onchange=()=>run(load);const f=$('assign');f.onsubmit=e=>{e.preventDefault();run(async()=>{const a=actor();if(a.role!=='admin')throw Error('هذه العملية للأدمن فقط');await rpc('kinto_world_assign_staff_v1',{p_session_token:a.token,p_employee_id:$('employeeId').value.trim(),p_enabled:$('employeeEnabled').checked});});};}
 else{
  let draft;try{draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');const hash=new URLSearchParams(location.hash.slice(1));if(hash.has('draft')){const p=JSON.parse(hash.get('draft'));if(p.fixture||p.pricingSource==='synthetic-fixture')throw Error('لا ترسل بيانات الاختبار المصطنعة');draft={key:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.requestKey||'')?p.requestKey:crypto.randomUUID(),items:[{url:p.url,image:p.image||'',title:p.title,price:String(p.price),quantity:p.quantity,size:p.selectedOptions?.size||'',color:p.selectedOptions?.color||'',options_confirmed:p.optionsConfirmed===true}]};sessionStorage.setItem(draftKey,JSON.stringify(draft));history.replaceState(null,'',location.pathname);}}catch(e){$('notice').textContent='تعذر قراءة مسودة المنتج: '+e.message;}
  if(draft){$('draft').hidden=false;$('draftSummary').textContent=draft.items.map(p=>`${p.title} × ${p.quantity} — ${p.size} ${p.color}`).join('\n');$('submit').onclick=()=>run(async()=>{if(!$('accept').checked)throw Error('أكد موافقتك على شروط طلب المراجعة');const a=actor();await rpc('kinto_world_submit_v1',{p_session_token:a.token,p_request_key:draft.key,p_request:{items:draft.items,policy_accepted:true,contact:{name:$('recipient').value.trim(),phone:$('phone').value.trim(),address:$('address').value.trim()}}});sessionStorage.removeItem(draftKey);$('draft').hidden=true;await load();});}
 }
 run(load);
})();
