(() => {
 const source = 'trendyol';
 const match = location.pathname.match(/-p-(\d+)(?:\/.*)?$/);
 if (location.protocol !== 'https:' || !(location.hostname === 'trendyol.com' || location.hostname.endsWith('.trendyol.com')) || !match) return JSON.stringify({error:'NOT_PRODUCT'});
 const productId = match[1];
 const text = value => String(value || '').trim().slice(0,500);
 const meta = key => document.querySelector('meta[property="'+key+'"]')?.content || '';
 const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('del,s,[aria-hidden="true"]');
 const parsePrice = input => {
  let s = String(input || '').trim();
  if (!s || /%|\d\s*[-–]\s*\d/.test(s)) return null;
  s = s.replace(/(?:TL|TRY|₺)/gi,'').replace(/\s/g,'');
  if (!/^[\d.,]+$/.test(s)) return null;
  if (s.includes(',')) s = s.replace(/\./g,'').replace(',','.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g,'');
  const n = Number(s); return Number.isFinite(n) && n > 0 && n < 10000000 ? n : null;
 };
 const selectors = ['[data-testid="price-current-price"]','[data-testid="product-price"]','.prc-dsc','.prc-box-dscntd','.price-current-price','.product-price-container .price'];
 const prices = [];
 for (const selector of selectors) for (const el of document.querySelectorAll(selector)) {
  if (!visible(el) || el.closest('[data-testid*="recommend"],[class*="recommend"],[class*="similar"],[class*="cross-selling"]')) continue;
  const raw = text(el.textContent); if (!/(TL|TRY|₺)/i.test(raw)) continue;
  const value = parsePrice(raw); if (value !== null && !prices.some(p => p.value === value)) prices.push({value,raw});
 }
 // Structured offers are used only for the exact product, a single TRY offer,
 // and only when visible price selectors did not yield a conflicting price.
 let product = null;
 const walk = node => {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { node.forEach(walk); return; }
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  if (types.includes('Product')) {
   const url = String(node.url || node['@id'] || '');
   const id = String(node.productID || node.sku || '');
   if (url.includes('-p-'+productId) && new RegExp('-p-'+productId+'(?:[/?#]|$)').test(url) || id === productId) product = node;
  }
  if (node['@graph']) walk(node['@graph']);
 };
 for (const el of document.querySelectorAll('script[type="application/ld+json"]')) { try { walk(JSON.parse(el.textContent)); } catch (_) {} }
 let price = prices.length === 1 ? prices[0].value : null;
 let priceRaw = prices.length === 1 ? prices[0].raw : '';
 let priceSource = price !== null ? 'visible' : '';
 if (!prices.length && product) {
  const offers = Array.isArray(product.offers) ? product.offers : [product.offers];
  const merchantId = new URL(location.href).searchParams.get('merchantId');
  const values = offers.filter(o => o && String(o.priceCurrency).toUpperCase() === 'TRY' && (!merchantId || String(o.seller?.identifier || o.seller?.['@id'] || '') === merchantId));
  if (values.length === 1) { price = parsePrice(values[0].price); if (price !== null) {priceRaw=String(values[0].price)+' TRY'; priceSource='structured';} }
 }
 const name = text(document.querySelector('h1')?.textContent || product?.name || meta('og:title') || document.title);
 let image = meta('og:image') || (Array.isArray(product?.image) ? product.image[0] : product?.image) || '';
 if (image && typeof image === 'object') image = image.url || '';
 try { const u = new URL(image,location.href); image = u.protocol === 'https:' ? u.href : ''; } catch (_) { image=''; }
 return JSON.stringify({source,sourceName:'Trendyol',productId,pageUrl:location.href,title:name,image:String(image).slice(0,2000),price,currency:'TRY',priceRaw,priceSource,warning:prices.length>1?'AMBIGUOUS_PRICE':price===null?'PRICE_NOT_FOUND':''});
})();
