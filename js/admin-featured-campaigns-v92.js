/* KINTO V92 — CMS campaign identity + type-aware fields. Campaign scope only. */
(()=>{'use strict';
const $=id=>document.getElementById(id), UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function status(t,type=''){const e=$('featuredCampaignStatus');if(e){e.textContent=t;e.className='featured-status'+(type?' '+type:'')}}
function ids(v){const a=String(v||'').trim().split(/[\s,]+/).filter(Boolean);for(const x of a)if(!UUID.test(x))throw new Error('أحد item_ids ليس UUID صالحاً: '+x);return a}
function iso(id){const v=String($(id)?.value||'').trim();if(!v)return null;const d=new Date(v);if(Number.isNaN(d.getTime()))throw new Error('التاريخ غير صالح.');return d.toISOString()}
function field(id){return $(id)?.closest('.featured-field')||null}
function syncType(){const type=$('featuredSlotType')?.value||'hero_banner',banner=field('featuredBannerUrl'),items=field('featuredItemIds'),logo=field('featuredStoreLogo');
  if(banner)banner.style.display=type==='sponsored_product'?'none':'';
  if(items)items.style.display=type==='hero_banner'?'none':'';
  if(logo)logo.style.display='';
  const b=$('featuredBannerUrl'),i=$('featuredItemIds');
  if(b)b.placeholder=type==='hero_banner'?'رابط صورة/فيديو Hero':type==='featured_grid'?'صورة/فيديو بطاقة الشبكة':'غير مستخدم لهذا النوع';
  if(i)i.placeholder=type==='sponsored_product'?'مطلوب: UUID منتج واحد على الأقل':'اختياري: uuid, uuid, ...';
  let hint=$('featuredTypeHint');if(!hint&&$('featuredSlotType')){hint=document.createElement('div');hint.id='featuredTypeHint';hint.className='featured-small';$('featuredSlotType').closest('.featured-field')?.appendChild(hint)}
  if(hint)hint.textContent=type==='hero_banner'?'Hero Banner: يظهر في البنر الرئيسي للحملات؛ item_ids غير مستخدمة.':type==='featured_grid'?'Featured Grid: يظهر ضمن شبكة المتاجر المميزة؛ يمكن ربط item_ids للصور المصغرة.':'Sponsored Product: يظهر في قسم الرعاية السفلي ويتطلب item_id واحداً على الأقل.';
}
async function save(e){e?.preventDefault();e?.stopImmediatePropagation();const btn=$('featuredSaveBtn');try{btn.disabled=true;status('جاري حفظ الحملة...');await verifyAdmin();const storeId=String($('featuredMerchant')?.value||'').trim(),name=String($('featuredStoreName')?.value||'').trim(),type=$('featuredSlotType')?.value||'hero_banner',start=iso('featuredStartDate'),end=iso('featuredEndDate'),itemIds=ids($('featuredItemIds')?.value||'');if(!UUID.test(storeId))throw new Error('اختر متجراً صالحاً؛ يجب أن يكون store_id UUID من local_stores.');if(!name)throw new Error('اسم المتجر مطلوب.');if(!start||!end)throw new Error('تاريخ البداية والنهاية مطلوبان.');if(new Date(end)<=new Date(start))throw new Error('تاريخ النهاية يجب أن يكون بعد البداية.');if(type==='sponsored_product'&&!itemIds.length)throw new Error('Sponsored Product يتطلب item_id واحداً على الأقل.');const sb=await getSb(),payload={p_admin_id:adminId(),p_id:$('featuredEditId')?.value||null,p_store_id:storeId,p_slot_type:type,p_banner_url:type==='sponsored_product'?'':String($('featuredBannerUrl')?.value||'').trim(),p_store_logo:String($('featuredStoreLogo')?.value||'').trim(),p_store_name:name,p_item_ids:type==='hero_banner'?[]:itemIds,p_start_date:start,p_end_date:end,p_is_active:!!$('featuredIsActive')?.checked};const {error}=await sb.rpc('admin_upsert_merchant_featured_slot_v2',payload);if(error)throw error;if(typeof window.MeshwarAdminFeaturedCampaignsV1?.initData==='function')await window.MeshwarAdminFeaturedCampaignsV1.initData();status('تم حفظ الحملة وربطها بالمتجر الصحيح بنجاح.','ok')}catch(err){console.error('V92 campaign save failed',err);status('تعذر حفظ الحملة: '+String(err?.message||err),'err')}finally{btn.disabled=false}}
function wire(){const old=$('featuredSaveBtn');if(!old)return false;if(old.dataset.v92==='1')return true;const fresh=old.cloneNode(true);fresh.dataset.v92='1';old.replaceWith(fresh);fresh.addEventListener('click',save,{capture:true});$('featuredSlotType')?.addEventListener('change',syncType);syncType();return true}
function boot(){let n=0;const t=setInterval(()=>{if(wire()||++n>80)clearInterval(t)},100)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
