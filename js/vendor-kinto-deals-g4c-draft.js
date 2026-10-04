/* G4I merchant draft composer: verified RPCs only; submit is separate from publication. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const token=()=>{try{return JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')?.token||''}catch{return''}};
const state={selected:new Map(),catalog:new Map(),giftResults:new Map(),gift:null,campaignId:null,updatedAt:null,termsSnapshot:{},giftOptions:{},busy:false};
const rpc=async(name,args)=>{const sb=window.MeshwarVendorRuntime?.sb;if(!sb)throw Error('اتصال الحملات لم يجهز بعد. أعد تحديث قائمة المسودات بعد اكتمال تحميل اللوحة.');if(!token())throw Error('رمز جلسة الحملات الآمنة غير موجود في هذا التبويب؛ تسجيل دخول لوحة المتجر وحده لا يثبت جلسة الحملات. لم تتغير مسوداتك.');const {data,error}=await sb.rpc(name,{p_session_token:token(),...args});if(error)throw error;return data};
const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
const setMsg=(message,bad=false)=>{const e=$('kdDraftMessage');if(e){e.textContent=message;e.className='text-sm mt-3 '+(bad?'text-rose-300':'text-amber-200')}};
const setResultsVisible=(kind,visible)=>{
 const gift=kind==='gift',box=$(gift?'kdGiftResults':'kdSearchResults'),toggle=$(gift?'kdGiftToggle':'kdSearchToggle');
 box.classList.toggle('hidden',!visible);box.classList.toggle('grid',visible);
 toggle.classList.remove('hidden');toggle.textContent=(visible?'إخفاء':'إظهار')+(gift?' نتائج الهدايا':' نتائج المنتجات');
 toggle.setAttribute('aria-expanded',String(visible));
};
const toggleResults=kind=>setResultsVisible(kind,$(kind==='gift'?'kdGiftResults':'kdSearchResults').classList.contains('hidden'));
const renderGiftResults=()=>{
 const box=$('kdGiftResults');if(!box)return;box.replaceChildren();
 for(const p of state.giftResults.values()){
  if(state.selected.has(p.id))continue;
  const row=el('div',undefined,'flex items-center gap-2 rounded-lg border border-white/10 p-2 text-xs');
  if(p.image_url){const img=el('img');img.src=p.image_url;img.alt=p.product_name||'';img.loading='lazy';img.className='h-12 w-12 shrink-0 rounded-lg object-contain bg-white/5';row.append(img)}
  const info=el('span',p.product_name+' | '+(p.barcode||'—')+' | '+p.base_price+' '+(p.currency||''),'min-w-0 flex-1 break-words');row.append(info);
  const selected=state.gift===p.id;
  const button=el('button',selected?'إلغاء الهدية':'اختيار هدية','shrink-0 rounded-lg border px-2 py-2 '+(selected?'border-emerald-400 text-emerald-200':'border-amber-400/40 text-amber-100'));
  button.type='button';button.setAttribute('aria-pressed',String(selected));
  button.addEventListener('click',()=>{state.gift=state.gift===p.id?null:p.id;renderSelected();if(state.gift)setResultsVisible('gift',false)});row.append(button);box.append(row);
 }
};
const renderSelected=()=>{
 const box=$('kdSelected');box.replaceChildren();
 for(const p of state.selected.values()){
  const row=el('div',undefined,'flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-xs');
  if(p.image_url){const img=el('img');img.src=p.image_url;img.alt=p.product_name||'';img.loading='lazy';img.className='h-12 w-12 shrink-0 rounded-lg object-contain bg-white/5';row.append(img)}
  const info=el('span',(p.product_name||'منتج')+' | '+(p.barcode||'—')+' | '+(p.base_price??'—')+' '+(p.currency||''),'min-w-0 flex-1 break-words');row.append(info);
  const b=el('button','إزالة','shrink-0 rounded-lg border border-rose-300/40 px-2 py-1 text-rose-200');b.type='button';b.addEventListener('click',()=>{state.selected.delete(p.id);renderSelected()});row.append(b);box.append(row);
 }
 $('kdSelectedCount').textContent=String(state.selected.size);
 if(state.gift&&state.selected.has(state.gift))state.gift=null;
 const gift=$('kdGift');gift.replaceChildren();const empty=el('option','بلا هدية');empty.value='';gift.append(empty);
 if(state.gift){
  const p=state.catalog.get(state.gift)||state.giftResults.get(state.gift);
  if(p){const option=el('option',p.product_name);option.value=p.id;gift.append(option);gift.value=p.id}
  else state.gift=null;
 }
 const chosen=$('kdGiftChosen');chosen.replaceChildren();
 if(state.gift){
  const p=state.catalog.get(state.gift);
  if(p){
   const row=el('div',undefined,'flex items-center gap-2 rounded-lg border border-emerald-400/50 bg-emerald-900/20 p-2 text-xs');
   if(p.image_url){const img=el('img');img.src=p.image_url;img.alt=p.product_name||'';img.className='h-12 w-12 rounded-lg object-contain';row.append(img)}
   row.append(el('span','الهدية المختارة: '+p.product_name,'min-w-0 flex-1'));
   const clear=el('button','إزالة','rounded-lg border border-rose-300/40 px-2 py-1');clear.type='button';clear.addEventListener('click',()=>{state.gift=null;renderSelected()});row.append(clear);chosen.append(row);
  }
 }
 renderGiftResults();
};
async function searchGift(){
 const status=$('kdGiftStatus'),box=$('kdGiftResults');status.textContent='جاري البحث عن الهدية...';box.replaceChildren();
 try{
  const data=await rpc('kinto_deals_v1_vendor_products_g4',{p_search:$('kdGiftSearch').value.trim(),p_limit:50});
  state.giftResults=new Map((data.items||[]).map(p=>[p.id,p]));
  for(const p of state.giftResults.values())state.catalog.set(p.id,p);
  renderSelected();setResultsVisible('gift',true);status.textContent=state.giftResults.size?'اختر الهدية من البطاقات أدناه.':'لا توجد نتائج مطابقة للهدية.';
 }catch(e){status.textContent='تعذر البحث عن الهدية: '+e.message}
}
async function search(){
 const box=$('kdSearchResults');box.replaceChildren();setMsg('جاري البحث...');
 try{
  const data=await rpc('kinto_deals_v1_vendor_products_g4',{p_search:$('kdSearch').value.trim(),p_limit:50});
  state.results=data.items||[];
  for(const p of state.results)state.catalog.set(p.id,p);
  for(const p of state.results){
   const row=el('div',undefined,'flex items-center gap-2 rounded-lg border border-white/10 p-2 text-xs');
   if(p.image_url){const img=el('img');img.src=p.image_url;img.alt='';img.loading='lazy';img.className='h-10 w-10 rounded-lg object-contain';row.append(img)}
   const info=el('span',p.product_name+' | '+(p.barcode||'—')+' | '+p.base_price+' '+(p.currency||''),'flex-1');row.append(info);
   const b=el('button',state.selected.has(p.id)?'محدد':'إضافة','rounded-lg border border-amber-400/40 px-3 py-2');b.type='button';
   b.addEventListener('click',()=>{if(state.selected.has(p.id))state.selected.delete(p.id);else if(state.selected.size<50){state.selected.set(p.id,p);if(state.gift===p.id)state.gift=null}else return setMsg('الحد الأقصى 50 منتجاً.',true);renderSelected();b.textContent=state.selected.has(p.id)?'محدد':'إضافة';if(state.selected.has(p.id))setResultsVisible('paid',false)});row.append(b);box.append(row);
  }
  renderSelected();setResultsVisible('paid',true);setMsg('نتائج البحث من منتجات متجرك فقط. اختر المنتجات المدفوعة والهدية بشكل منفصل.');
 }catch(e){setMsg(e.message,true)}
}
const localDate=value=>{const d=new Date(value);const offset=d.getTimezoneOffset()*60000;return new Date(d.getTime()-offset).toISOString().slice(0,16)};
async function listDrafts(){
 const box=$('kdDraftList');if(!box)return;const status=$('kdDraftLoadStatus');status.textContent='جاري تحميل المسودات...';
 try{
  const data=await rpc('kinto_deals_v1_vendor_drafts_g4',{p_campaign_id:null,p_limit:30});
  box.replaceChildren();status.textContent='';
  if(!data?.items?.length){box.append(el('p','لا توجد مسودات محفوظة.','text-xs text-slate-400'));return}
  for(const item of data.items){
   const row=el('div',undefined,'flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 p-2');
   row.append(el('span',item.title+' — '+new Date(item.updated_at).toLocaleString('ar-IQ'),'text-xs'));
   const b=el('button','استعادة للتعديل','rounded-lg border border-amber-400/40 px-3 py-2 text-xs');b.type='button';
   b.addEventListener('click',()=>restoreDraft(item));row.append(b);
   const submit=el('button','إرسال للإدارة','rounded-lg border border-emerald-400/50 px-3 py-2 text-xs font-bold text-emerald-200');submit.type='button';
   submit.addEventListener('click',()=>submitDraft(item));row.append(submit);box.append(row);
  }
 }catch(e){status.textContent='تعذر تحميل المسودات: '+e.message+' — اضغط تحديث القائمة للمحاولة مجدداً.'}
}
async function submitDraft(item){
 if(state.busy)return;
 if(!window.confirm('إرسال الحملة «'+item.title+'» لمراجعة الإدارة؟ سيتم قفل تعديل هذه المسودة، ولن تُنشر إلا وفق بوابات الموافقة والنشر المستقلة. تأكد أنك حفظت آخر تغييراتك أولاً.'))return;
 state.busy=true;$('kdSave').disabled=true;
 try{
  const data=await rpc('kinto_deals_v1_vendor_submit_g4',{p_campaign_id:item.id,p_expected_updated_at:item.updated_at});
  if(!data?.ok||data.review_state!=='pending')throw Error('لم يؤكد الخادم استلام طلب المراجعة.');
  if(state.campaignId===item.id){state.campaignId=null;state.updatedAt=null;clearAdPreview();$('kdAdImage').value='';state.selected.clear();state.gift=null;$('kdDraftForm').reset();syncKind();renderSelected()}
  setMsg('تم إرسال الحملة للإدارة، وهي الآن قيد المراجعة. لم تُنشر للعملاء.');
  await listDrafts();
  window.dispatchEvent(new CustomEvent('kinto-deals-vendor-submitted',{detail:{campaignId:item.id}}));
 }catch(e){setMsg('تعذر إرسال الحملة: '+e.message,true)}
 finally{state.busy=false;$('kdSave').disabled=false}
}
async function restoreDraft(item){
 if(state.busy)return;
 try{
  // G4H returns exact metadata for this store's saved draft, regardless of catalog size.
  // Fail closed if the migration has not yet been applied or a product is missing.
  const ids=item.product_ids||[];
  if(!Array.isArray(item.products))throw Error('تحديث G4H مطلوب على Supabase قبل استعادة هذه المسودة. لم نغيّر بياناتها.');
  const hydrated=new Map(item.products.map(p=>[p.id,p]));
  const missing=ids.filter(id=>!hydrated.has(id));
  if(missing.length||hydrated.size!==ids.length)throw Error('بيانات منتجات المسودة غير مكتملة؛ لا يمكن استعادتها بأمان.');
  if(item.gift_product_id){
   if(!item.gift_product||item.gift_product.id!==item.gift_product_id)throw Error('تعذر استعادة بيانات الهدية؛ لم نغيّر المسودة.');
   hydrated.set(item.gift_product.id,item.gift_product);
  }
  for(const p of hydrated.values())state.catalog.set(p.id,p);
  state.selected.clear();
  for(const id of ids)state.selected.set(id,state.catalog.get(id));
  state.gift=item.gift_product_id||null;
  if(state.gift&&state.catalog.has(state.gift))state.giftResults.set(state.gift,state.catalog.get(state.gift));
  $('kdTitle').value=item.title||'';$('kdDescription').value=item.description||'';
  $('kdKind').value=item.kind;$('kdStart').value=localDate(item.starts_at);$('kdEnd').value=localDate(item.ends_at);
  $('kdThreshold').value=item.threshold_units??2;$('kdUses').value=item.max_uses_per_customer??1;
  $('kdUnits').value=item.max_units_per_customer??2;$('kdTotal').value=item.max_total_redemptions??'';
  state.campaignId=item.id;state.updatedAt=item.updated_at;state.termsSnapshot=item.terms_snapshot||{};state.giftOptions=item.gift_selected_options||{};syncKind();renderSelected();
  setMsg('استعدنا المسودة للتعديل. لن تُحفظ التغييرات حتى تضغط «حفظ المسودة فقط».');
 }catch(e){setMsg('تعذرت الاستعادة: '+e.message,true)}
}

// G13: merchant advertising image is independent of products, gifts and coupons.
let adPreviewUrl=null;
function clearAdPreview(){
 if(adPreviewUrl)URL.revokeObjectURL(adPreviewUrl);
 adPreviewUrl=null;
 const preview=$('kdAdPreview');
 if(preview){preview.hidden=true;preview.removeAttribute('src')}
}
async function uploadAdImage(){
 const status=$('kdAdStatus'),button=$('kdAdUpload'),file=$('kdAdImage')?.files?.[0];
 if(state.busy)return;
 if(!state.campaignId){status.textContent='احفظ المسودة أولاً ثم ارفع صورتها.';return}
 if(!file){status.textContent='اختر صورة الإعلان أولاً.';return}
 if(!token()){status.textContent='جلسة التاجر غير متاحة. سجّل الدخول مجدداً.';return}
 state.busy=true;button.disabled=true;
 try{
  status.textContent='جاري ضغط الصورة...';
  const image=await window.KintoMerchantAdImageG13.prepare(file);
  status.textContent='جاري رفع صورة WebP ('+Math.ceil(image.size/1024)+'KB)...';
  const form=new FormData();
  form.set('session_token',token());form.set('campaign_id',state.campaignId);form.set('file',image);
  const response=await fetch('https://hsmmbloouskqdnptiiad.supabase.co/functions/v1/kinto-deals-ad-media-g13',{
   method:'POST',headers:{apikey:'sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH'},body:form
  });
  const result=await response.json();
  if(!response.ok||result?.ok!==true)throw Error(result?.error||'فشل رفع الصورة');
  clearAdPreview();adPreviewUrl=URL.createObjectURL(image);
  const preview=$('kdAdPreview');preview.src=adPreviewUrl;preview.hidden=false;
  status.textContent='تم رفع صورة الإعلان إلى مسودة الحملة. لا تظهر للعميل قبل الموافقة والنشر.';
 }catch(error){status.textContent='تعذر رفع الصورة: '+error.message}
 finally{state.busy=false;button.disabled=false}
}

const dateValue=id=>{const v=$(id).value;if(!v)throw Error('حدد بداية الحملة ونهايتها.');return new Date(v).toISOString()};
function syncKind(){
 const kind=$('kdKind').value,limited=kind==='limited_purchase';
 const radio=document.querySelector('input[name="kdKindChoice"][value="'+kind+'"]');if(radio)radio.checked=true;
 $('kdThresholdWrap').hidden=limited;$('kdGiftWrap').hidden=limited;
 $('kdUnitsWrap').hidden=!limited;
}
async function save(){
 if(state.busy)return;state.busy=true;$('kdSave').disabled=true;
 try{
  const kind=$('kdKind').value,limited=kind==='limited_purchase';
  const draft={title:$('kdTitle').value.trim(),description:$('kdDescription').value.trim(),kind,
   starts_at:dateValue('kdStart'),ends_at:dateValue('kdEnd'),
   threshold_units:limited?null:Number($('kdThreshold').value),
   gift_product_id:limited?null:(state.gift||null),gift_selected_options:limited?{}:state.giftOptions,
   max_uses_per_customer:Number($('kdUses').value),
   max_units_per_customer:limited?Number($('kdUnits').value):null,
   max_total_redemptions:$('kdTotal').value?Number($('kdTotal').value):null,
   terms_snapshot:state.termsSnapshot,product_ids:[...state.selected.keys()]};
  const data=await rpc('kinto_deals_v1_vendor_save_draft_g4',{p_campaign_id:state.campaignId,p_expected_updated_at:state.updatedAt,p_draft:draft});
  state.campaignId=data.campaign_id;state.updatedAt=data.updated_at;
  setMsg('تم حفظ المسودة على الخادم. رقمها: '+data.campaign_id+' — لم تُرسل للإدارة ولم تُنشر.');
  await listDrafts();
 }catch(e){setMsg('تعذر حفظ المسودة: '+e.message,true)}
 finally{state.busy=false;$('kdSave').disabled=false}
}
document.addEventListener('DOMContentLoaded',()=>{
 if(!$('kdDraftForm'))return;
 $('kdSearchButton').addEventListener('click',search);
 $('kdSearchToggle').addEventListener('click',()=>toggleResults('paid'));
 $('kdGiftToggle').addEventListener('click',()=>toggleResults('gift'));
 $('kdGiftSearchButton').addEventListener('click',searchGift);
 $('kdGiftSearch').addEventListener('focus',()=>{if(!state.giftResults.size)searchGift()},{once:true});
 $('kdGiftSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();searchGift()}});
 $('kdRefreshDrafts').addEventListener('click',listDrafts);
 window.addEventListener('kinto-deals-revision-created',async e=>{
  await listDrafts();
  const campaignId=e.detail?.campaignId;
  if(!campaignId)return;
  try{
   const data=await rpc('kinto_deals_v1_vendor_drafts_g4',{p_campaign_id:campaignId,p_limit:1});
   if(data?.items?.length===1){await restoreDraft(data.items[0]);setMsg('أُنشئت نسخة تعديل مستقلة. راجع سبب الرفض وعدّل الحقول والتواريخ، ثم احفظها وأرسلها للإدارة من قائمة المسودات.')}
   else setMsg('أُنشئت نسخة جديدة. اضغط تحديث المسودات لاستعادتها.');
  }catch(err){setMsg('أُنشئت نسخة جديدة؛ تعذرت استعادتها تلقائياً: '+err.message,true)}
 });
 // Initial draft read waits for the vendor runtime; product/gift searches remain independent.
 const loadWhenReady=()=>{
  if(window.MeshwarVendorRuntime?.sb){listDrafts();return}
  const status=$('kdDraftLoadStatus');status.textContent='بانتظار اكتمال اتصال لوحة التاجر...';
  if(document.readyState==='complete'){status.textContent='اتصال الحملات غير جاهز. اضغط تحديث القائمة بعد اكتمال اللوحة.'}
  else window.addEventListener('load',()=>{if(window.MeshwarVendorRuntime?.sb)listDrafts();else status.textContent='اتصال الحملات غير جاهز. اضغط تحديث القائمة.'},{once:true});
 };
 loadWhenReady();
 // Limit explanations are explicit tap targets; native title tooltips do not work on mobile.
 document.querySelectorAll('.kd-limit-help').forEach(button=>{
  const tip=$(button.getAttribute('aria-controls'));if(!tip)return;
  button.addEventListener('click',event=>{
   event.preventDefault();event.stopPropagation();
   const opening=tip.hidden;
   document.querySelectorAll('.kd-limit-help').forEach(other=>{other.setAttribute('aria-expanded','false');const otherTip=$(other.getAttribute('aria-controls'));if(otherTip)otherTip.hidden=true});
   tip.hidden=!opening;button.setAttribute('aria-expanded',String(opening));
  });
 });
 document.addEventListener('click',event=>{if(event.target.closest('.kd-limit-help,.kd-limit-tip'))return;document.querySelectorAll('.kd-limit-help').forEach(button=>{button.setAttribute('aria-expanded','false');const tip=$(button.getAttribute('aria-controls'));if(tip)tip.hidden=true})});
 // Help is portaled to document.body: no transformed/overflowing vendor panel can clip it.
 let openHelp=null;
 const closeHelp=()=>{if(!openHelp)return;openHelp.tip.classList.remove('kd-tip-visible');openHelp=null};
 document.querySelectorAll('.kd-kind-help').forEach(help=>{
  const tip=help.querySelector('.kd-kind-tip');if(!tip)return;
  document.body.appendChild(tip);
  const show=()=>{
   closeHelp();tip.classList.add('kd-tip-visible');
   const r=help.getBoundingClientRect(),w=tip.getBoundingClientRect().width,ht=tip.getBoundingClientRect().height;
   const vv=window.visualViewport,top=vv?vv.offsetTop:0,bottom=top+(vv?vv.height:window.innerHeight);
   const x=Math.max(12,Math.min(window.innerWidth-w-12,r.right-w));
   const y=r.bottom+8+ht<=bottom-8?r.bottom+8:Math.max(top+8,r.top-ht-8);
   tip.style.left=x+'px';tip.style.top=y+'px';openHelp={help,tip};
  };
  help.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'||e.pointerType==='pen')show()});
  help.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'||e.pointerType==='pen')closeHelp()});
  help.addEventListener('focus',show);
  help.addEventListener('blur',closeHelp);
  help.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();if(openHelp?.help===help)closeHelp();else show()});
 });
 document.addEventListener('pointerdown',e=>{if(openHelp&&!openHelp.help.contains(e.target))closeHelp()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeHelp()});
 window.addEventListener('scroll',closeHelp,true);
 window.addEventListener('resize',closeHelp);
 $('kdGift').addEventListener('change',e=>{state.gift=e.target.value||null;renderSelected()});
 document.querySelectorAll('input[name="kdKindChoice"]').forEach(radio=>radio.addEventListener('change',()=>{if(radio.checked){$('kdKind').value=radio.value;syncKind()}}));
 $('kdDraftForm').addEventListener('submit',e=>{e.preventDefault();save()});
 $('kdAdUpload')?.addEventListener('click',uploadAdImage);
 $('kdAdImage')?.addEventListener('change',()=>{clearAdPreview();const file=$('kdAdImage').files?.[0];if(file){adPreviewUrl=URL.createObjectURL(file);$('kdAdPreview').src=adPreviewUrl;$('kdAdPreview').hidden=false;$('kdAdStatus').textContent='معاينة محلية فقط؛ اضغط رفع الصورة بعد حفظ المسودة.'}});
 syncKind();
});
})();