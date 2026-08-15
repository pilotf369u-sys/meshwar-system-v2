from pathlib import Path

pricing=Path('js/local-store-pricing.js')
s=pricing.read_text(encoding='utf-8')
old="""  function discountPercent(basePrice,discountPrice){
    const base=Number(basePrice),discount=Number(discountPrice);
    if(!Number.isFinite(base)||!Number.isFinite(discount)||base<=0||discount<0||discount>=base)return null;
    return Math.max(1,Math.min(99,Math.round(((base-discount)/base)*100)));
  }
  window.MeshwarLocalPricing={ceilNumber,commissionFraction,customerPriceUSD,customerPriceLocal,discountPercent};"""
new="""  function discountPercent(basePrice,discountPrice){
    const base=Number(basePrice),discount=Number(discountPrice);
    if(!Number.isFinite(base)||!Number.isFinite(discount)||base<=0||discount<0||discount>=base)return null;
    return Math.max(1,Math.min(99,Math.round(((base-discount)/base)*100)));
  }
  function pricingSnapshot(vendorPrice,commissionRate,exchangeRate,localCurrency='IQD'){
    const vendor=Number(vendorPrice),rate=Number(exchangeRate),commission=Number(commissionRate);
    const usd=customerPriceUSD(vendor,commission);
    const local=customerPriceLocal(vendor,commission,rate);
    if(usd===null||local===null)return null;
    return {
      vendor_price_usd:vendor,
      commission_rate:Number.isFinite(commission)&&commission>=0&&commission<100?commission:10,
      exchange_rate:rate,
      customer_price_usd:ceilNumber(usd),
      customer_price_local:ceilNumber(local),
      local_currency:String(localCurrency||'IQD').toUpperCase()
    };
  }
  window.MeshwarLocalPricing={ceilNumber,commissionFraction,customerPriceUSD,customerPriceLocal,discountPercent,pricingSnapshot};"""
if old not in s: raise SystemExit('pricing helper block not found')
pricing.write_text(s.replace(old,new,1),encoding='utf-8')

vendor=Path('vendor-dashboard.html')
v=vendor.read_text(encoding='utf-8')
anchor="function safeOptions(v){if(!v)return{colors:[],sizes:[],volumes:[]};if(typeof v==='object')return{colors:Array.isArray(v.colors)?v.colors:[],sizes:Array.isArray(v.sizes)?v.sizes:[],volumes:Array.isArray(v.volumes)?v.volumes:[]};try{return safeOptions(JSON.parse(v))}catch{return{colors:[],sizes:[],volumes:[]}}}"
insert=anchor+"\nfunction rawOptions(v){if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return{...v};try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?{...x}:{}}catch{return{}}}\nfunction productPricingSnapshot(product){const pricing=window.MeshwarLocalPricing,vendorUsd=Number(product?.discount_price??product?.base_price);if(!pricing||!Number.isFinite(vendorUsd)||vendorUsd<0)return null;return pricing.pricingSnapshot(vendorUsd,vendorStore?.commission_rate??10,vendorStore?.exchange_rate||1,vendorStore?.exchange_target_currency||vendorStore?.default_currency||'IQD')}\nasync function syncProductPricingSnapshots(){if(!vendorStore||!products.length||!window.MeshwarLocalPricing)return;await Promise.allSettled(products.map(async p=>{const options=rawOptions(p.options),snapshot=productPricingSnapshot(p);if(!snapshot)return;const current=options.pricing||null;if(current&&JSON.stringify(current)===JSON.stringify(snapshot))return;options.pricing=snapshot;const{error}=await sb.from('local_products').update({options,updated_at:new Date().toISOString()}).eq('id',p.id).eq('store_id',vendorStore.id);if(error){console.warn('Pricing snapshot sync failed:',p.id,error.message);return}p.options=options}))}"
if anchor not in v: raise SystemExit('safeOptions anchor not found')
v=v.replace(anchor,insert,1)

old_load="products=data||[];renderProducts();renderStats()"
new_load="products=data||[];await syncProductPricingSnapshots();renderProducts();renderStats()"
if old_load not in v: raise SystemExit('loadProducts render block not found')
v=v.replace(old_load,new_load,1)

old_payload="options:{colors:optionsArray($('productColors').value),sizes:optionsArray($('productSizes').value),volumes:optionsArray($('productVolumes').value)},updated_at:new Date().toISOString()"
new_payload="options:{colors:optionsArray($('productColors').value),sizes:optionsArray($('productSizes').value),volumes:optionsArray($('productVolumes').value),pricing:window.MeshwarLocalPricing?.pricingSnapshot(discount??base,vendorStore?.commission_rate??10,vendorStore?.exchange_rate||1,vendorStore?.exchange_target_currency||vendorStore?.default_currency||'IQD')||null},updated_at:new Date().toISOString()"
if old_payload not in v: raise SystemExit('product payload options block not found')
v=v.replace(old_payload,new_payload,1)

old_rate="vendorStore.exchange_target_currency=target;saveStoreSession(vendorStore);renderExchangePreview();renderProducts();showNotice('تم تطبيق سعر الصرف على عرض جميع المنتجات.')"
new_rate="vendorStore.exchange_target_currency=target;saveStoreSession(vendorStore);await syncProductPricingSnapshots();renderExchangePreview();renderProducts();showNotice('تم تطبيق سعر الصرف وحفظ الأسعار المقربة لجميع المنتجات.')"
if old_rate not in v: raise SystemExit('exchange rate block not found')
v=v.replace(old_rate,new_rate,1)

old_typo='<div class="vendor-text text-[1.05rem] font-black text-white">${esc(p.product_name)}</div><div class="text-sm leading-6 text-slate-100">${esc(p.description||\'\')}</div>'
new_typo='<div class="vendor-text text-[1.1rem] font-black text-white">${esc(p.product_name)}</div><div style="color:#ffffff;font-size:.95rem;font-weight:500;line-height:1.5">${esc(p.description||\'\')}</div>'
if old_typo not in v: raise SystemExit('vendor typography block not found')
v=v.replace(old_typo,new_typo,1)
v=v.replace('js/local-store-pricing.js?v=pricing-1','js/local-store-pricing.js?v=pricing-final-2')
vendor.write_text(v,encoding='utf-8')

card=Path('js/local-store-card-v3.js')
c=card.read_text(encoding='utf-8')
c=c.replace(".local-v3-name{font-size:1.1rem!important;font-weight:900!important;color:#ffffff!important;margin-bottom:6px!important}.local-v3-desc{font-size:.9rem!important;color:#f1f5f9!important;line-height:1.4!important;min-height:20px!important;margin-top:3px!important}", ".local-v3-name{font-size:1.1rem!important;font-weight:900!important;color:#ffffff!important;margin-bottom:6px!important}.local-v3-desc{font-size:.95rem!important;color:#ffffff!important;font-weight:500!important;line-height:1.5!important;min-height:22px!important;margin-top:4px!important}",1)
old_prices="const vendorPrice=p=>{const n=Number(p?.discount_price??p?.base_price);return Number.isFinite(n)&&n>=0?n:null};\nconst customerPriceUsd=(p,s)=>{const v=vendorPrice(p);return v===null?null:Pricing.customerPriceUSD(v,s?.commission_rate)};\nconst customerPriceIqd=(p,s)=>{const v=vendorPrice(p);return v===null?null:Pricing.customerPriceLocal(v,s?.commission_rate,exchangeRate(s))};"
new_prices="const vendorPrice=p=>{const n=Number(p?.discount_price??p?.base_price);return Number.isFinite(n)&&n>=0?n:null};\nconst rawOptions=v=>{if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return v;try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return{}}};\nconst storedPricing=(p,s)=>{const snap=rawOptions(p?.options).pricing;if(!snap)return null;const vendor=vendorPrice(p),commission=Number(s?.commission_rate),rate=exchangeRate(s);if(vendor===null)return null;const sameVendor=Number(snap.vendor_price_usd)===Number(vendor),sameCommission=Number(snap.commission_rate)===(Number.isFinite(commission)&&commission>=0&&commission<100?commission:10),sameRate=Number(snap.exchange_rate)===Number(rate);return sameVendor&&sameCommission&&sameRate?snap:null};\nconst customerPriceUsd=(p,s)=>{const snap=storedPricing(p,s);if(snap&&Number.isFinite(Number(snap.customer_price_usd)))return ceilPrice(snap.customer_price_usd);const v=vendorPrice(p);return v===null?null:Pricing.customerPriceUSD(v,s?.commission_rate)};\nconst customerPriceIqd=(p,s)=>{const snap=storedPricing(p,s);if(snap&&Number.isFinite(Number(snap.customer_price_local)))return ceilPrice(snap.customer_price_local);const v=vendorPrice(p);return v===null?null:Pricing.customerPriceLocal(v,s?.commission_rate,exchangeRate(s))};"
if old_prices not in c: raise SystemExit('v3 pricing block not found')
c=c.replace(old_prices,new_prices,1)
c=c.replace("restRequest(`local_products?select=id,product_name,image_url,description,base_price,discount_price,is_out_of_stock&store_id=eq.${encoded}&order=created_at.desc`,{timeout:3000})", "restRequest(`local_products?select=id,product_name,image_url,description,base_price,discount_price,is_out_of_stock,options&store_id=eq.${encoded}&order=created_at.desc`,{timeout:3000})",1)
old_render="""    const iqd=customerPriceIqd(p,store),oldIqd=oldCustomerPriceIqd(p,store),unavailable=!!p.is_out_of_stock||iqd===null;
    const hasDiscount=oldIqd!==null;
    const old=hasDiscount?`<div class=\"local-v3-old-row\"><span class=\"local-v3-old\"><span class=\"local-v3-money\" dir=\"ltr\">${esc(iqdLabel(oldIqd))}</span></span></div>`:'';
    const discountPct=hasDiscount?Pricing.discountPercent(p.base_price,p.discount_price):null;
    const badge=hasDiscount?`<span class=\"local-v3-discount-badge\">خصم ${esc(discountPct)}%</span>`:'';"""
new_render="""    const base=Number(p.base_price),discount=Number(p.discount_price),hasDiscount=p.discount_price!==null&&p.discount_price!==''&&Number.isFinite(base)&&Number.isFinite(discount)&&base>0&&discount>=0&&discount<base;
    const iqd=customerPriceIqd(p,store),oldIqd=hasDiscount?oldCustomerPriceIqd(p,store):null,unavailable=!!p.is_out_of_stock||iqd===null;
    const old=hasDiscount&&oldIqd!==null?`<div class=\"local-v3-old-row\"><span class=\"local-v3-old\"><span class=\"local-v3-money\" dir=\"ltr\">${esc(iqdLabel(oldIqd))}</span></span></div>`:'';
    const discountPct=hasDiscount?Pricing.discountPercent(base,discount):null;
    const badge=discountPct!==null?`<span class=\"local-v3-discount-badge\">خصم ${esc(discountPct)}%</span>`:'';"""
if old_render not in c: raise SystemExit('discount render block not found')
c=c.replace(old_render,new_render,1)
card.write_text(c,encoding='utf-8')

idx=Path('index.html')
h=idx.read_text(encoding='utf-8')
h=h.replace('js/local-store-pricing.js?v=pricing-1','js/local-store-pricing.js?v=pricing-final-2')
h=h.replace('js/local-store-card-v3.js?v=pricing-unified-1','js/local-store-card-v3.js?v=pricing-final-2')
idx.write_text(h,encoding='utf-8')
