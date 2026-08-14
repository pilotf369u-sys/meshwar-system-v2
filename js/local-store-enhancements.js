import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const sb=createClient('https://hsmmbloouskqdnptiiad.supabase.co','sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH');
let currentStoreId='',currentStore=null,currentProducts=[];

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const placeholder='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#94a3b8" font-family="Arial" font-size="34" text-anchor="middle">PRODUCT</text></svg>');

const style=document.createElement('style');
style.textContent=`
#localStoreProductsGrid{
  display:grid!important;
  grid-template-columns:repeat(1,minmax(0,1fr))!important;
  gap:18px!important;
  align-items:stretch!important;
  grid-auto-rows:auto!important;
}
#localStoreProductsGrid .meshwar-local-product-card{
  min-width:0!important;
  min-height:0!important;
  height:auto!important;
  max-height:none!important;
  overflow:hidden!important;
  padding:0!important;
  border-radius:18px!important;
  border:1px solid rgba(251,191,36,.28)!important;
  background:rgba(255,255,255,.06)!important;
  display:flex!important;
  flex-direction:column!important;
  align-items:stretch!important;
  text-align:right!important;
  box-shadow:0 14px 36px rgba(2,6,23,.24)!important;
}
.meshwar-local-product-image{
  display:block!important;
  width:100%!important;
  height:230px!important;
  max-width:none!important;
  object-fit:cover!important;
  border-radius:0!important;
  margin:0!important;
  flex:0 0 auto!important;
  background:#0f172a!important;
}
.meshwar-local-product-body{
  display:flex!important;
  flex:1 1 auto!important;
  flex-direction:column!important;
  padding:15px!important;
  min-height:190px!important;
}
.meshwar-local-product-name{font-size:17px!important;font-weight:900!important;color:#fff!important;margin:0 0 5px!important;}
.meshwar-local-product-desc{font-size:12px!important;color:#94a3b8!important;line-height:1.7!important;min-height:20px!important;}
.meshwar-local-product-price{margin-top:12px!important;padding:11px 12px!important;border-radius:12px!important;background:rgba(14,165,233,.10)!important;border:1px solid rgba(56,189,248,.24)!important;}
.meshwar-local-product-price .usd{font-size:19px!important;font-weight:900!important;color:#67e8f9!important;}
.meshwar-local-product-price .local{margin-top:2px!important;font-size:17px!important;font-weight:900!important;color:#fbbf24!important;}
.meshwar-local-product-price small{display:block!important;margin-top:4px!important;color:#94a3b8!important;font-size:10px!important;font-weight:700!important;}
.meshwar-local-product-old{margin-top:5px!important;color:#64748b!important;font-size:11px!important;text-decoration:line-through!important;}
.meshwar-local-product-order{
  display:flex!important;
  width:100%!important;
  min-height:46px!important;
  margin-top:auto!important;
  padding:11px 14px!important;
  align-items:center!important;
  justify-content:center!important;
  border-radius:12px!important;
  border:1px solid rgba(251,191,36,.55)!important;
  background:linear-gradient(90deg,#0284c7,#4f46e5)!important;
  color:#fff!important;
  font-weight:900!important;
  cursor:pointer!important;
  box-sizing:border-box!important;
  visibility:visible!important;
}
.meshwar-local-product-order:disabled{opacity:.45!important;cursor:not-allowed!important;}
@media(min-width:700px){#localStoreProductsGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important;}}
@media(min-width:1100px){#localStoreProductsGrid{grid-template-columns:repeat(3,minmax(0,1fr))!important;}}
@media(max-width:640px){.meshwar-local-product-image{height:190px!important;}.meshwar-local-product-body{min-height:180px!important;}}
`;
document.head.appendChild(style);

function vendorPriceUsd(product){const n=Number(product?.discount_price??product?.base_price);return Number.isFinite(n)&&n>=0?n:null}
function commissionRate(store=currentStore){const n=Number(store?.commission_rate??10);return Number.isFinite(n)&&n>=0&&n<100?n:10}
function customerPriceUsd(product,store=currentStore){const base=vendorPriceUsd(product);if(base===null)return null;return Math.ceil(base/(1-commissionRate(store)/100))}
function exchangeRate(store=currentStore){const n=Number(store?.exchange_rate??1);return Number.isFinite(n)&&n>0?n:1}
function targetCurrency(store=currentStore){return String(store?.exchange_target_currency||store?.default_currency||'IQD').trim().toUpperCase()||'IQD'}
function customerLocalPrice(product,store=currentStore){const usd=customerPriceUsd(product,store);if(usd===null)return null;return targetCurrency(store)==='USD'?usd:Math.ceil(usd*exchangeRate(store))}
function formatInt(v){const n=Number(v);return Number.isFinite(n)?Math.ceil(n).toLocaleString('en-US'):'---'}

async function loadStoreContext(id){
  const storeId=String(id||'').trim();
  if(!storeId)return;
  const [{data:store,error:se},{data:products,error:pe}]=await Promise.all([
    sb.from('local_stores').select('id,store_name,commission_rate,default_currency,exchange_rate,exchange_base_currency,exchange_target_currency,status').eq('id',storeId).single(),
    sb.from('local_products').select('id,product_name,image_url,description,base_price,discount_price,is_out_of_stock').eq('store_id',storeId).order('created_at',{ascending:false})
  ]);
  if(se)throw se;
  if(pe)throw pe;
  currentStore=store||null;
  currentProducts=products||[];
}

function renderEnhancedProductCards(){
  const grid=document.getElementById('localStoreProductsGrid');
  if(!grid||!currentStoreId)return;
  if(!currentProducts.length){grid.innerHTML='<div class="local-empty">لا توجد منتجات مضافة لهذا المتجر حالياً.</div>';return}
  const localCurrency=targetCurrency(currentStore);
  grid.innerHTML=currentProducts.map(p=>{
    const finalUsd=customerPriceUsd(p,currentStore);
    const finalLocal=customerLocalPrice(p,currentStore);
    const vendorUsd=vendorPriceUsd(p);
    const unavailable=!!p.is_out_of_stock||finalUsd===null||finalLocal===null;
    const old=p.discount_price!=null&&p.base_price!=null?`<div class="meshwar-local-product-old">${formatInt(p.base_price)} $</div>`:'';
    return `<article class="meshwar-local-product-card">
      <img class="meshwar-local-product-image" src="${esc(p.image_url||placeholder)}" onerror="this.onerror=null;this.src='${esc(placeholder)}'" alt="${esc(p.product_name||'منتج')}">
      <div class="meshwar-local-product-body">
        <div class="meshwar-local-product-name">${esc(p.product_name||'منتج')}</div>
        <div class="meshwar-local-product-desc">${esc(p.description||'')}</div>
        <div class="meshwar-local-product-price">
          ${unavailable?'غير متوفر حالياً':`<div class="usd">${formatInt(finalUsd)} $</div><div class="local">${formatInt(finalLocal)} ${esc(localCurrency)}</div><small>السعر شامل هامش MeshWar — التوصيل يحدد لاحقاً</small>`}
          ${old}
        </div>
        <button type="button" class="meshwar-local-product-order" ${unavailable?'disabled':''} data-product-id="${esc(p.id)}">${unavailable?'غير متوفر حالياً':'🛒 اطلب الآن'}</button>
      </div>
    </article>`;
  }).join('');
  grid.querySelectorAll('.meshwar-local-product-order[data-product-id]').forEach(btn=>{
    btn.addEventListener('click',()=>{const p=currentProducts.find(x=>String(x.id)===String(btn.dataset.productId));if(p)placeOrder(p)});
  });
}

const oldOpen=window.openStore;
window.openStore=async function(url,id){
  currentStoreId=String(id||'').trim();
  if(currentStoreId){
    try{await loadStoreContext(currentStoreId)}catch(e){console.error('Local store pricing context error:',e);currentStore=null;currentProducts=[]}
  }
  const result=await oldOpen(url,id);
  if(currentStoreId)renderEnhancedProductCards();
  return result;
};

async function placeOrder(product){
  const customerId=String(localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId')||'').trim();
  if(!customerId){alert('الرجاء تسجيل الدخول أولاً لإرسال الطلب.');location.href='login.html';return}
  try{
    if(!currentStore||String(currentStore.id)!==String(currentStoreId))await loadStoreContext(currentStoreId);
    const [{data:customer,error:ce},{data:rows,error:oe}]=await Promise.all([
      sb.from('customers').select('id,name,phone').eq('id',customerId).single(),
      sb.from('orders').select('order_code').not('order_code','is',null).order('created_at',{ascending:false}).limit(1000)
    ]);
    if(ce)throw ce;
    if(oe)throw oe;
    const vendorUsd=vendorPriceUsd(product),finalUsd=customerPriceUsd(product,currentStore),rate=commissionRate(currentStore),fx=exchangeRate(currentStore),localCurrency=targetCurrency(currentStore),finalLocal=customerLocalPrice(product,currentStore);
    if(vendorUsd===null||finalUsd===null||finalLocal===null)throw new Error('سعر المنتج غير صالح.');
    let max=1000;
    (rows||[]).forEach(r=>{const m=String(r.order_code||'').match(/^MW-(\d+)$/i);if(m)max=Math.max(max,Number(m[1]))});
    const orderCode='MW-'+(max+1),platformMarginUsd=finalUsd-vendorUsd;
    const payload={
      order_code:orderCode,
      customer_id:customer.id,
      customer_name:customer.name||'',
      customer_phone:customer.phone||'',
      total_price:finalLocal,
      currency:localCurrency,
      details:{source:'local_store',store_id:currentStoreId,store_name:currentStore?.store_name||'',product_id:String(product.id),product_name:product.product_name||'',vendor_price_usd:vendorUsd,commission_rate:rate,platform_margin_usd:platformMarginUsd,customer_price_usd:finalUsd,exchange_rate:fx,customer_price_local:finalLocal,local_currency:localCurrency,quantity:1},
      order_url:'index.html?storeId='+encodeURIComponent(currentStoreId),
      image_url:product.image_url||null,
      status:'انتظار رد الموظف'
    };
    const{error}=await sb.from('orders').insert([payload]);
    if(error)throw error;
    alert('تم إرسال الطلب بنجاح. السعر: '+formatInt(finalUsd)+' $ / '+formatInt(finalLocal)+' '+localCurrency+' — رقم الطلب: '+orderCode);
    location.href='dashboard.html?customerId='+encodeURIComponent(customer.id);
  }catch(e){console.error(e);alert('تعذر إرسال الطلب: '+(e.message||e))}
}

const q=new URLSearchParams(location.search).get('storeId');
if(q){
  currentStoreId=q;
  try{await loadStoreContext(q);setTimeout(renderEnhancedProductCards,500)}catch(e){console.error('Initial local store pricing load error:',e)}
}
