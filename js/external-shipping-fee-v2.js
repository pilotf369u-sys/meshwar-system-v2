/* MESHWAR_EXTERNAL_SHIPPING_FEE_V2 */
(function(){
'use strict';
const VERSION='20260825-v2';
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
function topShell(targetScreen,params){const q=new URLSearchParams({screen:targetScreen,...params});return'external-shipping-shell.html?'+q.toString()}
async function employeeSb(){return typeof window.ensureEmployeeSupabase==='function'?window.ensureEmployeeSupabase():null}
async function adminSb(){return typeof window.ensureCustomerSupabase==='function'?window.ensureCustomerSupabase():null}

function installEmployee(){
  if(typeof window.doorCollectionAmount==='function')window.doorCollectionAmount=due;
  if(typeof window.orderRowHtml==='function'&&!window.__mwExternalEmployeeRowV2){
    const base=window.orderRowHtml;
    window.orderRowHtml=function(o){
      let html=base(o),id=encodeURIComponent(String(o?.id??''));
      const disabled=typeof window.can==='function'&&!window.can('pricing');
      const block=`<div class="money-wrap" data-external-shipping="${id}" style="margin-top:6px"><label class="mini" style="font-weight:900;width:100%">أجور شحن خارجي</label><input id="externalFee-${id}" type="number" min="0" step="0.01" value="${esc(fee(o)||'')}" placeholder="0" style="width:92px" ${disabled?'disabled':''}><select id="externalCurrency-${id}" ${disabled?'disabled':''}>${currencyOptions(o?.external_shipping_currency,o?.currency)}</select></div>`;
      return html.replace('<span class="collect-due">',block+'<span class="collect-due">');
    };
    window.__mwExternalEmployeeRowV2=true;
  }
  if(typeof window.saveOrderRow==='function'&&!window.__mwExternalEmployeeSaveV2){
    const base=window.saveOrderRow;
    window.saveOrderRow=async function(encodedId){
      const raw=document.getElementById('externalFee-'+encodedId)?.value??'0',value=Number(raw),cur=document.getElementById('externalCurrency-'+encodedId)?.value||document.getElementById('currency-'+encodedId)?.value||'USD';
      if(!Number.isFinite(value)||value<0)return alert('أجور الشحن الخارجي يجب أن تكون رقماً صحيحاً أكبر من أو يساوي صفر.');
      const id=decodeURIComponent(encodedId),sb=await employeeSb();
      if(!sb)return alert('تعذر الاتصال بقاعدة البيانات لحفظ أجور الشحن الخارجي.');
      const result=await base(encodedId),{error}=await sb.from('orders').update({external_shipping_fee:value,external_shipping_currency:cur}).eq('id',id);
      if(error)return alert('تم حفظ بيانات الطلب لكن تعذر حفظ أجور الشحن الخارجي: '+error.message);
      try{await window.loadPipelineOrders?.()}catch(e){console.warn(e)}
      return result;
    };
    window.__mwExternalEmployeeSaveV2=true;
  }
  window.openEmployeeUnifiedBranchManifest=function(mode){
    const branchId=String(document.getElementById('branchFilter')?.value||'').trim();if(!branchId)return alert('اختر فرعاً محدداً');
    const employeeId=new URLSearchParams(location.search).get('employeeId')||'';
    window.open(topShell('manifest',{branchId,employeeId,mode:mode||''}),'_blank');
  };
  if(typeof window.openCustomerPortal==='function')window.openCustomerPortal=function(encodedCustomerId){
    const customerId=decodeURIComponent(encodedCustomerId),employeeId=new URLSearchParams(location.search).get('employeeId')||'';
    window.top.location.href=topShell('customer',{customerId,employeeId,viewedBy:'employee'});
  };
  try{window.loadPipelineOrders?.()}catch(e){console.warn(e)}
}

function installAdmin(){
  if(typeof window.doorCollection==='function')window.doorCollection=due;
  if(typeof window.adminOrderRow==='function'&&!window.__mwExternalAdminRowV2){
    const base=window.adminOrderRow;
    window.adminOrderRow=function(o){
      let html=base(o),id=encodeURIComponent(String(o?.id??''));
      const block=`<div data-external-shipping="${id}" style="margin-top:6px"><label class="mini" style="display:block;font-weight:900">أجور شحن خارجي</label><input id="adminExternalFee-${id}" type="number" min="0" step="0.01" value="${esc(fee(o)||'')}" placeholder="0" style="width:90px"><select id="adminExternalCurrency-${id}">${currencyOptions(o?.external_shipping_currency,o?.currency)}</select></div>`;
      return html.replace('<br><select id="adminPay-',block+'<br><select id="adminPay-');
    };
    window.__mwExternalAdminRowV2=true;
  }
  if(typeof window.saveAdminOrderRow==='function'&&!window.__mwExternalAdminSaveV2){
    const base=window.saveAdminOrderRow;
    window.saveAdminOrderRow=async function(encodedId){
      const raw=document.getElementById('adminExternalFee-'+encodedId)?.value??'0',value=Number(raw),cur=document.getElementById('adminExternalCurrency-'+encodedId)?.value||document.getElementById('adminCurrency-'+encodedId)?.value||'USD';
      if(!Number.isFinite(value)||value<0)return alert('أجور الشحن الخارجي يجب أن تكون رقماً صحيحاً أكبر من أو يساوي صفر.');
      const id=decodeURIComponent(encodedId),sb=await adminSb();
      if(!sb)return alert('تعذر الاتصال بقاعدة البيانات لحفظ أجور الشحن الخارجي.');
      const result=await base(encodedId),{error}=await sb.from('orders').update({external_shipping_fee:value,external_shipping_currency:cur}).eq('id',id);
      if(error)return alert('تم حفظ بيانات الطلب لكن تعذر حفظ أجور الشحن الخارجي: '+error.message);
      try{await window.loadAdminOrders?.()}catch(e){console.warn(e)}
      return result;
    };
    window.__mwExternalAdminSaveV2=true;
  }
  window.openAdminUnifiedBranchManifest=function(mode){
    const branchId=String(document.getElementById('adminBranchFilter')?.value||'').trim();if(!branchId)return alert('اختر فرعاً محدداً');
    const adminId=new URLSearchParams(location.search).get('adminId')||'';
    window.open(topShell('manifest',{branchId,adminId,mode:mode||''}),'_blank');
  };
  if(typeof window.loginAsCloudCustomer==='function')window.loginAsCloudCustomer=function(encodedId){
    const customerId=decodeURIComponent(encodedId),adminId=new URLSearchParams(location.search).get('adminId')||'';
    window.top.location.href=topShell('customer',{customerId,adminId,viewedBy:'admin'});
  };
  try{window.loadAdminOrders?.()}catch(e){console.warn(e)}
}

async function fetchManifestExternalRows(){
  const branchId=String(new URLSearchParams(location.search).get('branchId')||document.getElementById('branchSelect')?.value||'').trim();
  if(!branchId||typeof window.getSb!=='function')return[];
  const sb=await window.getSb(),{data,error}=await sb.from('orders').select('id,order_code,total_price,currency,delivery_fee,delivery_payment_type,external_shipping_fee,external_shipping_currency').eq('branch_id',branchId).order('created_at',{ascending:false}).limit(10000);
  if(error){console.warn('External manifest rows unavailable:',error);return[]}
  return data||[];
}
async function enhanceManifest(){
  const table=document.getElementById('manifestTable'),head=table?.tHead?.rows?.[0];if(!head)return;
  let th=head.querySelector('[data-external-total-head]');
  if(!th){th=document.createElement('th');th.textContent='الإجمالي الكلي';th.dataset.externalTotalHead='1';head.insertBefore(th,head.cells[12]||null)}
  const rows=await fetchManifestExternalRows(),byCode=new Map(rows.map(o=>[String(o.order_code||o.id),o]));
  [...document.querySelectorAll('#manifestBody tr')].forEach(tr=>{
    if(tr.querySelector('[data-external-total-cell]'))return;
    const code=String(tr.cells?.[0]?.textContent||'').trim(),o=byCode.get(code);if(!o||tr.cells.length<12)return;
    const td=tr.insertCell(12);td.dataset.externalTotalCell='1';td.contentEditable='true';td.spellcheck=false;td.className='editable-cell';td.textContent=Number(gross(o)).toFixed(2)+' '+String(o.currency||currency(o));
  });
}
function installManifest(){
  if(typeof window.doorCollection==='function')window.doorCollection=due;
  if(typeof window.loadManifest==='function'&&!window.__mwExternalManifestV2){
    const base=window.loadManifest;
    window.loadManifest=async function(){const r=await base();await enhanceManifest();return r};window.__mwExternalManifestV2=true;
  }
  setTimeout(()=>enhanceManifest().catch(e=>console.warn(e)),350);
}

function installBranch(){
  if(typeof window.doorCollection==='function')window.doorCollection=due;
  if(typeof window.netCustody==='function')window.netCustody=due;
  try{window.loadOrders?.()}catch(e){console.warn(e)}
}

function installDelivery(){
  if(typeof window.doorCollection==='function')window.doorCollection=due;
  if(typeof window.deliveryNet==='function')window.deliveryNet=o=>Math.max(0,due(o)-localFee(o));
  if(typeof window.loadFinance==='function'&&typeof window.fetchCourierOrders==='function'&&!window.__mwExternalDeliveryFinanceV2){
    window.loadFinance=async function(){
      try{
        const rows=(await window.fetchCourierOrders('status,total_price,currency,delivery_fee,delivery_payment_type,external_shipping_fee,external_shipping_currency,is_settled,delivery_agent_id,courier_id,branch_id,details')).filter(o=>o.status==='تم التسليم'),unsettled=rows.filter(o=>o.is_settled!==true),by={};let pieces=0,parcels=0;
        unsettled.forEach(o=>{const cur=o.currency||'بدون عملة';if(!by[cur])by[cur]={collected:0,fees:0,net:0};by[cur].collected+=due(o);by[cur].fees+=localFee(o);by[cur].net+=Math.max(0,due(o)-localFee(o));pieces+=typeof window.deliveryOrderQuantity==='function'?window.deliveryOrderQuantity(o):1;parcels+=typeof window.deliveryParcelsCount==='function'?window.deliveryParcelsCount(o):1});
        const fmt=k=>Object.entries(by).map(([c,v])=>`${v[k].toFixed(2)} ${c}`).join(' / ')||'0.00';
        if(window.cardShipments)window.cardShipments.textContent=unsettled.length;if(window.cardPieces)window.cardPieces.textContent=pieces;if(window.cardParcels)window.cardParcels.textContent=parcels;if(window.cardCollected)window.cardCollected.textContent=fmt('collected');if(window.cardFees)window.cardFees.textContent=fmt('fees');if(window.cardNet)window.cardNet.textContent=fmt('net');
      }catch(e){console.error('External delivery finance error:',e)}
    };
    window.__mwExternalDeliveryFinanceV2=true;
  }
  try{window.loadDeliveryOrders?.()}catch(e){console.warn(e)}
}

async function fetchCustomerOrderFromModal(){
  const box=document.getElementById('customerOrderDetailsContent');if(!box||typeof window.ensureCustomerPortalSupabase!=='function')return null;
  const text=String(box.querySelector('p')?.textContent||''),code=text.replace(/^.*?:\s*/,'').trim();if(!code)return null;
  const sb=await window.ensureCustomerPortalSupabase();
  let q=sb.from('orders').select('id,order_code,total_price,currency,external_shipping_fee,external_shipping_currency').eq('order_code',code).limit(1),{data,error}=await q;
  if(error){console.warn('Customer external fee lookup failed:',error);return null}
  return data?.[0]||null;
}
async function appendCustomerInvoice(){
  const o=await fetchCustomerOrderFromModal(),box=document.getElementById('customerOrderDetailsContent');if(!o||!box)return;
  box.querySelector('[data-external-shipping-invoice]')?.remove();
  const cur=String(o.currency||currency(o)),extCur=currency(o),invoiceTotal=product(o)+fee(o),marker=document.createElement('div');marker.dataset.externalShippingInvoice='1';
  marker.innerHTML=`<hr style="border:0;border-top:1px solid rgba(148,163,184,.3);margin:12px 0"><p><b>سعر السلعة:</b> ${product(o).toFixed(2)} ${esc(cur)}</p><p><b>أجور الشحن الخارجي:</b> ${fee(o).toFixed(2)} ${esc(extCur)}</p><p><b>المجموع الكلي:</b> ${invoiceTotal.toFixed(2)} ${esc(cur)}</p>`;box.appendChild(marker);
}
function installCustomer(){
  if(typeof window.openCustomerOrderDetails==='function'&&!window.__mwExternalCustomerDetailsV2){
    const base=window.openCustomerOrderDetails;window.openCustomerOrderDetails=function(i){const r=base(i);setTimeout(()=>appendCustomerInvoice().catch(e=>console.warn(e)),0);return r};window.__mwExternalCustomerDetailsV2=true;
  }
  const params=new URLSearchParams(location.search),viewedBy=params.get('viewedBy'),back=document.getElementById('backBtn');
  if(back&&viewedBy==='employee'&&params.get('employeeId'))back.onclick=e=>{e.preventDefault();window.top.location.href=topShell('employee',{employeeId:params.get('employeeId')})};
  if(back&&viewedBy==='admin'&&params.get('adminId')){back.textContent='العودة إلى لوحة الأدمن';back.onclick=e=>{e.preventDefault();window.top.location.href=topShell('admin',{adminId:params.get('adminId')})}}
}

if(screen==='employee')installEmployee();else if(screen==='admin')installAdmin();else if(screen==='manifest')installManifest();else if(screen==='branch')installBranch();else if(screen==='delivery')installDelivery();else if(screen==='customer')installCustomer();
window.MeshwarExternalShippingV2={VERSION,gross,due,fee,currency};
})();
