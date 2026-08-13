/* MESHWAR_SITE_CONTENT_ADMIN_V2
   Isolated admin content controls. No code runs automatically on page load. */
(function () {
  async function handleSiteContent(action) {
    try {
      const mode = action === 'save' ? 'save' : 'load';
      const notice = document.getElementById('siteContentNotice');
      if (notice) notice.textContent = mode === 'save' ? 'جاري حفظ المحتوى...' : 'جاري تحميل المحتوى...';

      if (typeof ensureCustomerSupabase !== 'function') {
        throw new Error('اتصال Supabase غير جاهز');
      }
      const sb = await ensureCustomerSupabase();

      if (mode === 'save') {
        const cloudAdminId = typeof currentAdminCloud !== 'undefined' && currentAdminCloud ? currentAdminCloud.id : '';
        const queryAdminId = typeof getAdminId === 'function' ? getAdminId() : '';
        const adminId = String(cloudAdminId || queryAdminId || '').trim();
        if (!adminId) throw new Error('تعذر تحديد حساب الأدمن');

        const { error } = await sb.rpc('save_site_content', {
          p_admin_id: adminId,
          p_ticker_text: String(document.getElementById('siteTickerText')?.value || '').trim(),
          p_promo_video_url: String(document.getElementById('sitePromoVideoUrl')?.value || '').trim(),
          p_whatsapp_url: String(document.getElementById('siteWhatsappUrl')?.value || '').trim(),
          p_telegram_url: String(document.getElementById('siteTelegramUrl')?.value || '').trim(),
          p_instagram_url: String(document.getElementById('siteInstagramUrl')?.value || '').trim()
        });
        if (error) throw error;
        if (notice) notice.textContent = 'تم حفظ المحتوى بنجاح';
        return true;
      }

      const { data, error } = await sb
        .from('site_content')
        .select('ticker_text,promo_video_url,whatsapp_url,telegram_url,instagram_url')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;

      const row = data || {};
      const fields = [
        ['siteTickerText', 'ticker_text'],
        ['sitePromoVideoUrl', 'promo_video_url'],
        ['siteWhatsappUrl', 'whatsapp_url'],
        ['siteTelegramUrl', 'telegram_url'],
        ['siteInstagramUrl', 'instagram_url']
      ];
      fields.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (el) el.value = row[key] || '';
      });
      if (notice) notice.textContent = 'تم تحديث البيانات';
      return true;
    } catch (error) {
      console.error('Isolated site content error:', error);
      const notice = document.getElementById('siteContentNotice');
      if (notice) notice.textContent = 'تعذر تنفيذ العملية: ' + (error?.message || error);
      return false;
    }
  }

  window.handleSiteContent = handleSiteContent;
})();
