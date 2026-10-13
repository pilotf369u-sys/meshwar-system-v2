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
 const regularPlusPrices = Array.from(document.querySelectorAll('.ty-plus-price-original-price')).filter(visible);
 const selectors = ['[data-testid="price-current-price"]','[data-testid="product-price"]','.prc-dsc','.prc-box-dscntd','.price-current-price','.product-price-container .price'];
 const prices = [];
 for (const selector of (regularPlusPrices.length ? ['.ty-plus-price-original-price'] : selectors)) for (const el of document.querySelectorAll(selector)) {
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
 const liveImages = Array.from(document.querySelectorAll('.product-image-gallery-viewport img')).filter(visible);
 let image = liveImages[0]?.currentSrc || liveImages[0]?.src || meta('og:image') || (Array.isArray(product?.image) ? product.image[0] : product?.image) || '';
 if (image && typeof image === 'object') image = image.url || '';
 try { const u = new URL(image,location.href); image = u.protocol === 'https:' ? u.href : ''; } catch (_) { image=''; }
 const readOption = selectors => {
  const containers = selectors.flatMap(selector => Array.from(document.querySelectorAll(selector))).filter(visible);
  const values = [];
  for (const container of containers) for (const el of container.querySelectorAll('[aria-checked="true"],[aria-pressed="true"],[aria-selected="true"],.selected,.active,input:checked,option:checked')) {
   const candidate = text(el.getAttribute('data-value') || el.getAttribute('aria-label') || el.getAttribute('title') || el.querySelector('img')?.getAttribute('alt') || el.textContent);
   if (candidate && candidate.length <= 60 && !values.includes(candidate)) values.push(candidate);
  }
  return {required:containers.length>0,value:values.length===1?values[0]:'',ambiguous:values.length>1};
 };
 const size = readOption(['.size-picker','.size-variant-wrapper','.size-variant-container','[data-testid="size-variants"]','[data-testid="size-variant"]']);
 const color = readOption(['.color-variant-wrapper','.color-variant-container','[data-testid="color-variants"]','[data-testid="color-variant"]']);
 // Current responsive picker titles describe the actual selected variant.
 for (const el of document.querySelectorAll('.variant-title')) {
  if (!visible(el)) continue;
  const label = text(el.textContent);
  const target = /^Beden\s*:/i.test(label) ? size : /^Renk\s*:/i.test(label) ? color : null;
  if (!target) continue;
  target.required = true;
  const selected = text(el.querySelector('.selected-variant')?.textContent || label.split(':').slice(1).join(':'));
  if (selected && selected.length <= 60) target.value = selected;
 }
 const sizeBoxes = Array.from(document.querySelectorAll('[data-testid="size-box"]')).filter(visible);
 if (sizeBoxes.length) {
  size.required = true;
  const chosen = sizeBoxes.filter(el => el.getAttribute('aria-checked') === 'true').map(el => text(el.textContent));
  size.value = chosen.length === 1 && (!size.value || size.value === chosen[0]) ? chosen[0] : '';
 }
 const selectedColors = Array.from(document.querySelectorAll('[data-testid="selected-color"]')).filter(visible).map(el => text(el.textContent));
 if (selectedColors.length) { color.required = true; const unique = [...new Set(selectedColors)]; color.value = unique.length === 1 ? unique[0] : ''; }
 // Avoid stale metadata images when a variant exists but its live gallery is unavailable.
 if ((size.required || color.required) && !liveImages.length) image = '';
 const merchantId = new URL(location.href).searchParams.get('merchantId') || '';
 return JSON.stringify({source,sourceName:'Trendyol',productId,pageUrl:location.href,title:name,image:String(image).slice(0,2000),price,currency:'TRY',priceRaw,priceSource,merchantId,observedOptions:{size:size.value,color:color.value},optionRequirements:{size:size.required,color:color.required},warning:prices.length>1?'AMBIGUOUS_PRICE':price===null?'PRICE_NOT_FOUND':''});
})();
