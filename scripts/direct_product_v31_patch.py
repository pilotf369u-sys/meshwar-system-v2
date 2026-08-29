from pathlib import Path

# Active storefront creator actually loaded by index.html.
p=Path('js/local-store-card-v3.js')
s=p.read_text()
old="details:{source:'local_store',store_id:store.id,store_name:store.store_name||'',product_id:String(product.id),product_name:product.product_name||'',selected_color:selectedColor,selected_size:selectedSize,selected_volume:selectedVolume,selected_options:{color:selectedColor,size:selectedSize,volume:selectedVolume},requested_quantity:requestedQuantity,quantity:requestedQuantity,vendor_price_usd:vendor,commission_rate:Number(store.commission_rate||10),customer_price_usd:ceilPrice(usd),exchange_rate:exchangeRate(store),customer_price_local:unitIqd,customer_total_local:totalIqd,local_currency:'IQD',governorate:customer.governorate||customer.state||customer.city||customer.province||''},order_url:'index.html?storeId='+encodeURIComponent(store.id),image_url:product.image_url||null,status:'انتظار رد الموظف'"
new="details:{source:'local_store',store_id:store.id,store_name:store.store_name||'',product_id:String(product.id),product_name:product.product_name||'',product_url:'index.html?storeId='+encodeURIComponent(store.id)+'&productId='+encodeURIComponent(String(product.id))+'#localStoreProductsPanel',product_image:product.image_url||null,selected_color:selectedColor,selected_size:selectedSize,selected_volume:selectedVolume,selected_options:{color:selectedColor,size:selectedSize,volume:selectedVolume},requested_quantity:requestedQuantity,quantity:requestedQuantity,vendor_price_usd:vendor,commission_rate:Number(store.commission_rate||10),customer_price_usd:ceilPrice(usd),exchange_rate:exchangeRate(store),customer_price_local:unitIqd,customer_total_local:totalIqd,local_currency:'IQD',governorate:customer.governorate||customer.state||customer.city||customer.province||''},order_url:'index.html?storeId='+encodeURIComponent(store.id)+'&productId='+encodeURIComponent(String(product.id))+'#localStoreProductsPanel',image_url:product.image_url||null,status:'انتظار رد الموظف'"
if old not in s:
    raise SystemExit('ACTIVE V3 order payload marker not found')
s=s.replace(old,new,1)
if 'DIRECT_PRODUCT_SCROLL_V31' not in s:
    s += r'''

/* DIRECT_PRODUCT_SCROLL_V31 — exact product focus for dashboard deep-links */
(()=>{
  const params=new URLSearchParams(location.search);
  const pid=String(params.get('productId')||params.get('product')||'').trim();
  if(!pid)return;
  let tries=0;
  const focusExact=()=>{
    const card=[...document.querySelectorAll('.local-v3-card[data-product-card]')].find(x=>String(x.dataset.productCard||'')===pid);
    if(!card){if(++tries<80)setTimeout(focusExact,200);return;}
    card.id='product-'+pid;
    card.setAttribute('data-direct-product-focus','true');
    card.style.setProperty('outline','4px solid #fbbf24','important');
    card.style.setProperty('outline-offset','4px','important');
    card.style.setProperty('box-shadow','0 0 0 6px rgba(251,191,36,.20),0 18px 50px rgba(2,6,23,.35)','important');
    requestAnimationFrame(()=>card.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'}));
    setTimeout(()=>card.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'}),120);
  };
  focusExact();
  window.addEventListener('load',()=>setTimeout(focusExact,80),{once:true});
})();
'''
p.write_text(s)

# Admin historical/current order links: canonicalize from details.product_id + store_id.
p=Path('admin-dashboard.html')
s=p.read_text()
old="function adminOrderProductUrl(o){return String(o?.order_url||o?.product_url||o?.url||o?.link||'').trim()}"
new="function adminOrderProductUrl(o){const d=parseAdminOrderDetails(o?.details),sid=String(d.store_id||o?.store_id||'').trim(),pid=String(d.product_id||o?.product_id||'').trim();if(sid&&pid)return `index.html?storeId=${encodeURIComponent(sid)}&productId=${encodeURIComponent(pid)}#localStoreProductsPanel`;return String(d.product_url||o?.product_url||o?.order_url||o?.url||o?.link||'').trim()}"
if old not in s:
    raise SystemExit('admin product URL marker not found')
s=s.replace(old,new,1)
p.write_text(s)

# Employee historical/current order links: same canonical reconstruction.
p=Path('employee-dashboard.html')
s=p.read_text()
old="const d=parseDetails(o.details),productUrl=String(o.order_url||o.product_url||o.url||o.link||'').trim(),productLink="
new="const d=parseDetails(o.details),sid=String(d.store_id||o.store_id||'').trim(),pid=String(d.product_id||o.product_id||'').trim(),productUrl=(sid&&pid)?`index.html?storeId=${encodeURIComponent(sid)}&productId=${encodeURIComponent(pid)}#localStoreProductsPanel`:String(d.product_url||o.product_url||o.order_url||o.url||o.link||'').trim(),productLink="
if old not in s:
    raise SystemExit('employee product URL marker not found')
s=s.replace(old,new,1)
p.write_text(s)

# Cache-bust the active scripts that index.html truly loads.
p=Path('index.html')
s=p.read_text()
for previous in ['js/local-store-card-v3.js?v=local-modal-v4-2','js/local-store-card-v3.js?v=20260829-direct-v31']:
    s=s.replace(previous,'js/local-store-card-v3.js?v=20260829-direct-v31b')
for previous in ['js/local-store-product-details-v4.js?v=local-modal-v4-2','js/local-store-product-details-v4.js?v=20260829-direct-v31']:
    s=s.replace(previous,'js/local-store-product-details-v4.js?v=20260829-direct-v31b')
if 'js/local-store-card-v3.js?v=20260829-direct-v31b' not in s:
    raise SystemExit('index active V3 script marker not found')
p.write_text(s)

for oldwf in ['.github/workflows/local-order-direct-product-v29.yml','.github/workflows/local-order-direct-product-v30.yml']:
    Path(oldwf).unlink(missing_ok=True)
