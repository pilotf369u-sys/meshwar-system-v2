import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const sb=createClient('https://hsmmbloouskqdnptiiad.supabase.co','sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=v=>Number(v||0).toLocaleString('en-US',{maximumFractionDigits:0});
const placeholder='data:image/svg+xml;charset=UTF-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420"><rect width="100%" height="100%" fill="#0f172a"/><text x="50%" y="50%" fill="#94a3b8" font-family="Arial" font-size="34" text-anchor="middle">PRODUCT</text></svg>');

const style=document.createElement('style');
style.textContent=`
#localStoreProductsGrid{display:grid!important;grid-template-columns:repeat(1,minmax(0,1fr))!important;gap:18px!important;align-items:stretch!important;overflow:visible!important}
.local-v2-card{display:flex!important;flex-direction:column!important;min-width:0!important;height:auto!important;overflow:hidden!important;border-radius:18px!important;border:1px solid rgba(251,191,36,.28)!important;background:rgba(255,255,255,.06)!important;box-shadow:0 14px 36px rgba(2,6,23,.24)!important}
.local-v2-img-wrap{width:100%!important;height:200px!important;display:flex!important;align-items:center!important;justify-content:center!important;background:rgba(255,255,255,.03)!important;border-radius:18px 18px 0 0!important;padding:10px!important;box-sizing:border-box!important;overflow:hidden!important}
.local-v2-img{display:block!important;width:auto!important;height:auto!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;border-radius:0!important;margin:0!important;padding:0!important;background:transparent!important;box-shadow:none!important}
.local-v2-body{display:flex!important;flex-direction:column!important;flex:1 1 auto!important;padding:15px!important;min-height:220px!important;text-align:right!important}
.local-v2-name{font-size:17px!important;font-weight:900!important;color:#fff!important;margin-bottom:5px!important}.local-v2-desc{font-size:12px!important;color:#94a3b8!important;line-height:1.7!important;min-height:20px!important}
.local-v2-price{margin-top:12px!important;padding:12px!important;border-radius:12px!important;background:rgba(14,165,233,.10)!important;border:1px solid rgba(56,189,248,.24)!important}.local-v2-old{display:block!important;margin-bottom:10px!important;padding-bottom:8px!important;border-bottom:1px solid rgba(148,163,184,.16)!important;color:#94a3b8!important;font-size:12px!important;line-height:1.6!important;text-decoration:line-through!important;text-decoration-thickness:2px!important;text-decoration-color:#fb7185!important}.local-v2-local{margin-top:3px!important;font-size:21px!important;font-weight:900!important;color:#fbbf24!important}.local-v2-note{display:block!important;margin-top:5px!important;color:#94a3b8!important;font-size:10px!important;font-weight:700!important}
.local-v2-money{direction:ltr!important;unicode-bidi:isolate!important;display:inline-block!important;white-space:nowrap!important;text-align:left!important}
.local-v2-order{display:flex!important;width:100%!important;min-height:46px!important;margin-top:16px!important;padding:11px 14px!important;align-items:center!important;justify-content:center!important;border-radius:12px!important;border:1px solid rgba(251,191,36,.55)!important;background:linear-gradient(90deg,#0284c7,#4f46e5)!important;color:#fff!important;font-weight:900!important;cursor:pointer!important;box-sizing:border-box!important;visibility:visible!important}.local-v2-order:disabled{opacity:.45!important;cursor:not-allowed!important}
@media(min-width:700px){#localStoreProductsGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(min-width:1100px){#localStoreProductsGrid{grid-template-columns:repeat(3,minmax(0,1fr))!important}}@media(max-width:640px){.local-v2-img-wrap{height:180px!important}}
`;
document.head.appendChild(style);

const rateOf=s=>{const n=Number(s?.commission_rate);return Number.isFinite(n)&&n>=0&&n<100?n:10};
const fxOf=s=>{const n=Number(s?.exchange_rate);return Number.isFinite(n)&&n>0?n:1};
const curOf=s=>String(s?.exchange_target_currency||s?.default_currency||'IQD').trim().toUpperCase()||'IQD';
const vendorUsd=p=>{const n=Number(p?.discount_price??p?.base_price);return Number.isFinite(n)&&n>=0?n:null};
const customerUsd=(p,s)=>{const v=vendorUsd(p);return v===null?null:Math.ceil(v/(1-rateOf(s)/100))};
const localPrice=(usd,s)=>usd===null?null:(curOf(s)==='USD'?Math.ceil(usd):Math.ceil(usd*fxOf(s)));
const oldCustomerUsd=(p,s)=>p.discount_price!=null&&p.base_price!=null&&Number(p.discount_price)<Number(p.base_price)?Math.ceil(Number(p.base_price)/(1-rateOf(s)/100)):null;
const moneyLabel=(value,currency)=>`${String(currency||'').toUpperCase()} ${fmt(value)}`;

async function createOrder(product,store){
  const customerId=String(localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId')||'').trim();
  if(!customerId){alert('الرجاء تسجيل الدخول أولاً لإرسال الطلب.');location.href='login.html';return}
  try{
    const [{data:customer,error:ce},{data:rows,error:oe}]=await Promise.all([
      sb.from('customers').select('id,name,phone').eq('id',customerId).single(),
      sb.from('orders').select('order_code').not('order_code','is',null).order('created_at',{ascending:false}).limit(1000)
    ]);
    if(ce)throw ce;if(oe)throw oe;
    const v=vendorUsd(product),usd=customerUsd(product,store),local=localPrice(usd,store),cur=curOf(store);if(v===null||usd===null||local===null)throw new Error('سعر المنتج غير صالح.');
    let max=1000;(rows||[]).forEach(r=>{const m=String(r.order_code||'').match(/^MW-(\d+)$/i);if(m)max=Math.max(max,Number(m[1]))});const orderCode='MW-'+(max+1);
    const payload={order_code:orderCode,customer_id:customer.id,customer_name:customer.name||'',customer_phone:customer.phone||'',total_price:local,currency:cur,details:{source:'local_store',store_id:store.id,store_name:store.store_name||'',product_id:String(product.id),product_name:product.product_name||'',vendor_price_usd:v,commission_rate:rateOf(store),platform_margin_usd:usd-v,customer_price_usd:usd,exchange_rate:fxOf(store),customer_price_local:local,local_currency:cur,quantity:1},order_url:'index.html?storeId='+encodeURIComponent(store.id),image_url:product.image_url||null,status:'انتظار رد الموظف'};
    const{error}=await sb.from('orders').insert([payload]);if(error)throw error;
    alert('تم إرسال الطلب بنجاح. السعر: '+moneyLabel(local,cur)+' — رقم الطلب: '+orderCode);location.href='dashboard.html?customerId='+encodeURIComponent(customer.id);
  }catch(e){console.error(e);alert('تعذر إرسال الطلب: '+(e.message||e))}
}

async function renderLocalStoreV2(){
  const storeId=new URLSearchParams(location.search).get('storeId');const grid=document.getElementById('localStoreProductsGrid');if(!storeId||!grid)return;
  try{
    const [{data:store,error:se},{data:products,error:pe}]=await Promise.all([
      sb.from('local_stores').select('id,store_name,commission_rate,default_currency,exchange_rate,exchange_target_currency,status').eq('id',storeId).eq('status','active').single(),
      sb.from('local_products').select('id,product_name,image_url,description,base_price,discount_price,is_out_of_stock').eq('store_id',storeId).order('created_at',{ascending:false})
    ]);if(se)throw se;if(pe)throw pe;
    const cur=curOf(store);grid.innerHTML=(products||[]).map(p=>{const usd=customerUsd(p,store),local=localPrice(usd,store),oldUsd=oldCustomerUsd(p,store),oldLocal=oldUsd===null?null:localPrice(oldUsd,store),unavailable=!!p.is_out_of_stock||usd===null||local===null;const old=oldLocal===null?'':`<span class="local-v2-old"><span class="local-v2-money" dir="ltr">${esc(moneyLabel(oldLocal,cur))}</span></span>`;return `<article class="local-v2-card"><div class="local-v2-img-wrap"><img class="local-v2-img" src="${esc(p.image_url||placeholder)}" onerror="this.onerror=null;this.src='${esc(placeholder)}'" alt="${esc(p.product_name||'منتج')}"></div><div class="local-v2-body"><div class="local-v2-name">${esc(p.product_name||'منتج')}</div><div class="local-v2-desc">${esc(p.description||'')}</div><div class="local-v2-price">${unavailable?'غير متوفر حالياً':`${old}<div class="local-v2-local"><span class="local-v2-money" dir="ltr">${esc(moneyLabel(local,cur))}</span></div><small class="local-v2-note">السعر شامل هامش MeshWar — التوصيل يحدد لاحقاً</small>`}</div><button type="button" class="local-v2-order" ${unavailable?'disabled':''} data-pid="${esc(p.id)}">${unavailable?'غير متوفر حالياً':'🛒 اطلب الآن'}</button></div></article>`}).join('')||'<div class="local-empty">لا توجد منتجات مضافة لهذا المتجر حالياً.</div>';
    grid.querySelectorAll('.local-v2-order[data-pid]').forEach(btn=>btn.addEventListener('click',()=>{const p=(products||[]).find(x=>String(x.id)===String(btn.dataset.pid));if(p)createOrder(p,store)}));
  }catch(e){console.error('Local storefront V2 error:',e)}
}

renderLocalStoreV2();
window.addEventListener('load',()=>setTimeout(renderLocalStoreV2,100),{once:true});
setTimeout(renderLocalStoreV2,500);
