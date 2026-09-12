/* KINTO V138 — isolated admin product-review moderation UI. */
(() => {
  'use strict';
  const state = { status: 'pending', page: 1, size: 20, total: 0, items: [], busy: false };
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
      message.textContent = ''; render();
    } catch (error) { message.textContent = error?.message || 'تعذر تحميل التقييمات.'; }
  }

  function render() {
    const grid = document.getElementById('adminReviewGrid');
    document.getElementById('adminReviewCount').textContent = `${state.total} تقييم`;
    grid.innerHTML = state.items.map(item => `<article class="admin-review-card" data-id="${escReview(item.id)}">
      <div class="admin-review-head">${item.product_image ? `<img src="${escReview(item.product_image)}" alt="">` : ''}<div><b>${escReview(item.product_name)}</b><small>${escReview(item.customer_name)} · ${new Date(item.created_at).toLocaleDateString('ar')}</small></div><strong>${'★'.repeat(Number(item.rating)||0)}</strong></div>
      <p>${escReview(item.comment || 'لا يوجد تعليق')}</p><textarea class="admin-review-note" maxlength="1000" placeholder="ملاحظة الإدارة (اختيارية)">${escReview(item.moderation_note || '')}</textarea>
      <div class="admin-review-actions"><button class="btn-green" data-decision="published">موافقة ونشر</button><button class="btn-red" data-decision="rejected">رفض</button><button class="btn-dark" data-decision="hidden">إخفاء</button></div>
    </article>`).join('') || '<div class="mini">لا توجد تقييمات في هذا القسم.</div>';
    const pages=Math.max(1,Math.ceil(state.total/state.size)),pager=document.getElementById('adminReviewPager');
    pager.innerHTML=pages>1?`<button data-review-page="${state.page-1}" ${state.page===1?'disabled':''}>السابق</button><span>صفحة ${state.page} من ${pages}</span><button data-review-page="${state.page+1}" ${state.page===pages?'disabled':''}>التالي</button>`:'';
  }

  async function handleAction(event) {
    const button=event.target.closest('[data-decision]'); if(!button||state.busy)return;
    const card=button.closest('[data-id]'),note=card.querySelector('.admin-review-note').value.trim();
    state.busy=true; button.disabled=true;
    try { const sb=await ensureCustomerSupabase(),{error}=await sb.rpc('admin_moderate_product_review_v138',{p_admin_id:getAdminId(),p_review_id:card.dataset.id,p_decision:button.dataset.decision,p_note:note||null}); if(error)throw error; await load(); }
    catch(error){alert(error?.message||'تعذر اعتماد التقييم.')} finally {state.busy=false;button.disabled=false;}
  }

  window.KintoAdminProductReviewsV138={open,load};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
