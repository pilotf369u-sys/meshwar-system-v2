/* MeshWar Admin Featured Campaigns — Phase 1. Admin CMS only; no INDEX integration. */
(()=>{
'use strict';
const $=id=>document.getElementById(id);
let featuredRows=[];

function setFeaturedStatus(text,type=''){
  const e=$('featuredCampaignStatus');if(!e)return;
  e.textContent=text;e.className='featured-status'+(type?' '+type:'');
}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function localInputValue(iso){if(!iso)return'';const d=new Date(iso);if(Number.isNaN(d.getTime()))return'';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}
function isoValue(id){const v=String($(id)?.value||'').trim();if(!v)return null;const d=new Date(v);if(Number.isNaN(d.getTime()))throw new Error('التاريخ غير صالح.');return d.toISOString()}
function uuidList(v){const raw=String(v||'').trim();if(!raw)return[];const xs=raw.split(/[\s,]+/).map(x=>x.trim()).filter(Boolean);const re=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;for(const x of xs)if(!re.test(x))throw new Error('أحد item_ids ليس UUID صالحاً: '+x);return xs}
function campaignState(r){const now=Date.now(),start=new Date(r.start_date).getTime(),end=new Date(r.end_date).getTime();if(!r.is_active)return['متوقفة','off'];if(now<start)return['مجدولة','scheduled'];if(now>end)return['منتهية','ended'];return['نشطة','live']}
function slotLabel(v){return ({hero_banner:'Hero',featured_grid:'Grid',sponsored_product:'Product'})[v]||v}

function mount(){
  if($('featuredCampaignsPanel'))return;
  const grid=document.querySelector('.cms-grid');if(!grid)return;
  const s=document.createElement('section');s.className='cms-panel full';s.id='featuredCampaignsPanel';
  s.innerHTML=`<h2>🏆 إدارة الحملات والمتاجر المميزة</h2><div class="hint">Phase 1 — إدارة الاشتراكات فقط. لا يوجد أي ربط مع INDEX في هذه المرحلة.</div>
  <div id="featuredCampaignStatus" class="featured-status">جاري التحقق من جاهزية قاعدة البيانات...</div>
  <div class="featured-admin-grid">
    <div class="featured-form-card"><h3 style="margin-top:0;color:#fde7a4">إضافة / تعديل حملة</h3>
      <input id="featuredEditId" type="hidden">
      <div class="featured-form-grid">
        <div class="featured-field full"><label>المتجر / حساب التاجر</label><select id="featuredMerchant"><option value="">اختر حساب التاجر</option></select></div>
        <div class="featured-field"><label>اسم المتجر</label><input id="featuredStoreName" maxlength="150" placeholder="اسم المتجر"></div>
        <div class="featured-field"><label>نوع الحملة</label><select id="featuredSlotType"><option value="hero_banner">Hero Banner</option><option value="featured_grid">Featured Grid</option><option value="sponsored_product">Sponsored Product</option></select></div>
        <div class="featured-field full"><label>رابط شعار المتجر</label><input id="featuredStoreLogo" dir="ltr" placeholder="https://... أو images/..."></div>
        <div class="featured-field full"><label>رابط البانر — اختياري</label><input id="featuredBannerUrl" dir="ltr" placeholder="https://... أو images/..."></div>
        <div class="featured-field full"><label>معرّفات المنتجات item_ids — UUID مفصولة بفواصل</label><input id="featuredItemIds" dir="ltr" placeholder="uuid, uuid, ..."></div>
        <div class="featured-field"><label>تاريخ البداية</label><input id="featuredStartDate" type="datetime-local"></div>
        <div class="featured-field"><label>تاريخ النهاية</label><input id="featuredEndDate" type="datetime-local"></div>
        <div class="featured-field full"><label class="toggle"><input id="featuredIsActive" type="checkbox" checked><span>الحملة مفعلة</span></label></div>
      </div>
      <div class="featured-actions"><button id="featuredSaveBtn" class="featured-btn primary" type="button">💾 حفظ الحملة</button><button id="featuredCancelBtn" class="featured-btn secondary" type="button" style="display:none">إلغاء التعديل</button></div>
      <div class="featured-small" style="margin-top:10px">الكتابة تتم عبر RPC محمية تتحقق من صلاحية الأدمن. الواجهة الرئيسية غير مرتبطة بهذه البيانات في Phase 1.</div>
    </div>
    <div class="featured-list-card"><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><h3 style="margin:0;color:#fde7a4">الحملات الحالية</h3><button id="featuredReloadBtn" class="featured-btn secondary" type="button">↻ تحديث</button></div>
      <div class="featured-table-wrap" style="margin-top:12px"><table class="featured-table"><thead><tr><th>المتجر</th><th>النوع</th><th>الفترة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody id="featuredCampaignBody"><tr><td colspan="5" class="featured-empty">جاري التحميل...</td></tr></tbody></table></div>
    </div>
  </div>`;
  grid.appendChild(s);
  $('featuredSaveBtn').addEventListener('click',saveCampaign);
  $('featuredCancelBtn').addEventListener('click',resetForm);
  $('featuredReloadBtn').addEventListener('click',loadCampaigns);
}

async function loadMerchants(){
  const sb=await getSb();await verifyAdmin();
  const {data,error}=await sb.rpc('list_featured_merchants',{p_admin_id:adminId()});if(error)throw error;
  const sel=$('featuredMerchant');sel.innerHTML='<option value="">اختر حساب التاجر</option>'+(data||[]).map(x=>`<option value="${esc(x.id)}">${esc(x.email||x.id)} — ${esc(x.id)}</option>`).join('');
}
async function loadCampaigns(){
  try{
    setFeaturedStatus('جاري تحميل الحملات...');
    const sb=await getSb();await verifyAdmin();
    const {data,error}=await sb.rpc('admin_list_merchant_featured_slots',{p_admin_id:adminId()});if(error)throw error;
    featuredRows=Array.isArray(data)?data:[];renderRows();setFeaturedStatus(`تم تحميل ${featuredRows.length} حملة.`,'ok');
  }catch(e){console.error('featured campaigns load',e);setFeaturedStatus(/PGRST|schema|function|merchant_featured_slots/i.test(String(e?.message||e))?'Migration Phase 1 غير مطبقة بعد على Supabase. طبّق ملف 20260827_merchant_featured_slots_phase1.sql ثم أعد التحميل.':(e.message||String(e)),'err')}
}
function renderRows(){
  const body=$('featuredCampaignBody');if(!body)return;
  if(!featuredRows.length){body.innerHTML='<tr><td colspan="5" class="featured-empty">لا توجد حملات بعد.</td></tr>';return}
  body.innerHTML=featuredRows.map(r=>{const [state,cls]=campaignState(r);return `<tr><td><b>${esc(r.store_name)}</b><div class="featured-small">${esc(r.merchant_id)}</div></td><td>${esc(slotLabel(r.slot_type))}</td><td><div>${esc(new Date(r.start_date).toLocaleString('ar'))}</div><div class="featured-small">إلى ${esc(new Date(r.end_date).toLocaleString('ar'))}</div></td><td><span class="featured-badge ${cls}">${state}</span></td><td><div class="featured-actions" style="justify-content:center;margin:0"><button class="featured-btn secondary" data-edit="${esc(r.id)}">تعديل</button><button class="featured-btn ${r.is_active?'danger':'success'}" data-toggle="${esc(r.id)}" data-next="${r.is_active?'0':'1'}">${r.is_active?'إيقاف':'تفعيل'}</button></div></td></tr>`}).join('');
  body.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>editCampaign(b.dataset.edit)));
  body.querySelectorAll('[data-toggle]').forEach(b=>b.addEventListener('click',()=>toggleCampaign(b.dataset.toggle,b.dataset.next==='1')));
}
function resetForm(){
  $('featuredEditId').value='';$('featuredMerchant').value='';$('featuredStoreName').value='';$('featuredSlotType').value='hero_banner';$('featuredStoreLogo').value='';$('featuredBannerUrl').value='';$('featuredItemIds').value='';$('featuredStartDate').value='';$('featuredEndDate').value='';$('featuredIsActive').checked=true;$('featuredCancelBtn').style.display='none';$('featuredSaveBtn').textContent='💾 حفظ الحملة';
}
function editCampaign(id){const r=featuredRows.find(x=>x.id===id);if(!r)return;$('featuredEditId').value=r.id;$('featuredMerchant').value=r.merchant_id;$('featuredStoreName').value=r.store_name||'';$('featuredSlotType').value=r.slot_type||'hero_banner';$('featuredStoreLogo').value=r.store_logo||'';$('featuredBannerUrl').value=r.banner_url||'';$('featuredItemIds').value=(r.item_ids||[]).join(', ');$('featuredStartDate').value=localInputValue(r.start_date);$('featuredEndDate').value=localInputValue(r.end_date);$('featuredIsActive').checked=!!r.is_active;$('featuredCancelBtn').style.display='inline-block';$('featuredSaveBtn').textContent='💾 تحديث الحملة';$('featuredCampaignsPanel').scrollIntoView({behavior:'smooth',block:'start'})}
async function saveCampaign(){
  const btn=$('featuredSaveBtn');try{
    btn.disabled=true;setFeaturedStatus('جاري حفظ الحملة...');await verifyAdmin();
    const merchant=$('featuredMerchant').value,storeName=$('featuredStoreName').value.trim(),start=isoValue('featuredStartDate'),end=isoValue('featuredEndDate');
    if(!merchant)throw new Error('اختر حساب التاجر.');if(!storeName)throw new Error('اسم المتجر مطلوب.');if(!start||!end)throw new Error('تاريخ البداية والنهاية مطلوبان.');if(new Date(end)<=new Date(start))throw new Error('تاريخ النهاية يجب أن يكون بعد البداية.');
    const sb=await getSb(),payload={p_admin_id:adminId(),p_id:$('featuredEditId').value||null,p_merchant_id:merchant,p_slot_type:$('featuredSlotType').value,p_banner_url:$('featuredBannerUrl').value.trim(),p_store_logo:$('featuredStoreLogo').value.trim(),p_store_name:storeName,p_item_ids:uuidList($('featuredItemIds').value),p_start_date:start,p_end_date:end,p_is_active:$('featuredIsActive').checked};
    const {error}=await sb.rpc('admin_upsert_merchant_featured_slot',payload);if(error)throw error;resetForm();await loadCampaigns();setFeaturedStatus('تم حفظ الحملة بنجاح.','ok');
  }catch(e){console.error('featured campaign save',e);setFeaturedStatus(e.message||String(e),'err')}finally{btn.disabled=false}
}
async function toggleCampaign(id,next){try{setFeaturedStatus(next?'جاري تفعيل الحملة...':'جاري إيقاف الحملة...');await verifyAdmin();const sb=await getSb(),{error}=await sb.rpc('admin_toggle_merchant_featured_slot',{p_admin_id:adminId(),p_id:id,p_is_active:next});if(error)throw error;await loadCampaigns();setFeaturedStatus(next?'تم تفعيل الحملة.':'تم إيقاف الحملة.','ok')}catch(e){console.error(e);setFeaturedStatus(e.message||String(e),'err')}}

async function init(){mount();try{await loadMerchants();await loadCampaigns()}catch(e){console.error('featured campaigns init',e);setFeaturedStatus(/PGRST|schema|function/i.test(String(e?.message||e))?'Migration Phase 1 غير مطبقة بعد على Supabase. طبّق ملف migration ثم أعد التحميل.':(e.message||String(e)),'err')}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
