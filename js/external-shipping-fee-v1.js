/* MESHWAR_EXTERNAL_SHIPPING_FEE_V1 */
(function(){
'use strict';
const VERSION='20260825-v1';
const script=document.currentScript,screen=String(script?.dataset?.meshwarScreen||'').trim().toLowerCase();
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const fee=o=>Math.max(0,n(o?.external_shipping_fee));
const localFee=o=>Math.max(0,n(o?.delivery_fee));
const product=o=>Math.max(0,n(o?.total_price));
const currency=o=>String(o?.external_shipping_currency||o?.currency||'USD');
const pay=o=>String(o?.delivery_payment_type||'cod_full');
function gross(o){return product(o)+fee(o)+localFee(o)}
function due(o){const t=pay(o);if(t==='paid_prepaid')return 0;if(t==='product_paid_delivery_cod')return fee(o)+localFee(o);return gross(o)}
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function currencyOptions(selected,base){const list=['USD','IQD','TRY','TL','SYP','EUR','$','€'],cur=String(selected||base||'USD');return [...new Set([cur,...list])].map(x=>`<option value="${esc(x)}" ${x===cur?'selected':''}>${esc(x)}</option>`).join('')}
async function sbForEmployee(){return typeof window.ensureEmployeeSupabase==='function'?window.ensureEmployeeSupabase():null}
async function sbForAdmin(){return typeof window.ensureCustomerSupabase==='function'?window.ensureCustomerSupabase():null}
function installEmployee(){
  if(typeof window.doorCollectionAmount==='function')window.doorCollectionAmount=due;
  if(typeof window.orderRowHtml==='function'&&!window.__mwExternalEmployeeRow){
    const base=window.orderRowHtml;
    window.orderRowHtml=function(o){let html=base(o),id=encodeURIComponent(String(o?.id??'')),block=`<div class="money-wrap" data-external-shipping="${id}" style="margin-top:6px"><label class="mini" style="font-weight:900;width:100%">أجور شحن خارجي</label><input id="externalFee-${id}" type="number" min="0" step="0.01" value="${esc(fee(o)||'')}" placeholder="0" style="width:92px" ${typeof window.can==='function'&&!window.can('pricing')?'disabled':''}><select id="externalCurrency-${id}" ${typeof window.can==='function'&&!window.can('pricing')?'disabled':''}>${currencyOptions(o?.external_shipping_currency,o?.currency)}</select></div>`;return html.replace('<span class="collect-due">',block+'<span class="collect-due">')};
    window.__mwExternalEmployeeRow=true;
  }
  if(typeof window.saveOrderRow==='function'&&!window.__mwExternalEmployeeSave){
    const base=window.saveOrderRow;
    window.saveOrderRow=async function(encodedId){const raw=document.getElementById('externalFee-'+encodedId)?.value??'0',value=Number(raw),cur=document.getElementById('externalCurrency-'+encodedId)?.value||document.getElementById('currency-'+encodedId)?.value||'USD';if(!Number.isFinite(value)||value<0)return alert('أجور الشحن الخارجي يجب أن تكون رقماً صحيحاً أكبر من أو يساوي صفر.');const id=decodeURIComponent(encodedId),sb=await sbForEmployee(),extSave=sb?sb.from('orders').update({external_shipping_fee:value,external_shipping_currency:cur}).eq('id',id):Promise.resolve({error:new Error('Supabase unavailable')});const result=await base(encodedId),saved=await extSave;if(saved?.error)return alert('تم حفظ بيانات الطلب لكن تعذر حفظ أجور الشحن الخارجي: '+saved.error.message);try{await window.loadPipelineOrders?.()}catch(e){console.warn(e)}return result};
    window.__mwExternalEmployeeSave=true;
  }
  if(typeof window.openEmployeeUnifiedBranchManifest==='function')window.openEmployeeUnifiedBranchManifest=function(mode){const branchId=String(document.getElementById('branchFilter')?.value||'').trim();if(!branchId)return alert('اختر فرعاً محدداً');const employeeId=new URLSearchParams(location.search).get('employeeId')||'';window.open(`external-shipping-shell.html?screen=manifest&branchId=${encodeURIComponent(branchId)}&employeeId=${encodeURIComponent(employeeId)}&mode=${encodeURIComponent(mode||'')}`,'_blank')};
  try{window.loadPipelineOrders?.()}catch(e){console.warn(e)}
}
function installAdmin(){
  if(typeof window.doorCollection==='function')window.doorCollection=due;
  if(typeof window.adminOrderRow==='function'&&!window.__mwExternalAdminRow){
    const base=window.adminOrderRow;
    window.adminOrderRow=function(o){let html=base(o),id=encodeURIComponent(String(o?.id??'')),block=`<div data-external-shipping="${id}" style="margin-top:6px"><label class="mini" style="display:block;font-weight:900">أجور شحن خارجي</label><input id="adminExternalFee-${id}" type="number" min="0" step="0.01" value="${esc(fee(o)||'')}" placeholder="0" style="width:90px"><select id="adminExternalCurrency-${id}">${currencyOptions(o?.external_shipping_currency,o?.currency)}</select></div>`;return html.replace('<br><select id="adminPay-',block+'<br><select id="adminPay-')};
    window.__mwExternalAdminRow=true;
  }
  if(typeof window.saveAdminOrderRow==='function'&&!window.__mwExternalAdminSave){
    const base=window.saveAdminOrderRow;
    window.saveAdminOrderRow=async function(encodedId){const raw=document.getElementById('adminExternalFee-'+encodedId)?.value??'0',value=Number(raw),cur=document.getElementById('adminExternalCurrency-'+encodedId)?.value||document.getElementById('adminCurrency-'+encodedId)?.value||'USD';if(!Number.isFinite(value)||value<0)return alert('أجور الشحن الخارجي يجب أن تكون رقماً صحيحاً أكبر من أو يساوي صفر.');const id=decodeURIComponent(encodedId),sb=await sbForAdmin(),extSave=sb?sb.from('orders').update({external_shipping_fee:value,external_shipping_currency:cur}).eq('id',id):Promise.resolve({error:new Error('Supabase unavailable')});const result=await base(encodedId),saved=await extSave;if(saved?.error)return alert('تم حفظ بيانات الطلب لكن تعذر حفظ أجور الشحن الخارجي: '+saved.error.message);try{await window.loadAdminOrders?.()}catch(e){console.warn(e)}return result};
    window.__mwExternalAdminSave=true;
  }
  if(typeof window.openAdminUnifiedBranchManifest==='function')window.openAdminUnifiedBranchManifest=function(mode){const branchId=String(document.getElementById('adminBranchFilter')?.value||'').trim();if(!branchId)return alert('اختر فرعاً محدداً');const adminId=new URLSearchParams(location.search).get('adminId')||'';window.open(`external-shipping-shell.html?screen=manifest&branchId=${encodeURIComponent(branchId)}&adminId=${encodeURIComponent(adminId)}&mode=${encodeURIComponent(mode||'')}`,'_blank')};
  try{window.loadAdminOrders?.()}catch(e){console.warn(e)}
}
function installManifest(){
  if(typeof window.doorCollection==='function')window.doorCollection=due;
  if(typeof window.loadManifest==='function'&&!window.__mwExternalManifest){
    const base=window.loadManifest;
    window.loadManifest=async function(){const r=await base();const table=document.getElementById('manifestTable'),head=table?.tHead?.rows?.[0];if(!head||head.querySelector('[data-external-total-head]'))return r;const th=document.createElement('th');th.textContent='الإجمالي الكلي';th.dataset.externalTotalHead='1';head.insertBefore(th,head.cells[12]||null);const rows=Array.isArray(window.manifestRows)?window.manifestRows:[];[...document.querySelectorAll('#manifestBody tr')].forEach((tr,i)=>{const o=rows[i];if(!o||tr.cells.length<12)return;const td=tr.insertCell(12);td.contentEditable='true';td.className='editable-cell';td.textContent=Number(gross(o)).toFixed(2)+' '+String(o.currency||currency(o))});return r};
    window.__mwExternalManifest=true;
  }
  try{window.loadManifest?.()}catch(e){console.warn(e)}
}
function installBranch(){
  if(typeof window.doorCollection==='function')window.doorCollection=due;
  if(typeof window.netCustody==='function')window.netCustody=due;
  try{window.loadOrders?.();window.loadAccounting?.()}catch(e){console.warn(e)}
}
function installDelivery(){
  for(const name of ['doorCollection','doorCollectionAmount','collectionAmount','amountToCollect','collectAmount'])if(typeof window[name]==='function')window[name]=due;
  for(const name of ['loadOrders','loadShipments','renderOrders','renderShipments','refreshOrders'])try{window[name]?.()}catch(e){console.warn(e)}
}
function installCustomer(){
  if(typeof window.openCustomerOrderDetails==='function'&&!window.__mwExternalCustomerDetails){
    const base=window.openCustomerOrderDetails;
    window.openCustomerOrderDetails=function(i){const r=base(i),o=window.currentCustomerOrdersGlobal?.[i],box=document.getElementById('customerOrderDetailsContent');if(!o||!box)return r;const cur=String(o.currency||currency(o)),ext=fee(o),total=product(o)+ext;const marker=document.createElement('div');marker.dataset.externalShippingInvoice='1';marker.innerHTML=`<hr style="border:0;border-top:1px solid rgba(148,163,184,.3);margin:12px 0"><p><b>سعر السلعة:</b> ${product(o).toFixed(2)} ${esc(cur)}</p><p><b>أجور الشحن الخارجي:</b> ${ext.toFixed(2)} ${esc(currency(o))}</p><p><b>المجموع الكلي:</b> ${total.toFixed(2)} ${esc(cur)}</p>`;box.querySelector('[data-external-shipping-invoice]')?.remove();box.appendChild(marker);return r};
    window.__mwExternalCustomerDetails=true;
  }
}
if(screen==='employee')installEmployee();else if(screen==='admin')installAdmin();else if(screen==='manifest')installManifest();else if(screen==='branch')installBranch();else if(screen==='delivery')installDelivery();else if(screen==='customer')installCustomer();
window.MeshwarExternalShippingV1={VERSION,gross,due,fee,currency};
})();
