const SUPABASE_URL='https://hsmmbloouskqdnptiiad.supabase.co';
const SUPABASE_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
const CACHE_PREFIX='meshwar_local_store_cache_v3_';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:0});
const Pricing=window.MeshwarLocalPricing||{ceilNumber:v=>Math.ceil(Number(v)),commissionFraction:r=>{const n=Number(r);return Number.isFinite(n)&&n>=0&&n<100?n/100:.10},customerPriceUSD:(v,r)=>Math.ceil(Number(v)/(1-(Number(r)||10)/100)),customerPriceLocal:(v,r,x)=>Math.ceil((Math.ceil(Number(v)/(1-(Number(r)||10)/100))*Number(x||1))/1000)*1000,discountPercent:(b,d)=>Math.max(1,Math.min(99,Math.round(((Number(b)-Number(d))/Number(b))*100)))};
const ceilPrice=Pricing.ceilNumber;
const placeholder='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#94a3b8" font-family="Arial" font-size="34" text-anchor="middle">PRODUCT</text></svg>');

const style=document.createElement('style');
style.textContent=`
#localStoreProductsGrid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))!important;gap:18px!important;align-items:stretch!important;grid-auto-rows:auto!important;overflow:visible!important;width:100%!important}
.local-v3-card{position:relative!important;display:flex!important;flex-direction:column!important;height:auto!important;min-width:0!important;overflow:hidden!important;border-radius:18px!important;border:1px solid rgba(251,191,36,.28)!important;background:rgba(255,255,255,.72)!important;box-shadow:0 12px 34px rgba(15,23,42,.08)!important}
html.dark .local-v3-card{background:rgba(255,255,255,.06)!important;box-shadow:none!important}
.local-v3-img-wrap{width:100%!important;height:200px!important;display:flex!important;align-items:center!important;justify-content:center!important;background:rgba(255,255,255,.03)!important;padding:10px!important;box-sizing:border-box!important;overflow:hidden!important}
.local-v3-img{display:block!important;width:auto!important;height:auto!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;border-radius:0!important;margin:0!important;padding:0!important;background:transparent!important}
.local-v3-body{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;padding:15px!important;min-height:220px!important;text-align:right!important}
.local-v3-name{font-size:1.1rem!important;font-weight:900!important;color:#1e293b!important;margin-bottom:6px!important}.local-v3-desc{font-size:.9rem!important;color:#475569!important;font-weight:600!important;line-height:1.55!important;min-height:22px!important;margin-top:4px!important}html.dark .local-v3-name{color:#f8fafc!important}html.dark .local-v3-desc{color:#cbd5e1!important}
.local-v3-options{display:grid!important;gap:9px!important;margin-top:12px!important}.local-v3-option-label{display:grid!important;gap:5px!important;font-size:12px!important;font-weight:900!important;color:#334155!important}.local-v3-option-select{width:100%!important;min-height:42px!important;border:1px solid rgba(148,163,184,.38)!important;border-radius:10px!important;background:#fff!important;color:#1e293b!important;padding:8px 10px!important;font-weight:700!important;outline:none!important}.local-v3-option-select:focus{border-color:#d4af37!important;box-shadow:0 0 0 3px rgba(212,175,55,.12)!important}html.dark .local-v3-option-label{color:#e2e8f0!important}html.dark .local-v3-option-select{background:#0f172a!important;color:#f8fafc!important;border-color:rgba(148,163,184,.28)!important}
.local-v3-low-stock{margin-top:10px!important;padding:9px 10px!important;border-radius:10px!important;border:1px solid #fb923c!important;background:linear-gradient(135deg,rgba(251,146,60,.18),rgba(245,158,11,.10))!important;color:#c2410c!important;font-size:12px!important;font-weight:900!important;text-align:center!important}html.dark .local-v3-low-stock{color:#fdba74!important}
.local-v3-sold-out{margin-top:10px!important;padding:9px 10px!important;border-radius:10px!important;border:1px solid rgba(148,163,184,.38)!important;background:rgba(100,116,139,.10)!important;color:#64748b!important;font-size:12px!important;font-weight:900!important;text-align:center!important}
.local-v3-price{margin-top:12px!important;padding:12px!important;border-radius:12px!important;background:rgba(14,165,233,.10)!important;border:1px solid rgba(56,189,248,.24)!important}.local-v3-old-row{display:block!important;margin-bottom:10px!important;padding-bottom:8px!important;border-bottom:1px solid rgba(148,163,184,.16)!important}.local-v3-old{display:inline-block!important;color:#94a3b8!important;font-size:12px!important;text-decoration:line-through!important;text-decoration-thickness:2px!important;text-decoration-color:#94a3b8!important}.local-v3-discount-badge{position:absolute!important;top:14px!important;right:-34px!important;z-index:4!important;display:flex!important;align-items:center!important;justify-content:center!important;min-width:150px!important;padding:7px 16px!important;background:linear-gradient(90deg,#dc2626,#f97316)!important;color:#fff!important;font-size:13px!important;font-weight:900!important;letter-spacing:.2px!important;box-shadow:0 6px 18px rgba(239,68,68,.42)!important;white-space:nowrap!important;transform:rotate(35deg)!important}.local-v3-local{font-size:21px!important;font-weight:900!important;color:#b8860b!important}html.dark .local-v3-local{color:#fbbf24!important}.local-v3-note{display:block!important;margin-top:6px!important;color:#64748b!important;font-size:11px!important;font-weight:600!important;line-height:1.45!important}html.dark .local-v3-note{color:#cbd5e1!important}.local-v3-money{direction:ltr!important;unicode-bidi:isolate!important;display:inline-block!important;white-space:nowrap!important}
.local-v3-order{display:inline-flex!important;width:100%!important;min-height:48px!important;margin-top:16px!important;padding:10px!important;align-items:center!important;justify-content:center!important;gap:0!important;border-radius:8px!important;border:none!important;background:linear-gradient(135deg,#D4AF37,#c49a22)!important;color:#111827!important;font-weight:900!important;font-size:1rem!important;cursor:pointer!important;box-shadow:0 4px 14px rgba(212,175,55,.28)!important;transition:transform .2s ease,box-shadow .2s ease,filter .2s ease!important}.local-v3-order:hover{transform:translateY(-2px)!important;box-shadow:0 8px 22px rgba(212,175,55,.36)!important;filter:brightness(1.06)!important}.local-v3-order:disabled{opacity:1!important;cursor:not-allowed!important;background:#94a3b8!important;color:#e2e8f0!important;box-shadow:none!important;transform:none!important}.local-v3-order::before,.local-v3-order::after{content:none!important;display:none!important}
.local-v3-state{grid-column:1/-1!important;padding:28px 18px!important;border-radius:16px!important;border:1px solid rgba(148,163,184,.18)!important;background:rgba(15,23,42,.38)!important;color:#cbd5e1!important;text-align:center!important}.local-v3-debug-error{grid-column:1/-1!important;padding:20px!important;border-radius:14px!important;border:1px solid rgba(248,113,113,.35)!important;background:rgba(127,29,29,.16)!important;color:#fca5a5!important;text-align:center!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important}.local-v3-retry{margin-top:12px!important;padding:9px 16px!important;border-radius:10px!important;border:1px solid rgba(56,189,248,.45)!important;background:rgba(14,165,233,.16)!important;color:#e0f2fe!important;font-weight:800!important;cursor:pointer!important}.local-v3-cache-note{grid-column:1/-1!important;margin-bottom:-6px!important;color:#fbbf24!important;font-size:11px!important;text-align:center!important}
@media(max-width:640px){#localStoreProductsGrid{grid-template-columns:1fr!important;gap:14px!important}.local-v3-img-wrap{height:180px!important}.local-v3-body{padding:13px!important}}
`;
document.head.appendChild(style);

const commissionRate=s=>Pricing.commissionFraction(s?.commission_rate);
const exchangeRate=s=>{const n=Number(s?.exchange_rate);return Number.isFinite(n)&&n>0?n:1};
const vendorPrice=p=>{const n=Number(p?.discount_price??p?.base_price);return Number.isFinite(n)&&n>=0?n:null};
const rawOptions=v=>{if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return v;try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return{}}};
const cleanOptionArray=v=>Array.isArray(v)?v.map(x=>String(x??'').trim()).filter(Boolean):[];
const productOptions=p=>{const o=rawOptions(p?.options);return{colors:cleanOptionArray(o.colors),sizes:cleanOptionArray(o.sizes),volumes:cleanOptionArray(o.volumes)}};
const optionSelect=(pid,key,label,values)=>values.length?`<label class="local-v3-option-label">${esc(label)}<select class="local-v3-option-select" data-option="${esc(key)}" data-pid="${esc(pid)}"><option value="">اختر ${esc(label)}</option>${values.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select></label>`:'';
const storedPricing=(p,s)=>{const snap=rawOptions(p?.options).pricing;if(!snap||snap.pricing_version!=='iqd_ceil_1000_v1')return null;const vendor=vendorPrice(p),commission=Number(s?.commission_rate),rate=exchangeRate(s);if(vendor===null)return null;const sameVendor=Number(snap.vendor_price_usd)===Number(vendor),sameCommission=Number(snap.commission_rate)===(Number.isFinite(commission)&&commission>=0&&commission<100?commission:10),sameRate=Number(snap.exchange_rate)===Number(rate);return sameVendor&&sameCommission&&sameRate?snap:null};
const customerPriceUsd=(p,s)=>{const snap=storedPricing(p,s);if(snap&&Number.isFinite(Number(snap.customer_price_usd)))return ceilPrice(snap.customer_price_usd);const v=vendorPrice(p);return v===null?null:Pricing.customerPriceUSD(v,s?.commission_rate)};
const customerPriceIqd=(p,s)=>{const snap=storedPricing(p,s);if(snap&&Number.isFinite(Number(snap.customer_price_local)))return ceilPrice(snap.customer_price_local);const v=vendorPrice(p);return v===null?null:Pricing.customerPriceLocal(v,s?.commission_rate,exchangeRate(s))};
const oldCustomerPriceIqd=(p,s)=>{if(p.discount_price==null||p.base_price==null||Number(p.discount_price)>=Number(p.base_price))return null;return Pricing.customerPriceLocal(Number(p.base_price),s?.commission_rate,exchangeRate(s))};
const iqdLabel=v=>`IQD ${fmt(v)}`;

async function restRequest(path,{method='GET',body=null,timeout=3000}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeout);
  try{
    const res=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
      method,
      signal:controller.signal,
      mode:'cors',
      cache:'no-store',
      headers:{
        'apikey':SUPABASE_KEY,
        'Authorization':`Bearer ${SUPABASE_KEY}`,
        'Accept':'application/json',
        'Content-Type':'application/json',
        ...(method==='POST'?{'Prefer':'return=minimal'}:{})
      },
      body:body==null?null:JSON.stringify(body)
    });
    if(!res.ok){
      const text=await res.text().catch(()=>res.statusText);
      throw new Error(`Supabase REST ${res.status}: ${text||res.statusText}`);
    }
    if(res.status===204)return null;
    const text=await res.text();
    try{return text?JSON.parse(text):null}catch{throw new Error('استجابة Supabase ليست JSON صالحاً: '+text.slice(0,300))}
  }catch(e){
    if(e?.name==='AbortError')throw new Error('انتهت مهلة الاتصال بـ Supabase بعد 3 ثوانٍ.');
    throw e;
  }finally{clearTimeout(timer)}
}

function cacheKey(storeId){return CACHE_PREFIX+String(storeId)}
function saveCache(storeId,store,products){try{localStorage.setItem(cacheKey(storeId),JSON.stringify({store,products,savedAt:Date.now()}))}catch{}}
function readCache(storeId){try{const v=JSON.parse(localStorage.getItem(cacheKey(storeId))||'null');return v&&v.store&&Array.isArray(v.products)?v:null}catch{return null}}

async function fetchStoreBundle(storeId){
  const encoded=encodeURIComponent(storeId);
  const [stores,products]=await Promise.all([
    restRequest(`local_stores?select=id,store_name,commission_rate,exchange_rate,status&id=eq.${encoded}&status=eq.active&limit=1`,{timeout:3000}),
    restRequest(`local_products?select=id,product_name,image_url,description,base_price,discount_price,stock_quantity,low_stock_threshold,is_out_of_stock,options&store_id=eq.${encoded}&order=created_at.desc`,{timeout:3000})
  ]);
  const store=Array.isArray(stores)?stores[0]:null;
  if(!store)throw new Error('المتجر غير موجود أو غير نشط، أو أن RLS يمنع قراءته.');
  return{store,products:Array.isArray(products)?products:[]};
}

function renderCards(grid,store,products,{fromCache=false}={}){
  const cards=(products||[]).map(p=>{
    const base=Number(p.base_price),discount=Number(p.discount_price),hasDiscount=p.discount_price!==null&&p.discount_price!==''&&Number.isFinite(base)&&Number.isFinite(discount)&&base>0&&discount>=0&&discount<base;
    const hasStock=p.stock_quantity!==null&&p.stock_quantity!==undefined&&p.stock_quantity!=='';
    const stock=hasStock?Math.max(0,Math.floor(Number(p.stock_quantity)||0)):null;
    const iqd=customerPriceIqd(p,store),oldIqd=hasDiscount?oldCustomerPriceIqd(p,store):null,unavailable=!!p.is_out_of_stock||(hasStock&&stock===0)||iqd===null;
    const opts=productOptions(p),optionsHtml=[optionSelect(p.id,'color','اللون',opts.colors),optionSelect(p.id,'size','المقاس',opts.sizes),optionSelect(p.id,'volume','الحجم',opts.volumes)].filter(Boolean).join('');
    const old=hasDiscount&&oldIqd!==null?`<div class="local-v3-old-row"><span class="local-v3-old" dir="ltr" style="text-decoration: line-through !important; -webkit-text-decoration-line: line-through !important; color: #94a3b8 !important; font-size: 0.85rem; display: inline-block; direction:ltr; unicode-bidi:isolate;">${esc(iqdLabel(oldIqd))}</span></div>`:'';
    const discountPct=hasDiscount?Pricing.discountPercent(base,discount):null;
    const badge=discountPct!==null?`<span class="local-v3-discount-badge">خصم ${esc(discountPct)}%</span>`:'';
    const stockNotice=hasStock&&stock>0&&stock<=3?`<div class="local-v3-low-stock">🔥 سارع بالطلب، متبقي ${esc(stock)} قطع فقط!</div>`:unavailable?'<div class="local-v3-sold-out">هذا المنتج غير متوفر حالياً</div>':'';
    return `<article class="local-v3-card" data-product-card="${esc(p.id)}">${badge}<div class="local-v3-img-wrap"><img class="local-v3-img" src="${esc(p.image_url||placeholder)}" onerror="this.onerror=null;this.src='${esc(placeholder)}'" alt="${esc(p.product_name||'منتج')}"></div><div class="local-v3-body"><div class="local-v3-name">${esc(p.product_name||'منتج')}</div><div class="local-v3-desc">${esc(p.description||'')}</div>${stockNotice}${optionsHtml&&!unavailable?`<div class="local-v3-options">${optionsHtml}</div>`:''}<div class="local-v3-price">${unavailable?'غير متوفر':`${old}<div class="local-v3-local"><span class="local-v3-money" dir="ltr">${esc(iqdLabel(iqd))}</span></div><small class="local-v3-note">السعر شامل هامش MeshWar — التوصيل يحدد لاحقاً</small>`}</div><button type="button" class="local-v3-order" ${unavailable?'disabled':''} data-pid="${esc(p.id)}">${unavailable?'نفذت الكمية':'اطلب الآن'}</button></div></article>`;
  }).join('');
  grid.innerHTML=`${fromCache?'<div class="local-v3-cache-note">يتم عرض نسخة محفوظة مؤقتاً بسبب تعذر الاتصال المباشر.</div>':''}${cards||'<div class="local-v3-state">لا توجد منتجات مضافة لهذا المتجر حالياً.</div>'}`;
  grid.querySelectorAll('.local-v3-order[data-pid]').forEach(btn=>btn.addEventListener('click',()=>{
    const p=(products||[]).find(x=>String(x.id)===String(btn.dataset.pid));if(!p)return;
    const card=btn.closest('[data-product-card]'),opts=productOptions(p),selection={color:'',size:'',volume:''};
    for(const [key,values,label] of [['color',opts.colors,'اللون'],['size',opts.sizes,'المقاس'],['volume',opts.volumes,'الحجم']]){
      if(!values.length)continue;
      const select=card?.querySelector(`.local-v3-option-select[data-option="${key}"]`),value=String(select?.value||'').trim();
      if(!value){alert('يرجى اختيار '+label+' قبل إرسال الطلب.');select?.focus();return}
      selection[key]=value;
    }
    createOrder(p,store,selection);
  }));
}

async function createOrder(product,store,selection={}){
  const customerId=String(localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId')||'').trim();
  if(!customerId){alert('الرجاء تسجيل الدخول أولاً لإرسال الطلب.');location.href='login.html';return}
  try{
    const liveRows=await restRequest(`local_products?select=id,stock_quantity,is_out_of_stock&id=eq.${encodeURIComponent(product.id)}&limit=1`,{timeout:3000});
    const live=Array.isArray(liveRows)?liveRows[0]:null;
    const liveHasStock=live&&live.stock_quantity!==null&&live.stock_quantity!==undefined&&live.stock_quantity!=='';
    if(live&&(live.is_out_of_stock||(liveHasStock&&Number(live.stock_quantity)<=0))){alert('عذراً، نفذت الكمية لهذا المنتج.');await renderStoreProductsV3(store.id);return}
    const customerRows=await restRequest(`customers?select=*&id=eq.${encodeURIComponent(customerId)}&limit=1`,{timeout:3000});
    const customer=Array.isArray(customerRows)?customerRows[0]:null;if(!customer)throw new Error('تعذر العثور على بيانات العميل.');
    const rows=await restRequest('orders?select=order_code&order=created_at.desc&limit=1000',{timeout:3000});
    const vendor=vendorPrice(product),usd=customerPriceUsd(product,store),iqd=customerPriceIqd(product,store);if(vendor===null||usd===null||iqd===null)throw new Error('سعر المنتج غير صالح.');
    let max=1000;(rows||[]).forEach(r=>{const m=String(r.order_code||'').match(/^MW-(\d+)$/i);if(m)max=Math.max(max,Number(m[1]))});const orderCode='MW-'+(max+1);
    const selectedColor=String(selection.color||'').trim(),selectedSize=String(selection.size||'').trim(),selectedVolume=String(selection.volume||'').trim();
    const payload={order_code:orderCode,customer_id:customer.id,customer_name:customer.name||'',customer_phone:customer.phone||'',total_price:ceilPrice(iqd),currency:'IQD',details:{source:'local_store',store_id:store.id,store_name:store.store_name||'',product_id:String(product.id),product_name:product.product_name||'',selected_color:selectedColor,selected_size:selectedSize,selected_volume:selectedVolume,selected_options:{color:selectedColor,size:selectedSize,volume:selectedVolume},vendor_price_usd:vendor,commission_rate:Number(store.commission_rate||10),customer_price_usd:ceilPrice(usd),exchange_rate:exchangeRate(store),customer_price_local:ceilPrice(iqd),local_currency:'IQD',quantity:1,governorate:customer.governorate||customer.state||customer.city||customer.province||''},order_url:'index.html?storeId='+encodeURIComponent(store.id),image_url:product.image_url||null,status:'انتظار رد الموظف'};
    await restRequest('orders',{method:'POST',body:[payload],timeout:5000});
    alert('تم إرسال الطلب بنجاح. السعر: '+iqdLabel(ceilPrice(iqd))+' — رقم الطلب: '+orderCode);location.href='dashboard.html?customerId='+encodeURIComponent(customer.id);
  }catch(e){console.error('Local order error:',e);alert('تعذر إرسال الطلب: '+(e.message||e))}
}

async function renderStoreProductsV3(storeIdOverride){
  const storeId=String(storeIdOverride||new URLSearchParams(location.search).get('storeId')||'').trim();
  const grid=document.getElementById('localStoreProductsGrid');if(!storeId||!grid)return;
  grid.innerHTML='<div class="local-v3-state">جاري تحميل المنتجات...</div>';
  try{
    const{store,products}=await fetchStoreBundle(storeId);
    saveCache(storeId,store,products);
    renderCards(grid,store,products);
  }catch(error){
    console.error('Local storefront V3 load error:',error);
    const cached=readCache(storeId);
    if(cached){
      renderCards(grid,cached.store,cached.products,{fromCache:true});
      return;
    }
    const message=error?.message||String(error);
    grid.innerHTML=`<div class="local-v3-debug-error">حدث خطأ أثناء جلب المنتجات: ${esc(message)}<br><button type="button" class="local-v3-retry">إعادة المحاولة</button></div>`;
    grid.querySelector('.local-v3-retry')?.addEventListener('click',()=>renderStoreProductsV3(storeId));
  }
}

window.loadLocalStoreProductsV3=renderStoreProductsV3;
const originalLoadStoreDetails=window.loadStoreDetails;
window.loadStoreDetails=async function(storeId){const result=typeof originalLoadStoreDetails==='function'?await originalLoadStoreDetails(storeId):undefined;await renderStoreProductsV3(storeId);return result};
renderStoreProductsV3();
window.addEventListener('load',()=>setTimeout(()=>renderStoreProductsV3(),80),{once:true});