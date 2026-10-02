/* G4C isolated merchant draft composer: RPC only, never submits or publishes. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
const token=()=>{try{return JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null')?.token||''}catch{return''}};
const state={selected:new Map(),gift:null,campaignId:null,updatedAt:null,busy:false};
const rpc=async(name,args)=>{const sb=window.MeshwarVendorRuntime?.sb;if(!sb||!token())throw Error('جلسة التاجر غير متاحة. سجّل الدخول مجدداً.');const {data,error}=await sb.rpc(name,{p_session_token:token(),...args});if(error)throw error;return data};
const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt!==undefined)e.textContent=txt;if(cls)e.className=cls;return e};
const setMsg=(message,bad=false)=>{const e=$('kdDraftMessage');if(e){e.textContent=message;e.className='text-sm mt-3 '+(bad?'text-rose-300':'text-amber-200')}};
const renderSelected=()=>{
 const box=$('kdSelected');box.replaceChildren();
 for(const p of state.selected.values()){const row=el('div',p.product_name,'rounded-lg bg-white/5 p-2 text-xs');const b=el('button','إزالة','mr-3 text-rose-300');b.type='button';b.addEventListener('click',()=>{state.selected.delete(p.id);renderSelected()});row.append(b);box.append(row)}
 $('kdSelectedCount').textContent=String(state.selected.size);
 const gift=$('kdGift');gift.replaceChildren();gift.append(el('option','بلا هدية'));gift.firstChild.value='';
 for(const p of state.selected.values()){ /* selected paid items are never gifts */ }
 for(const p of state.results||[]){if(state.selected.has(p.id))continue;const o=el('option',p.product_name+' — '+(p.barcode||'بلا باركود'));o.value=p.id;gift.append(o)}
 gift.value=state.gift&&!state.selected.has(state.gift)?state.gift:'';if(!gift.value)state.gift=null;
};
async function search(){
 const box=$('kdSearchResults');box.replaceChildren();setMsg('جاري البحث...');
 try{
  const data=await rpc('kinto_deals_v1_vendor_products_g4',{p_search:$('kdSearch').value.trim(),p_limit:50});
  state.results=data.items||[];
  for(const p of state.results){
   const row=el('div',undefined,'flex items-center gap-2 rounded-lg border border-white/10 p-2 text-xs');
   if(p.image_url){const img=el('img');img.src=p.image_url;img.alt='';img.loading='lazy';img.className='h-10 w-10 rounded-lg object-contain';row.append(img)}
   const info=el('span',p.product_name+' | '+(p.barcode||'—')+' | '+p.base_price+' '+(p.currency||''),'flex-1');row.append(info);
   const b=el('button',state.selected.has(p.id)?'محدد':'إضافة','rounded-lg border border-amber-400/40 px-3 py-2');b.type='button';
   b.addEventListener('click',()=>{if(state.selected.has(p.id))state.selected.delete(p.id);else if(state.selected.size<50){state.selected.set(p.id,p);if(state.gift===p.id)state.gift=null}else return setMsg('الحد الأقصى 50 منتجاً.',true);renderSelected();b.textContent=state.selected.has(p.id)?'محدد':'إضافة'});row.append(b);box.append(row);
  }
  renderSelected();setMsg('نتائج البحث من منتجات متجرك فقط. اختر المنتجات المدفوعة والهدية بشكل منفصل.');
 }catch(e){setMsg(e.message,true)}
}
const dateValue=id=>{const v=$(id).value;if(!v)throw Error('حدد بداية الحملة ونهايتها.');return new Date(v).toISOString()};
function syncKind(){
 const kind=$('kdKind').value,limited=kind==='limited_purchase';
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
   gift_product_id:limited?null:(state.gift||null),gift_selected_options:{},
   max_uses_per_customer:Number($('kdUses').value),
   max_units_per_customer:limited?Number($('kdUnits').value):null,
   max_total_redemptions:$('kdTotal').value?Number($('kdTotal').value):null,
   terms_snapshot:{},product_ids:[...state.selected.keys()]};
  const data=await rpc('kinto_deals_v1_vendor_save_draft_g4',{p_campaign_id:state.campaignId,p_expected_updated_at:state.updatedAt,p_draft:draft});
  state.campaignId=data.campaign_id;state.updatedAt=data.updated_at;
  setMsg('تم حفظ المسودة على الخادم. رقمها: '+data.campaign_id+' — لم تُرسل للإدارة ولم تُنشر.');
 }catch(e){setMsg('تعذر حفظ المسودة: '+e.message,true)}
 finally{state.busy=false;$('kdSave').disabled=false}
}
document.addEventListener('DOMContentLoaded',()=>{
 if(!$('kdDraftForm'))return;
 $('kdSearchButton').addEventListener('click',search);
 $('kdGift').addEventListener('change',e=>state.gift=e.target.value||null);
 $('kdKind').addEventListener('change',syncKind);
 $('kdDraftForm').addEventListener('submit',e=>{e.preventDefault();save()});
 syncKind();
});
})();