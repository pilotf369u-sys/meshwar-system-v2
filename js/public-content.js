/* MESHWAR_PUBLIC_SITE_CONTENT_V2
   Read-only site content loader with silent fallback to existing UI values. */
(function () {
  async function loadPublicSiteContent() {
    try {
      const SUPABASE_URL = 'https://hsmmbloouskqdnptiiad.supabase.co';
      const SUPABASE_KEY = 'sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data, error } = await sb
        .from('site_content')
        .select('ticker_text,promo_video_url,whatsapp_url,telegram_url,instagram_url')
        .eq('id', 1)
        .maybeSingle();
      if (error || !data) return;

      if (data.ticker_text) {
        const ticker = document.querySelector('#meshwarTicker .meshwar-ticker-track');
        if (ticker) ticker.textContent = data.ticker_text;
      }

      if (data.promo_video_url) {
        const video = document.getElementById('meshwarPromoVideo');
        if (video) {
          video.src = data.promo_video_url;
          video.load();
          if (video.autoplay) video.play().catch(() => {});
        }
      }

      const socialMap = [
        ['WhatsApp', data.whatsapp_url],
        ['Telegram', data.telegram_url],
        ['Instagram', data.instagram_url]
      ];
      socialMap.forEach(([label, url]) => {
        if (!url) return;
        const link = document.querySelector(`#meshwarSocialFooter a[aria-label="${label}"]`);
        if (link) {
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
        }
      });
    } catch (error) {
      console.warn('Public site content fallback active:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPublicSiteContent, { once: true });
  } else {
    loadPublicSiteContent();
  }
})();
