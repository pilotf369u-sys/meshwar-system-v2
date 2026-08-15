const SUPABASE_URL='https://hsmmbloouskqdnptiiad.supabase.co';
const SUPABASE_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
const CACHE_PREFIX='meshwar_local_store_cache_v3_';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:0});
const ceilPrice=v=>Math.ceil(Number(v));
const placeholder='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#94a3b8" font-family="Arial" font-size="34" text-anchor="middle">PRODUCT</text></svg>');

const style=document.createElement('style');
style.textContent=`
#localStoreProductsGrid{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),1fr))!important;gap:18px!important;align-items:stretch!important;grid-auto-rows:auto!important;overflow:visible!important;width:100%!important}
.local-v3-card{position:relative!important;display:flex!important;flex-direction:column!important;height:auto!important;min-width:0!important;overflow:hidden!important;border-radius:18px!important;border:1px solid rgba(251,191,36,.28)!important;background:rgba(255,255,255,.06)!important}
.local-v3-img-wrap{width:100%!important;height:200px!important;display:flex!important;align-items:center!important;justify-content:center!important;background:rgba(255,255,255,.03)!important;padding:10px!important;box-sizing:border-box!important;overflow:hidden!important}
.local-v3-img{display:block!important;width:auto!important;height:auto!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;border-radius:0!important;margin:0!important;padding:0!important;background:transparent!important}
.local-v3-body{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;padding:15px!important;min-height:220px!important;text-align:right!important}
.local-v3-name{font-size:1.1rem!important;font-weight:900!important;color:#ffffff!important;margin-bottom:6px!important}.local-v3-desc{font-size:.9rem!important;color:#f1f5f9!important;line-height:1.4!important;min-height:20px!important;margin-top:3px!important}
.local-v3-price{margin-top:12px!important;padding:12px!important;border-radius:12px!important;background:rgba(14,165,233,.10)!important;border:1px solid rgba(56,189,248,.24)!important}.local-v3-old-row{display:block!important;margin-bottom:10px!important;padding-bottom:8px!important;border-bottom:1px solid rgba(148,163,184,.16)!important}.local-v3-old{display:inline-block!important;color:#94a3b8!important;font-size:12px!important;text-decoration:line-through!important;text-decoration-thickness:2px!important;text-decoration-color:#94a3b8!important}.local-v3-discount-badge{position:absolute!important;top:14px!important;right:14px!important;z-index:4!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;padding:4px 10px!important;border-radius:6px!important;background:#ef4444!important;color:white!important;font-size:12px!important;font-weight:900!important;box-shadow:0 2px 10px rgba(239,68,68,.4)!important;white-space:nowrap!important}.local-v3-local{font-size:21px!important;font-weight:900!important;color:#fbbf24!important}.local-v3-note{display:block!important;margin-top:5px!important;color:#94a3b8!important;font-size:10px!important;font-weight:700!important}.local-v3-money{direction:ltr!important;unicode-bidi:isolate!important;display:inline-block!important;white-space:nowrap!important}
.local-v3-order{display:flex!important;width:100%!important;min-height:48px!important;margin-top:16px!important;padding:12px 14px!important;align-items:center!important;justify-content:center!important;border-radius:12px!important;border:1px solid rgba(96,165,250,.65)!important;background:linear-gradient(90deg,#2563eb,#4f46e5)!important;color:#fff!important;font-weight:700!important;cursor:pointer!important;box-shadow:0 10px 28px rgba(37,99,235,.35)!important;transition:transform .2s ease,box-shadow .2s ease!important}.local-v3-order:hover{transform:translateY(-2px)!important;box-shadow:0 14px 34px rgba(37,99,235,.48)!important}.local-v3-order:disabled{opacity:.45!important;cursor:not-allowed!important}
.local-v3-state{grid-column:1/-1!important;padding:28px 18px!important;border-radius:16px!important;border:1px solid rgba(148,163,184,.18)!important;background:rgba(15,23,42,.38)!important;color:#cbd5e1!important;text-align:center!important}.local-v3-debug-error{grid-column:1/-1!important;padding:20px!important;border-radius:14px!important;border:1px solid rgba(248,113,113,.35)!important;background:rgba(127,29,29,.16)!important;color:#fca5a5!important;text-align:center!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important}.local-v3-retry{margin-top:12px!important;padding:9px 16px!important;border-radius:10px!important;border:1px solid rgba(56,189,248,.45)!important;background:rgba(14,165,233,.16)!important;color:#e0f2fe!important;font-weight:800!important;cursor:pointer!important}.local-v3-cache-note{grid-column:1/-1!important;margin-bottom:-6px!important;color:#fbbf24!important;font-size:11px!important;text-align:center!important}
@media(max-width:640px){#localStoreProductsGrid{grid-template-columns:1fr!important;gap:14px!important}.local-v3-img-wrap{height:180px!important}.local-v3-body{padding:13px!important}}
`;
document.head.appendChild(style);

const commissionRate=s=>{const n=Number(s?.commission_rate);return Number.isFinite(n)&&n>=0&&n<100?n/100:0.10};
const exchangeRate=s=>{const n=Number(s?.exchange_rate);return Number.isFinite(n)&&n>0?n:1};
const vendorPrice=p=>{const n=Number(p?.discount_price??p?.base_price);return Number.isFinite(n)&&n>=0?n:null};
const customerPriceUsd=(p,s)=>{const v=vendorPrice(p);return v===null?null:ceilPrice(v/(1-commissionRate(s)))};
const roundIqdCommercial=v=>Math.ceil(Number(v)/250)*250;
const customerPriceIqd=(p,s)=>{const usd=customerPriceUsd(p,s);return usd===null?null:roundIqdCommercial(usd*exchangeRate(s))};
const oldCustomerPriceIqd=(p,s)=>{if(p.discount_price==null||p.base_price==null||Number(p.discount_price)>=Number(p.base_price))return null;const oldUsd=ceilPrice(Number(p.base_price)/(1-commissionRate(s)));return roundIqdCommercial(oldUsd*exchangeRate(s))};
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
    restRequest(`local_products?select=id,product_name,image_url,description,base_price,discount_price,is_out_of_stock&store_id=eq.${encoded}&order=created_at.desc`,{timeout:3000})
  ]);
  const store=Array.isArray(stores)?stores[0]:null;
  if(!store)throw new Error('المتجر غير موجود أو غير نشط، أو أن RLS يمنع قراءته.');
  return{store,products:Array.isArray(products)?products:[]};
}

function renderCards(grid,store,products,{fromCache=false}={}){
  const cards=(products||[]).map(p=>{
    const iqd=customerPriceIqd(p,store),oldIqd=oldCustomerPriceIqd(p,store),unavailable=!!p.is_out_of_stock||iqd===null;
    const hasDiscount=oldIqd!==null;
    const old=hasDiscount?`<div class="local-v3-old-row"><span class="local-v3-old"><span class="local-v3-money" dir="ltr">${esc(iqdLabel(oldIqd))}</span></span></div>`:'';
    const badge=hasDiscount?'<span class="local-v3-discount-badge">خصم</span>':'';
    return `<article class="local-v3-card">${badge}<div class="local-v3-img-wrap"><img class="local-v3-img" src="${esc(p.image_url||placeholder)}" onerror="this.onerror=null;this.src='${esc(placeholder)}'" alt="${esc(p.product_name||'منتج')}"></div><div class="local-v3-body"><div class="local-v3-name">${esc(p.product_name||'منتج')}</div><div class="local-v3-desc">${esc(p.description||'')}</div><div class="local-v3-price">${unavailable?'غير متوفر حالياً':`${old}<div class="local-v3-local"><span class="local-v3-money" dir="ltr">${esc(iqdLabel(iqd))}</span></div><small class="local-v3-note">السعر شامل هامش MeshWar — التوصيل يحدد لاحقاً</small>`}</div><button type="button" class="local-v3-order" ${unavailable?'disabled':''} data-pid="${esc(p.id)}">${unavailable?'غير متوفر حالياً':'🛒 اطلب الآن'}</button></div></article>`;
  }).join('');
  grid.innerHTML=`${fromCache?'<div class="local-v3-cache-note">يتم عرض نسخة محفوظة مؤقتاً بسبب تعذر الاتصال المباشر.</div>':''}${cards||'<div class="local-v3-state">لا توجد منتجات مضافة لهذا المتجر حالياً.</div>'}`;
  grid.querySelectorAll('.local-v3-order[data-pid]').forEach(btn=>btn.addEventListener('click',()=>{const p=(products||[]).find(x=>String(x.id)===String(btn.dataset.pid));if(p)createOrder(p,store)}));
}

async function createOrder(product,store){
  const customerId=String(localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId')||'').trim();
  if(!customerId){alert('الرجاء تسجيل الدخول أولاً لإرسال الطلب.');location.href='login.html';return}
  try{
    const customerRows=await restRequest(`customers?select=id,name,phone&id=eq.${encodeURIComponent(customerId)}&limit=1`,{timeout:3000});
    const customer=Array.isArray(customerRows)?customerRows[0]:null;if(!customer)throw new Error('تعذر العثور على بيانات العميل.');
    const rows=await restRequest('orders?select=order_code&order=created_at.desc&limit=1000',{timeout:3000});
    const vendor=vendorPrice(product),usd=customerPriceUsd(product,store),iqd=customerPriceIqd(product,store);if(vendor===null||usd===null||iqd===null)throw new Error('سعر المنتج غير صالح.');
    let max=1000;(rows||[]).forEach(r=>{const m=String(r.order_code||'').match(/^MW-(\d+)$/i);if(m)max=Math.max(max,Number(m[1]))});const orderCode='MW-'+(max+1);
    const payload={order_code:orderCode,customer_id:customer.id,customer_name:customer.name||'',customer_phone:customer.phone||'',total_price:ceilPrice(iqd),currency:'IQD',details:{source:'local_store',store_id:store.id,store_name:store.store_name||'',product_id:String(product.id),product_name:product.product_name||'',vendor_price_usd:vendor,commission_rate:Number(store.commission_rate||10),customer_price_usd:ceilPrice(usd),exchange_rate:exchangeRate(store),customer_price_local:ceilPrice(iqd),local_currency:'IQD',quantity:1},order_url:'index.html?storeId='+encodeURIComponent(store.id),image_url:product.image_url||null,status:'انتظار رد الموظف'};
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