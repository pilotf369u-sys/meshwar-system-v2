/* Vendor order indicators only; no status, shipping or inventory mutations. */

function vendorElapsedTimeV66(created,now=Date.now()){
 const time=Date.parse(created);
 if(!Number.isFinite(time))return '';
 const minutes=Math.max(0,Math.floor((now-time)/60000));
 return [Math.floor(minutes/1440),Math.floor(minutes/60)%24,minutes%60].map(n=>String(n).padStart(2,'0')).join(' : ');
}
function vendorOrderAgeV66(o){
 const age=vendorElapsedTimeV66(o.created_at);
 if(!age)return '';
 return `<button type="button" class="vendor-order-age-v66" dir="ltr" data-order-created-v66="${esc(o.created_at)}" aria-label="عمر الطلب: يوم، ساعة، دقيقة. عرض تاريخ الطلب" aria-expanded="false">${age}</button>`;
}
(()=>{
 let popup=null,owner=null;
 function close(){popup?.remove();popup=null;if(owner)owner.setAttribute('aria-expanded','false');owner=null}
 document.addEventListener('click',event=>{
  const button=event.target.closest?.('[data-order-created-v66]');
  if(!button){if(!popup?.contains(event.target))close();return}
  if(owner===button){close();return}
  close();owner=button;button.setAttribute('aria-expanded','true');
  popup=document.createElement('div');popup.className='vendor-order-date-v66';popup.setAttribute('role','status');
  const date=new Date(button.dataset.orderCreatedV66);
  const formatted=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
  popup.textContent='تاريخ الطلب — '+formatted+' (توقيت تركيا)';
  document.body.appendChild(popup);
  const rect=button.getBoundingClientRect(),width=popup.offsetWidth;
  popup.style.left=Math.max(12,Math.min(innerWidth-width-12,rect.left+(rect.width-width)/2))+'px';
  popup.style.top=Math.max(12,Math.min(innerHeight-popup.offsetHeight-12,rect.bottom+5))+'px';
 });
 document.addEventListener('keydown',event=>{if(event.key==='Escape')close()});
 window.addEventListener('resize',close);
 document.addEventListener('scroll',close,true);
 setInterval(()=>document.querySelectorAll('[data-order-created-v66]').forEach(button=>{
  button.textContent=vendorElapsedTimeV66(button.dataset.orderCreatedV66);
 }),60000);
})();

(()=>{
 const runtime=window.MeshwarVendorRuntime;if(!runtime)return;
 const style=document.createElement('style');style.textContent="\n.vendor-order-age-v66{display:block!important;width:100%;border:0!important;background:transparent!important;color:#f6dc8b!important;font:500 12px/1.5 system-ui!important;font-variant-numeric:tabular-nums;letter-spacing:1px;padding:0 2px 7px!important;margin:0!important;white-space:nowrap!important;cursor:pointer}\nhtml.light .vendor-order-age-v66{color:#713f12!important}\n.vendor-order-date-v66{position:fixed;z-index:10000;max-width:calc(100vw - 24px);padding:12px 16px;border:1px solid #a88b45;border-radius:12px;background:#102433;color:#f6dc8b;box-shadow:0 8px 24px #0005;font:500 13px/1.7 system-ui;text-align:center}\nhtml.light .vendor-order-date-v66{background:#fffaf0;color:#713f12}\n\n.vendor-order-icons-v66{display:flex;justify-content:center;align-items:center;gap:4px;margin-bottom:5px}\n.vendor-order-icons-v66:empty{display:none}\n.vendor-order-icons-v66 button{border:0!important;background:transparent!important;color:#dc2626!important;font-size:22px!important;line-height:1.2;padding:3px 5px!important;cursor:pointer}\n.vendor-order-icons-v66 span{font-size:22px;line-height:1.2;padding:3px 5px}\n#ordersBody .vendor-order-age-v66{margin-bottom:3px!important}\n";document.head.appendChild(style);
 function icons(o){
  const d=(()=>{try{return typeof o.details==='string'?JSON.parse(o.details||'{}'):(o.details||{})}catch{return{}}})();
  const closed=o._v94Paid||[d.bundle_stock_lifecycle_state,d.local_stock_lifecycle_state,d.stock_lifecycle_state].includes('deducted')||['تم التسديد','قيد الطلب','مخزن الشركة','مخزن شركة','تجهيز شحن','تم الشحن','مخزن محلي','مندوب','جاري التوصيل مع المندوب','توزيع داخلي','تم التسليم','رفض التسليم','رفض الطلب','مرفوض','راجع','ملغي من قبل العميل'].includes(String(o.status||'').trim());
  const shortage=!closed&&(o._stockShortagesV53?.length||d.stock_adjustment_v58);
  const campaign=d.deal_campaign_id||o._v66CampaignId;
  return (shortage?'<button type="button" data-vendor-stock-v66="'+esc(o.id)+'" title="نقص في المخزون — فتح تفاصيل الطلب" aria-label="نقص في المخزون — فتح تفاصيل الطلب">⚠</button>':'')+(campaign?'<span title="طلب عروض" aria-label="طلب عروض" tabindex="0">🎁</span>':'');
 }
 function decorate(){
  const body=document.getElementById('ordersBody');if(!body)return;
  for(const row of body.querySelectorAll('tr')){
   const id=row.dataset.vendorSegmentId||row.dataset.vendorOrderId;
   const o=runtime.getOrders().find(o=>String(o.id)===String(id));if(!o)continue;
   const cell=row.querySelector('[data-label="الحالة"]');
   if(cell){let slot=cell.querySelector('.vendor-order-icons-v66');if(!slot){slot=document.createElement('div');slot.className='vendor-order-icons-v66';cell.prepend(slot)}const markup=icons(o);if(slot.innerHTML!==markup)slot.innerHTML=markup}
   const action=row.querySelector('[data-label="الإجراء"]');
   if(action&&!action.querySelector('[data-order-created-v66]'))action.insertAdjacentHTML('afterbegin',vendorOrderAgeV66(o));
  }
 }
 let busy=false,pending=false;
 async function refresh(){
  decorate();if(document.hidden)return;if(busy){pending=true;return}
  const api=window.KintoBundleV93;if(!api?.refreshStockWarnings)return;
  const orders=runtime.getOrders().filter(o=>!o._v94Paid);if(!orders.length)return;
  busy=true;try{
   try{await api.refreshStockWarnings(orders)}catch{for(let i=0;i<orders.length;i+=4)await Promise.allSettled(orders.slice(i,i+4).map(o=>api.refreshStockWarnings([o])))}
   decorate();
  }catch(e){console.warn('Vendor stock indicators unavailable',e)}finally{busy=false;if(pending){pending=false;refresh()}}
 }
 document.addEventListener('click',event=>{const button=event.target.closest?.('[data-vendor-stock-v66]');if(button)window.openV94VendorOrderDetails?window.openV94VendorOrderDetails(button.dataset.vendorStockV66):window.openVendorOrderDetails(button.dataset.vendorStockV66)});
 const body=document.getElementById('ordersBody');if(body)new MutationObserver(refresh).observe(body,{childList:true});
 refresh();setInterval(refresh,20000);
 window.MeshwarVendorOrderIndicatorsV66={decorate,icons};
})();
