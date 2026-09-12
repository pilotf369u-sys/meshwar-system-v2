/* KINTO V138 — isolated admin product-review moderation UI. */
(() => {
  'use strict';
  const state = { status: 'pending', page: 1, size: 6, total: 0, items: [], busy: false };
  const escReview = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));

  function install() {
    if (document.getElementById('adminProductReviews')) return;
    const sidebar = document.querySelector('.admin-master-sidebar');
    const logout = sidebar?.querySelector('.logout-link');
    const link = document.createElement('a');
    link.href = '#'; link.dataset.adminSection = 'adminProductReviews';
    link.innerHTML = '⭐ مراجعة تقييمات المنتجات';
    link.addEventListener('click', event => { event.preventDefault(); open(); });
    sidebar?.insertBefore(link, logout || null);

    const section = document.createElement('div');
    section.className = 'card admin-review-panel'; section.id = 'adminProductReviews';
    section.innerHTML = `<h3>⭐ مراجعة تقييمات المنتجات</h3>
      <div class="admin-review-toolbar">
        <select id="adminReviewStatus"><option value="pending">قيد المراجعة</option><option value="published">منشورة</option><option value="rejected">مرفوضة</option><option value="hidden">مخفية</option><option value="all">الكل</option></select>
        <button id="adminReviewRefresh" class="btn-blue" type="button">تحديث</button>
        <span id="adminReviewCount" class="mini"></span>
      </div><div id="adminReviewMessage" class="mini"></div><div id="adminReviewGrid" class="admin-review-grid"></div>
      <div id="adminReviewPager" class="pagination-bar"></div>`;
    document.querySelector('.main-content')?.appendChild(section);
    const lightbox=document.createElement('div');lightbox.id='adminReviewLightbox';lightbox.className='modal-overlay';lightbox.innerHTML='<div class="modal-content" style="max-width:900px"><button type="button" data-close-review-lightbox class="btn-dark">إغلاق ×</button><img alt="صورة التقييم بالحجم الكامل" style="display:block;max-width:100%;max-height:75vh;margin:12px auto;border-radius:12px"></div>';document.body.appendChild(lightbox);lightbox.addEventListener('click',e=>{if(e.target===lightbox||e.target.closest('[data-close-review-lightbox]'))lightbox.style.display='none'});
    document.getElementById('adminReviewStatus').addEventListener('change', event => { state.status = event.target.value; state.page = 1; load(); });
    document.getElementById('adminReviewRefresh').addEventListener('click', load);
    document.getElementById('adminReviewGrid').addEventListener('click', handleAction);
    document.getElementById('adminReviewPager').addEventListener('click', event => { const b=event.target.closest('[data-review-page]'); if(!b)return; state.page=Number(b.dataset.reviewPage)||1; load(); });
  }

  async function open() {
    if (typeof showSection === 'function') showSection('adminProductReviews');
    document.querySelectorAll('.admin-master-sidebar a[data-admin-section]').forEach(a => a.classList.toggle('active', a.dataset.adminSection === 'adminProductReviews'));
    await load();
  }

  async function load() {
    const message = document.getElementById('adminReviewMessage');
    message.textContent = 'جاري تحميل التقييمات...';
    try {
      await checkAdminRole();
      const sb = await ensureCustomerSupabase();
      const { data, error } = await sb.rpc('admin_list_product_reviews_v138', { p_admin_id: getAdminId(), p_status: state.status, p_page: state.page, p_page_size: state.size });
      if (error) throw error;
      state.items = Array.isArray(data?.items) ? data.items : []; state.total = Number(data?.total || 0);
      message.textContent = ''; render(); await loadReviewImages();
    } catch (error) { message.textContent = error?.message || 'تعذر تحميل التقييمات.'; }
  }

  function render() {
    const grid = document.getElementById('adminReviewGrid');
    document.getElementById('adminReviewCount').textContent = `${state.total} تقييم`;
    grid.innerHTML = state.items.map(item => `<article class="admin-review-card" data-id="${escReview(item.id)}">
      <div class="admin-review-head">${item.product_image ? `<img src="${escReview(item.product_image)}" alt="">` : ''}<div><b>${escReview(item.product_name)}</b><small>المتجر: ${escReview(item.store_name||'غير محدد')}</small><small>${escReview(item.customer_name)} · ${new Date(item.created_at).toLocaleDateString('ar')}</small></div><strong>${'★'.repeat(Number(item.rating)||0)}</strong></div>
      <p>${escReview(item.comment || 'لا يوجد تعليق')}</p><div class="admin-review-images">${(item.images||[]).map(image=>`<span data-review-image="${escReview(image.id)}">جاري تحميل الصورة…</span>`).join('')}</div><select class="admin-review-reason"><option value="">اختر سبب الرفض الجاهز</option><option>المحتوى لا يتعلق بتجربة استخدام المنتج.</option><option>المحتوى يتضمن ألفاظاً أو مادة غير ملائمة للنشر.</option><option>المحتوى يتضمن بيانات شخصية أو مادة دعائية.</option><option>المحتوى مكرر أو مصنف كمحتوى مشبوه.</option><option>المحتوى لا يستوفي إرشادات تقييمات KINTO.</option></select><textarea class="admin-review-note" maxlength="1000" placeholder="ملاحظة إضافية (اختيارية)">${escReview(item.moderation_note || '')}</textarea>
      <div class="admin-review-actions"><button class="btn-green" data-decision="published">موافقة ونشر</button><button class="btn-red" data-decision="rejected">رفض</button><button class="btn-dark" data-decision="hidden">إخفاء</button></div>
    </article>`).join('') || '<div class="mini">لا توجد تقييمات في هذا القسم.</div>';
    const pages=Math.max(1,Math.ceil(state.total/state.size)),pager=document.getElementById('adminReviewPager');
    pager.innerHTML=`<button data-review-page="${state.page-1}" ${state.page===1?'disabled':''}>السابق</button><span>صفحة ${state.page} من ${pages} · ${state.total} تقييم</span><button data-review-page="${state.page+1}" ${state.page===pages?'disabled':''}>التالي</button>`;
  }

  async function loadReviewImages() {
    const targets=[...document.querySelectorAll('[data-review-image]')];
    if(!targets.length)return;
    const sb=await ensureCustomerSupabase(),adminId=getAdminId();
    await Promise.all(targets.map(async target=>{
      const {data,error}=await sb.rpc('admin_get_review_image_v139',{p_admin_id:adminId,p_image_id:target.dataset.reviewImage});
      if(error||(!data?.base64&&!data?.storage_path)){target.textContent='تعذر تحميل الصورة';return;}
      const src=data.base64?`data:${data.mime_type};base64,${data.base64}`:sb.storage.from(data.bucket||'product-review-images').getPublicUrl(data.storage_path).data?.publicUrl;
      if(!src){target.textContent='تعذر تحميل الصورة';return;}
      target.innerHTML=`<img src="${escReview(src)}" data-admin-review-preview alt="صورة التقييم — اضغط للتكبير" loading="lazy"><button type="button" class="btn-red" data-delete-review-image="${escReview(target.dataset.reviewImage)}">حذف الصورة فقط</button>`;
    }));
  }

  async function handleAction(event) {
    const preview=event.target.closest('[data-admin-review-preview]');if(preview){const box=document.getElementById('adminReviewLightbox');box.querySelector('img').src=preview.src;box.style.display='flex';return;}
    const imageDelete=event.target.closest('[data-delete-review-image]');if(imageDelete){if(state.busy||!confirm('حذف الصورة فقط مع الإبقاء على التعليق؟'))return;state.busy=true;imageDelete.disabled=true;try{const sb=await ensureCustomerSupabase(),{data,error}=await sb.rpc('admin_delete_product_review_image_v152',{p_admin_id:getAdminId(),p_image_id:imageDelete.dataset.deleteReviewImage});if(error)throw error;if(data?.storage_path){const removed=await sb.storage.from(data.bucket||'product-review-images').remove([data.storage_path]);if(removed.error)console.warn('Deferred review image cleanup',removed.error)}await load()}catch(error){alert(error?.message||'تعذر حذف الصورة.')}finally{state.busy=false;imageDelete.disabled=false}return;}
    const button=event.target.closest('[data-decision]'); if(!button||state.busy)return;
    const card=button.closest('[data-id]'),typed=card.querySelector('.admin-review-note').value.trim(),reason=card.querySelector('.admin-review-reason')?.value.trim()||'',note=button.dataset.decision==='rejected'?(typed||reason):typed;
    state.busy=true; button.disabled=true;
    try { const sb=await ensureCustomerSupabase(),{data,error}=await sb.rpc('admin_moderate_product_review_v138',{p_admin_id:getAdminId(),p_review_id:card.dataset.id,p_decision:button.dataset.decision,p_note:note||null}); if(error)throw error;if(button.dataset.decision==='rejected'&&Array.isArray(data?.deleted_storage_paths)&&data.deleted_storage_paths.length){const removed=await sb.storage.from(data.bucket||'product-review-images').remove(data.deleted_storage_paths);if(removed.error)console.warn('Deferred rejected review image cleanup',removed.error)} await load(); }
    catch(error){alert(error?.message||'تعذر اعتماد التقييم.')} finally {state.busy=false;button.disabled=false;}
  }

  window.KintoAdminProductReviewsV138={open,load};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
