/* KINTO V135 — isolated customer reviews UI + secure image-upload client. */
(() => {
  'use strict';

  const VERSION = 'v135';
  const SESSION_KEY = 'kinto_customer_review_session_v132';
  const MAX_IMAGES = 1;
  const COMPRESSED_TARGET_BYTES = 25 * 1024;
  const COMPRESSED_MAX_BYTES = 50 * 1024;
  const COMPRESSED_MAX_DIMENSION = 320;
  const REVIEW_STORAGE_BUCKET = 'product-review-images';
  const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;
  const state = { token: '', items: [], selectedItem: null, files: [], rating: 0, page: 1, pageSize: 6, busy: false, lastReadyResult: null };

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[c]);

  function readSession() {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!parsed?.token || !parsed?.expiresAt || new Date(parsed.expiresAt) <= new Date()) return '';
      return String(parsed.token);
    } catch { return ''; }
  }

  function saveSession(payload) {
    state.token = String(payload?.session_token || '');
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      token: state.token,
      expiresAt: payload?.expires_at || new Date(Date.now() + 30 * 86400000).toISOString()
    }));
  }

  function clearSession() {
    state.token = '';
    sessionStorage.removeItem(SESSION_KEY);
  }

  async function client() {
    if (typeof ensureCustomerPortalSupabase !== 'function') throw new Error('خدمة الاتصال غير جاهزة.');
    return ensureCustomerPortalSupabase();
  }

  function injectUi() {
    const tabs = document.querySelector('.tabs-nav');
    const drafts = $('drafts');
    if (!tabs || !drafts || $('productReviews')) return false;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tab-btn review-tab-btn';
    button.dataset.tab = 'productReviews';
    button.innerHTML = '<i class="fa-solid fa-star review-tab-icon" aria-hidden="true"></i> تقييماتي <span id="reviewReadyBadge" class="review-ready-badge">0</span>';
    button.addEventListener('click', activateReviewsTab);
    tabs.insertBefore(button, tabs.lastElementChild);

    const section = document.createElement('section');
    section.id = 'productReviews';
    section.className = 'tab-panel';
    section.innerHTML = `
      <div class="panel-card reviews-panel-card">
        <div class="panel-head reviews-panel-head">
          <div>
            <p class="reviews-panel-kicker">KINTO VERIFIED REVIEWS</p>
            <h2>المنتجات الجاهزة للتقييم</h2>
            <p class="reviews-panel-subtitle">شارك تجربتك مع المنتجات التي استلمتها فعلياً. كل تقييم موثّق بالطلب.</p>
          </div>
          <span class="chip reviews-security-chip"><i class="fa-solid fa-shield-halved"></i> شراء موثّق</span>
        </div>
        <div id="reviewUnlock" class="review-unlock" hidden>
          <div class="review-unlock-copy">
            <h3>جاري تفعيل جلسة التقييم الآمنة</h3>
            <p>يتم التحقق من جلسة العميل تلقائياً دون طلب كلمة المرور مرة أخرى.</p>
          </div>
        </div>
        <div id="reviewPanelStatus" class="review-status-line" role="status" aria-live="polite"></div>
        <div id="reviewProductsGrid" class="review-grid"></div>
        <nav id="reviewPager" class="review-pager" aria-label="صفحات المنتجات الجاهزة للتقييم"></nav>
      </div>`;
    drafts.insertAdjacentElement('afterend', section);

    const modal = document.createElement('div');
    modal.id = 'productReviewModal';
    modal.className = 'review-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'productReviewModalTitle');
    modal.innerHTML = `
      <div class="review-dialog">
        <header class="review-dialog-head">
          <img id="reviewModalImage" class="review-dialog-thumb" alt="صورة المنتج">
          <div class="review-dialog-title"><h2 id="productReviewModalTitle">قيّم المنتج</h2><p id="reviewModalOrder"></p></div>
          <button id="reviewModalClose" class="review-close" type="button" aria-label="إغلاق">×</button>
        </header>
        <form id="productReviewForm" class="review-dialog-body">
          <span class="review-label">تقييمك</span>
          <div id="reviewStars" class="review-stars" role="radiogroup" aria-label="اختر التقييم من نجمة إلى خمس نجوم">
            ${[1,2,3,4,5].map(n => `<button class="review-star" type="button" data-rating="${n}" role="radio" aria-checked="false" aria-label="${n} من 5">★</button>`).join('')}
          </div>
          <label class="review-label" for="reviewComment">تعليقك <span style="font-weight:500;color:#f5c451">(مطلوب)</span></label>
          <textarea id="reviewComment" class="review-comment" minlength="1" maxlength="2000" required placeholder="اكتب تجربتك بوضوح لمساعدة العملاء الآخرين..."></textarea>
          <span id="reviewCommentCounter" class="review-counter">0 / 2000</span>
          <span class="review-label">صورة المنتج <span style="font-weight:500;color:#9fb1aa">(صورة واحدة)</span></span>
          <div class="review-media-actions">
            <input id="reviewCameraInput" type="file" accept="image/*" capture="environment" hidden>
            <input id="reviewFilesInput" type="file" accept="image/jpeg,image/png,image/webp" hidden>
            <button id="reviewCameraBtn" class="review-media-btn" type="button"><i class="fa-solid fa-camera"></i> التقاط بالكاميرا الخلفية</button>
            <button id="reviewFilesBtn" class="review-media-btn" type="button"><i class="fa-regular fa-images"></i> اختيار من الجهاز</button>
          </div>
          <p class="review-media-note">اختر الصورة بأي حجم مناسب؛ سيقوم النظام بضغطها وتحسينها تلقائياً قبل الحفظ.</p>
          <div id="reviewPreviews" class="review-previews"></div>
          <div id="reviewFormMessage" class="review-form-message" role="status" aria-live="polite"></div>
          <div class="review-dialog-actions">
            <button id="reviewCancelBtn" class="review-secondary-btn" type="button">إلغاء</button>
            <button id="reviewSubmitBtn" class="review-submit-btn" type="submit"><i class="fa-solid fa-paper-plane"></i> إرسال للمراجعة</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(modal);
    bindUi();
    return true;
  }

  async function activateReviewsTab(event) {
    event?.preventDefault();
    const source = event?.currentTarget;
    const button = source?.classList?.contains('review-tab-btn')
      ? source
      : document.querySelector('.review-tab-btn');
    if (typeof window.switchCustomerTab === 'function') {
      await window.switchCustomerTab('productReviews', button);
    } else {
      document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
      document.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
      $('productReviews')?.classList.add('active');
      button?.classList.add('active');
    }
    await openPanel();
  }

  function bindUi() {
    $('reviewModalClose')?.addEventListener('click', closeModal);
    $('reviewCancelBtn')?.addEventListener('click', closeModal);
    $('productReviewModal')?.addEventListener('click', event => { if (event.target === event.currentTarget) closeModal(); });
    $('reviewComment')?.addEventListener('input', event => { $('reviewCommentCounter').textContent = `${event.target.value.length} / 2000`; });
    $('reviewStars')?.addEventListener('click', event => {
      const star = event.target.closest('[data-rating]');
      if (star) setRating(Number(star.dataset.rating));
    });
    $('reviewCameraBtn')?.addEventListener('click', () => $('reviewCameraInput')?.click());
    $('reviewFilesBtn')?.addEventListener('click', () => $('reviewFilesInput')?.click());
    $('reviewCameraInput')?.addEventListener('change', event => addFiles(event.target.files));
    $('reviewFilesInput')?.addEventListener('change', event => addFiles(event.target.files));
    $('productReviewForm')?.addEventListener('submit', submitReview);
    $('reviewProductsGrid')?.addEventListener('click', event => {
      const button = event.target.closest('[data-review-index]');
      if (button) openModal(state.items[Number(button.dataset.reviewIndex)]);
    });
    $('reviewPager')?.addEventListener('click', event => {
      const button = event.target.closest('[data-review-page]');
      if (!button) return;
      state.page = Number(button.dataset.reviewPage) || 1;
      renderProducts();
      $('productReviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });
    const historyBody = $('historyOrdersTableBody');
    if (historyBody) new MutationObserver(decorateOrderReviewButtons).observe(historyBody, { childList: true, subtree: true });
  }

  function customerIdentity() {
    const customer = typeof currentCustomerCloud === 'object' ? currentCustomerCloud : null;
    return String(customer?.code || customer?.customer_code || customer?.phone || customer?.email || '').trim();
  }

  function rpcPayload(data) {
    if (data && typeof data === 'object') return data;
    if (typeof data !== 'string') return {};
    try {
      const parsed = JSON.parse(data);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch { return {}; }
  }

  function isReady(item) {
    return item?.ready_for_review === true || item?.ready_for_review === 'true';
  }

  async function openPanel() {
    state.token = readSession();
    if (!state.token) {
      $('reviewUnlock').hidden = true;
      $('reviewProductsGrid').innerHTML = '';
      message('reviewPanelStatus', 'جلسة التقييم غير متاحة حالياً. سجّل الدخول مجدداً مرة واحدة لتفعيلها تلقائياً.', 'error');
      return;
    }
    await loadReadyProducts();
  }

  async function loadReadyProducts() {
    if (!state.token) return;
    message('reviewPanelStatus', 'جاري تحميل المنتجات المسلّمة...');
    try {
      const sb = await client();
      const { data, error } = await sb.rpc('customer_review_ready_products_v132', { p_session_token: state.token });
      if (error) throw error;
      const payload = rpcPayload(data);
      state.items = Array.isArray(payload.items) ? payload.items : [];
      state.page = 1;
      const readyCount = state.items.filter(item => isReady(item) && !item.review_id).length;
      state.lastReadyResult = { ok: true, itemCount: state.items.length, readyCount, receivedAt: new Date().toISOString() };
      console.info('[KINTO Reviews] ready-products RPC completed', state.lastReadyResult);
      $('reviewUnlock').hidden = true;
      renderProducts();
      decorateOrderReviewButtons();
      updateBadge(readyCount);
      injectReviewNotification(readyCount);
      message('reviewPanelStatus', '');
    } catch (error) {
      state.items = [];
      state.lastReadyResult = {
        ok: false,
        code: String(error?.code || ''),
        message: String(error?.message || 'تعذر تحميل المنتجات.'),
        receivedAt: new Date().toISOString()
      };
      console.error('[KINTO Reviews] ready-products RPC failed', state.lastReadyResult);
      if (/REVIEW_SESSION_(INVALID|REQUIRED)/i.test(String(error?.message || ''))) {
        clearSession(); $('reviewUnlock').hidden = true;
      }
      message('reviewPanelStatus', error?.message || 'تعذر تحميل المنتجات.', 'error');
    }
  }

  function renderProducts() {
    const grid = $('reviewProductsGrid');
    const pager = $('reviewPager');
    if (!grid) return;
    if (!state.items.length) {
      grid.innerHTML = '<div class="review-empty"><i class="fa-regular fa-circle-check"></i>لا توجد منتجات بانتظار التقييم حالياً.</div>';
      if (pager) pager.innerHTML = '';
      return;
    }
    const pages = Math.max(1, Math.ceil(state.items.length / state.pageSize));
    state.page = Math.min(pages, Math.max(1, state.page));
    const start = (state.page - 1) * state.pageSize;
    grid.innerHTML = state.items.slice(start, start + state.pageSize).map((item, offset) => {
      const index = start + offset;
      const status = String(item.review_status || '');
      const ready = isReady(item) && !item.review_id;
      const image = String(item.product_image || '').trim();
      return `<article class="review-product-card">
        <div class="review-product-media">${image ? `<img src="${esc(image)}" alt="${esc(item.product_name || 'المنتج')}" loading="lazy">` : '<div class="review-product-placeholder"><i class="fa-solid fa-box-open"></i></div>'}</div>
        <h3>${esc(item.product_name || 'المنتج')}</h3>
        <div class="review-order-ref">طلب: ${esc(item.order_id || '—')}</div>
        <div class="review-card-footer">
          <span class="review-state-pill ${esc(status)}">${ready ? 'جاهز للتقييم' : statusLabel(status)}</span>
          ${ready ? `<button class="review-primary-btn" type="button" data-review-index="${index}">قيّم الآن</button>` : ''}
        </div>
      </article>`;
    }).join('');
    if (pager) pager.innerHTML = pages > 1 ? `
      <button type="button" data-review-page="${state.page - 1}" ${state.page === 1 ? 'disabled' : ''}>السابق</button>
      <span>صفحة ${state.page} من ${pages} · ${state.items.length} منتج</span>
      <button type="button" data-review-page="${state.page + 1}" ${state.page === pages ? 'disabled' : ''}>التالي</button>` : '';
  }

  function decorateOrderReviewButtons() {
    const body = $('historyOrdersTableBody');
    const orders = typeof currentCustomerOrdersGlobal !== 'undefined' ? currentCustomerOrdersGlobal : [];
    if (!body || !state.items.length || !Array.isArray(orders)) return;
    const readyByOrder = new Map();
    state.items.forEach(item => {
      if (!isReady(item) || item.review_id) return;
      const id = String(item.order_id || '');
      if (id) readyByOrder.set(id, (readyByOrder.get(id) || 0) + 1);
    });
    body.querySelectorAll('tr').forEach(row => {
      const existing = row.querySelector('.review-order-action');
      const order = orders.find(candidate => {
        const id = String(candidate?.id || '');
        const code = String(candidate?.order_code || '');
        return readyByOrder.has(id) && ((code && row.textContent.includes(code)) || (!code && row.textContent.includes(id)));
      });
      if (!order) { existing?.remove(); return; }
      const count = readyByOrder.get(String(order.id)) || 0;
      const label = count > 1 ? `تقييم المنتجات (${count})` : 'تقييم المنتج';
      if (existing) {
        if (existing.dataset.reviewCount !== String(count)) existing.innerHTML = `<i class="fa-solid fa-star"></i> ${label}`;
        existing.dataset.reviewCount = String(count);
        return;
      }
      const cell = row.lastElementChild;
      if (!cell) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'review-primary-btn review-order-action';
      button.dataset.reviewCount = String(count);
      button.innerHTML = `<i class="fa-solid fa-star"></i> ${label}`;
      button.addEventListener('click', activateReviewsTab);
      cell.appendChild(button);
    });
  }

  function statusLabel(status) {
    return ({ pending: 'قيد المراجعة', published: 'منشور', rejected: 'مرفوض', hidden: 'غير ظاهر' })[status] || 'تم التقييم';
  }

  function friendlyReviewError(error) {
    const raw = String(error?.message || error || '');
    const code = [
      'PRODUCT_NOT_FOUND', 'PRODUCT_NOT_FOUND_IN_DELIVERED_ORDER', 'DELIVERED_ORDER_NOT_FOUND', 'REVIEW_STORE_NOT_FOUND',
      'INVALID_REVIEW_RATING', 'REVIEW_COMMENT_REQUIRED', 'REVIEW_COMMENT_TOO_LONG',
      'REVIEW_IMAGE_LIMIT_REACHED', 'IMAGE_SIZE_NOT_ALLOWED', 'IMAGE_TYPE_NOT_ALLOWED',
      'REVIEW_UPLOAD_TICKET_INVALID', 'REVIEW_STORAGE_OBJECT_NOT_FOUND'
    ].find(value => raw.includes(value));
    return ({
      PRODUCT_NOT_FOUND: 'تعذر مطابقة المنتج مع الطلب المسلّم. حدّث الصفحة وحاول مجدداً.',
      PRODUCT_NOT_FOUND_IN_DELIVERED_ORDER: 'هذا المنتج غير موجود ضمن الطلب المسلّم.',
      DELIVERED_ORDER_NOT_FOUND: 'تعذر العثور على الطلب المسلّم.',
      REVIEW_STORE_NOT_FOUND: 'تعذر مطابقة متجر المنتج مع الطلب المسلّم.',
      INVALID_REVIEW_RATING: 'اختر تقييماً من نجمة إلى خمس نجوم.',
      REVIEW_COMMENT_REQUIRED: 'اكتب تعليقك عن المنتج قبل إرسال التقييم.',
      REVIEW_COMMENT_TOO_LONG: 'التعليق أطول من 2000 حرف.',
      REVIEW_IMAGE_LIMIT_REACHED: 'يسمح حالياً بصورة واحدة فقط لكل تقييم.',
      IMAGE_SIZE_NOT_ALLOWED: 'تعذر تجهيز الصورة بالحجم الآمن.',
      IMAGE_TYPE_NOT_ALLOWED: 'صيغة الصورة غير مدعومة.',
      REVIEW_UPLOAD_TICKET_INVALID: 'انتهت مهلة رفع الصورة. أعد اختيارها وحاول مجدداً.',
      REVIEW_STORAGE_OBJECT_NOT_FOUND: 'لم يكتمل حفظ الصورة. حاول مرة أخرى.'
    })[code] || 'تعذر إرسال التقييم حالياً. حاول مرة أخرى.';
  }

  function setRating(value) {
    state.rating = Math.min(5, Math.max(0, Number(value) || 0));
    document.querySelectorAll('.review-star').forEach(star => {
      const active = Number(star.dataset.rating) <= state.rating;
      star.classList.toggle('is-active', active);
      star.setAttribute('aria-checked', String(Number(star.dataset.rating) === state.rating));
    });
  }

  function openModal(item) {
    if (!item?.ready_for_review || item.review_id) return;
    state.selectedItem = item; state.files = []; setRating(0);
    $('productReviewModalTitle').textContent = item.product_name || 'قيّم المنتج';
    $('reviewModalOrder').textContent = `رقم الطلب: ${item.order_id || '—'}`;
    $('reviewModalImage').src = item.product_image || 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="64" height="64"%3E%3Crect width="100%25" height="100%25" fill="%230b3027"/%3E%3C/svg%3E';
    $('reviewComment').value = ''; $('reviewCommentCounter').textContent = '0 / 2000';
    $('reviewCameraInput').value = ''; $('reviewFilesInput').value = '';
    renderPreviews(); message('reviewFormMessage', '');
    $('productReviewModal').classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (state.busy) return;
    $('productReviewModal')?.classList.remove('is-open');
    document.body.style.overflow = '';
    state.selectedItem = null; state.files = [];
  }

  async function compressReviewImage(file) {
    let source;
    try {
      source = typeof createImageBitmap === 'function' ? await createImageBitmap(file) : await new Promise((resolve, reject) => {
        const image = new Image(), url = URL.createObjectURL(file);
        image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
        image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('تعذر قراءة الصورة المختارة.')); };
        image.src = url;
      });
      let width = Number(source.width || source.naturalWidth), height = Number(source.height || source.naturalHeight);
      const ratio = Math.min(1, COMPRESSED_MAX_DIMENSION / Math.max(width, height));
      width = Math.max(1, Math.round(width * ratio)); height = Math.max(1, Math.round(height * ratio));
      const canvas = document.createElement('canvas'), encode = (type, quality) => new Promise(resolve => canvas.toBlob(resolve, type, quality));
      let blob = null, quality = .82;
      for (let pass = 0; pass < 12; pass += 1) {
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d', { alpha: false }).drawImage(source, 0, 0, width, height);
        blob = await encode('image/webp', quality) || await encode('image/jpeg', quality);
        if (blob && blob.size <= COMPRESSED_TARGET_BYTES) break;
        if (quality > .44) quality -= .07;
        else if (Math.max(width, height) > 240) { width = Math.max(1, Math.round(width * .88)); height = Math.max(1, Math.round(height * .88)); }
      }
      if (!blob) throw new Error('تعذر ضغط الصورة.');
      if (blob.size > COMPRESSED_MAX_BYTES) throw new Error('تعذر تجهيز الصورة بالحجم الآمن. جرّب صورة أخرى.');
      return new File([blob], `${String(file.name || 'review').replace(/\.[^.]+$/, '')}.webp`, { type: blob.type || 'image/webp', lastModified: Date.now() });
    } finally { if (source && typeof source.close === 'function') source.close(); }
  }

  async function addFiles(fileList) {
    const incoming = Array.from(fileList || []);
    const file = incoming[0];
    if (!file) return;
    try {
      const type = String(file.type || '').toLowerCase();
      if (!ALLOWED_TYPES.has(type) || !ALLOWED_EXTENSIONS.test(file.name || '')) {
        return message('reviewFormMessage', 'نوع الصورة غير مدعوم. اختر JPEG أو PNG أو WebP.', 'error');
      }
      if (file.size <= 0) return message('reviewFormMessage', 'الصورة المختارة فارغة.', 'error');
      message('reviewFormMessage', 'جاري تجهيز الصورة وضغطها تلقائياً...');
      state.files = [await compressReviewImage(file)];
      renderPreviews();
      message('reviewFormMessage', `تم تجهيز الصورة (${Math.max(1, Math.round(state.files[0].size / 1024))}KB).`, 'success');
    } catch (error) { console.error('[KINTO Reviews] image compression failed', error); message('reviewFormMessage', error?.message || 'تعذر تجهيز الصورة.', 'error'); }
  }

  function renderPreviews() {
    const box = $('reviewPreviews');
    if (!box) return;
    box.innerHTML = '';
    state.files.forEach((file, index) => {
      const wrapper = document.createElement('div'); wrapper.className = 'review-preview';
      const image = document.createElement('img'); image.alt = `الصورة ${index + 1}`;
      const url = URL.createObjectURL(file); image.src = url; image.onload = () => URL.revokeObjectURL(url);
      const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'إزالة الصورة');
      remove.addEventListener('click', () => { state.files.splice(index, 1); renderPreviews(); });
      wrapper.append(image, remove); box.appendChild(wrapper);
    });
  }

  async function submitReview(event) {
    event.preventDefault();
    if (state.busy || !state.selectedItem || !state.token) return;
    if (state.rating < 1 || state.rating > 5) return message('reviewFormMessage', 'اختر عدد النجوم أولاً.', 'error');
    const comment = $('reviewComment').value.trim();
    if (!comment) return message('reviewFormMessage', 'اكتب تعليقك عن المنتج قبل إرسال التقييم.', 'error');
    if (comment.length > 2000) return message('reviewFormMessage', 'التعليق أطول من 2000 حرف.', 'error');
    state.busy = true; $('reviewSubmitBtn').disabled = true;
    message('reviewFormMessage', 'جاري حفظ التقييم الآمن...');
    try {
      const sb = await client();
      const { data, error } = await sb.rpc('customer_submit_product_review_v132', {
        p_session_token: state.token,
        p_order_id: state.selectedItem.order_id,
        p_product_id: state.selectedItem.product_id,
        p_rating: state.rating,
        p_comment: comment || null
      });
      if (error) throw error;
      if (!data?.id) throw new Error('لم تُرجع الخدمة رقم التقييم.');
      let uploaded = 0;
      let uploadFailure = null;
      for (let i = 0; i < state.files.length; i += 1) {
        message('reviewFormMessage', `تم حفظ التقييم قيد المراجعة. جاري رفع الصورة ${i + 1} من ${state.files.length}...`);
        try { await uploadImage(data.id, state.files[i]); uploaded += 1; }
        catch (error) { uploadFailure = error; break; }
      }
      if (uploadFailure) {
        message('reviewFormMessage', `تم حفظ التقييم بحالة «قيد المراجعة»، لكن تعذر رفع الصورة: ${friendlyReviewError(uploadFailure)}`, 'error');
        state.busy = false;
        return;
      }
      message('reviewFormMessage', uploaded ? 'تم إرسال تقييمك وصورك للمراجعة بنجاح.' : 'تم إرسال تقييمك للمراجعة بنجاح.', 'success');
      setTimeout(async () => { state.busy = false; closeModal(); await loadReadyProducts(); }, 850);
    } catch (error) {
      message('reviewFormMessage', friendlyReviewError(error), 'error');
      state.busy = false;
    } finally { $('reviewSubmitBtn').disabled = false; }
  }

  async function uploadImage(reviewId, file) {
    const sb = await client();
    const { data: ticket, error: ticketError } = await sb.rpc('customer_create_review_image_upload_v150', {
      p_session_token: state.token,
      p_review_id: reviewId,
      p_mime_type: file.type,
      p_byte_size: file.size
    });
    if (ticketError) throw ticketError;
    if (!ticket?.ticket_id || !ticket?.storage_path) throw new Error('تعذر إنشاء تصريح رفع الصورة.');
    const bucket = ticket.bucket || REVIEW_STORAGE_BUCKET;
    const { error: uploadError } = await sb.storage.from(bucket).upload(
      ticket.storage_path, file, { upsert: false, contentType: file.type, cacheControl: '31536000' }
    );
    if (uploadError) throw uploadError;
    const { data, error } = await sb.rpc('customer_finalize_review_image_upload_v150', {
      p_session_token: state.token,
      p_ticket_id: ticket.ticket_id
    });
    if (error || !data?.ok) {
      await sb.storage.from(bucket).remove([ticket.storage_path]).catch(() => {});
      throw error || new Error('تعذر تثبيت صورة التقييم.');
    }
  }

  function updateBadge(count) {
    const badge = $('reviewReadyBadge'); if (!badge) return;
    badge.textContent = count > 99 ? '99+' : String(count); badge.classList.toggle('is-visible', count > 0);
  }

  function injectReviewNotification(count) {
    const container = $('notificationsContainer');
    container?.querySelector('.review-notification')?.remove();
    if (!container || count < 1) return;
    const notice = document.createElement('div'); notice.className = 'notification-item review-notification';
    notice.innerHTML = `<div><strong><i class="fa-solid fa-star"></i> لديك ${count} ${count === 1 ? 'منتج جاهز' : 'منتجات جاهزة'} للتقييم</strong><p>قيّم المنتجات التي استلمتها وشارك تجربتك الموثّقة.</p></div><button type="button" class="review-primary-btn">ابدأ التقييم</button>`;
    notice.querySelector('button').addEventListener('click', event => activateReviewsTab(event));
    container.prepend(notice);
  }

  function message(id, text, kind = '') {
    const target = $(id); if (!target) return;
    target.textContent = String(text || ''); target.classList.toggle('is-error', kind === 'error'); target.classList.toggle('is-success', kind === 'success');
  }

  function wrapNotifications() {
    if (typeof renderCloudNotifications !== 'function' || renderCloudNotifications.__reviewsV135) return;
    const base = renderCloudNotifications;
    renderCloudNotifications = function (...args) {
      const result = base.apply(this, args);
      injectReviewNotification(state.items.filter(item => isReady(item) && !item.review_id).length);
      return result;
    };
    renderCloudNotifications.__reviewsV135 = true;
  }

  function wrapLogout() {
    if (typeof logoutCustomer !== 'function' || logoutCustomer.__reviewsV135) return;
    const base = logoutCustomer;
    logoutCustomer = async function (...args) { clearSession(); return base.apply(this, args); };
    logoutCustomer.__reviewsV135 = true;
  }

  async function boot() {
    if (!injectUi()) return setTimeout(boot, 80);
    wrapNotifications(); wrapLogout(); state.token = readSession();
    if (state.token) await loadReadyProducts();
  }

  window.KintoCustomerReviewsV135 = {
    version: VERSION,
    openPanel,
    activateReviewsTab,
    refresh: loadReadyProducts,
    clearSession,
    diagnostics: () => ({ ...state.lastReadyResult })
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
