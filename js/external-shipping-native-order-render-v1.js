/* MESHWAR_EXTERNAL_SHIPPING_NATIVE_ORDER_RENDER_V1 */
(function(){
'use strict';
const script=document.currentScript;
const screen=String(script?.dataset?.meshwarScreen||'').trim().toLowerCase();
if(screen!=='employee'&&screen!=='admin')return;
const VERSION='20260829-native-render-v38';
const num=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const fee=o=>Math.max(0,num(o?.external_shipping_fee));
const localFee=o=>Math.max(0,num(o?.delivery_fee));
const product=o=>Math.max(0,num(o?.total_price));
const bindInputValue=(id,value)=>queueMicrotask(()=>{const el=document.getElementById(id);if(el)el.value=(value===null||value===undefined||value==='')?'':String(value)});
const payTypeValue=o=>String(o?.delivery_payment_type||'cod_full');
const extCurrencyValue=o=>{
  const base=String(o?.currency||'USD'),ext=String(o?.external_shipping_currency||'').trim();
  if(fee(o)===0&&ext==='USD'&&base&&base!=='USD')return base;
  return ext||base||'USD';
};
function collectionDue(o){const t=payTypeValue(o);if(t==='paid_prepaid')return 0;if(t==='product_paid_delivery_cod')return fee(o)+localFee(o);return product(o)+fee(o)+localFee(o)}
function symbol(v){const s=String(v||'').trim().toUpperCase();if(s==='USD'||s==='$')return'$';if(s==='IQD')return'IQD';if(s==='TRY'||s==='TL')return'TL';if(s==='EUR'||s==='€')return'€';if(s==='SYP')return'SYP';return String(v||'USD')}
function shortCurrencyOptions(current){const cur=String(current||'USD'),values=[cur,'USD','IQD','TRY','EUR','SYP','$'];return [...new Set(values.filter(Boolean))].map(v=>`<option value="${escapeHtml(v)}" ${v===cur?'selected':''}>${escapeHtml(symbol(v))}</option>`).join('')}
function adminShortCurrencyOptions(current){const cur=String(current||'USD'),values=[cur,'USD','IQD','TRY','EUR','SYP','$'];return [...new Set(values.filter(Boolean))].map(v=>`<option value="${esc(v)}" ${v===cur?'selected':''}>${esc(symbol(v))}</option>`).join('')}
function syncEmployeeExternalCurrency(id){const base=document.getElementById('currency-'+id),ext=document.getElementById('externalCurrency-'+id),feeEl=document.getElementById('externalFee-'+id);if(!base||!ext)return;if(ext.dataset.manualCurrency==='1')return;if(num(feeEl?.value)===0&&base.value)ext.value=base.value}
function markEmployeeExternalCurrencyManual(id){const ext=document.getElementById('externalCurrency-'+id);if(ext)ext.dataset.manualCurrency='1'}
function syncAdminExternalCurrency(id){const base=document.getElementById('adminCurrency-'+id),ext=document.getElementById('adminExternalCurrency-'+id),feeEl=document.getElementById('adminExternalFee-'+id);if(!base||!ext)return;if(ext.dataset.manualCurrency==='1')return;if(num(feeEl?.value)===0&&base.value)ext.value=base.value}
function markAdminExternalCurrencyManual(id){const ext=document.getElementById('adminExternalCurrency-'+id);if(ext)ext.dataset.manualCurrency='1'}
window.syncEmployeeExternalCurrency=syncEmployeeExternalCurrency;
window.markEmployeeExternalCurrencyManual=markEmployeeExternalCurrencyManual;
window.syncAdminExternalCurrency=syncAdminExternalCurrency;
window.markAdminExternalCurrencyManual=markAdminExternalCurrencyManual;
function installCss(){if(document.getElementById('mw-native-render-v1-css'))return;const s=document.createElement('style');s.id='mw-native-render-v1-css';s.textContent=`
#ordersPanel .table-wrap,#ordersListPanel .table-wrap{width:100%!important;max-width:100%!important;overflow-x:hidden!important}
#ordersPanel table,#ordersListPanel table{width:100%!important;max-width:100%!important;min-width:0!important;table-layout:fixed!important}
#ordersPanel th,#ordersPanel td,#ordersListPanel th,#ordersListPanel td{padding:5px 4px!important;vertical-align:middle!important;text-align:center!important;font-size:12px!important;line-height:1.25!important;overflow:hidden!important;box-sizing:border-box!important}
#ordersPanel th,#ordersListPanel th{font-size:11px!important;white-space:normal!important;word-break:break-word!important}
.mw-native-controls{display:grid;grid-template-columns:minmax(0,1fr) minmax(54px,.62fr);gap:4px;align-items:center;width:100%}
.mw-native-stack{display:flex;flex-direction:column;gap:4px;align-items:stretch;width:100%}
.mw-native-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;width:100%;align-items:center}
.mw-native-actions button,.mw-native-actions a{margin:0!important;padding:5px 4px!important;font-size:9.5px!important;line-height:1.15!important;min-width:0!important;white-space:normal!important;text-align:center!important}
#ordersPanel td input,#ordersPanel td select,#ordersListPanel td input,#ordersListPanel td select{width:100%!important;max-width:100%!important;min-width:0!important;height:32px!important;margin:0!important;padding:3px 5px!important;font-size:11px!important;text-align:center!important;text-align-last:center!important;border-radius:6px!important;box-sizing:border-box!important}
#ordersPanel .collect-due,#ordersListPanel .collect-due{display:block!important;margin:0!important;padding:5px 4px!important;font-size:10.5px!important;white-space:normal!important}
#ordersPanel .customer-code,#ordersListPanel .customer-code,#ordersPanel .qty-badge,#ordersListPanel .qty-badge{font-weight:900!important}
html[data-mw-theme="light"] #ordersPanel td input,html[data-mw-theme="light"] #ordersPanel td select,html[data-mw-theme="light"] #ordersListPanel td input,html[data-mw-theme="light"] #ordersListPanel td select{border:1px solid #cbd5e1!important;background:#fff!important;color:#0f172a!important;-webkit-text-fill-color:#0f172a!important;opacity:1!important}
html[data-mw-theme="light"] #ordersPanel .customer-code,html[data-mw-theme="light"] #ordersListPanel .customer-code{background:#fde68a!important;color:#78350f!important;border:1px solid #f59e0b!important}
html[data-mw-theme="light"] #ordersPanel .qty-badge,html[data-mw-theme="light"] #ordersListPanel .qty-badge{background:#fef3c7!important;color:#78350f!important;border:1px solid #f59e0b!important}
@media(max-width:1250px){#ordersPanel th,#ordersPanel td,#ordersListPanel th,#ordersListPanel td{font-size:10.5px!important;padding:4px 2px!important}#ordersPanel td input,#ordersPanel td select,#ordersListPanel td input,#ordersListPanel td select{font-size:10px!important;height:29px!important}.mw-native-actions button,.mw-native-actions a{font-size:8.5px!important;padding:4px 2px!important}}
`;document.head.appendChild(s)}
function employeeHeader(){const tr=document.querySelector('#ordersPanel table thead tr');if(!tr)return;tr.innerHTML='<th style="width:14%">رقم الطلب / Sipariş / باركود</th><th style="width:13%">العميل / الكود</th><th style="width:5%">الكمية</th><th style="width:11%">سعر السلعة</th><th style="width:11%">أجور الشحن</th><th style="width:14%">التحصيل الصافي (عند الباب)</th><th style="width:9%">الفرع</th><th style="width:10%">الحالة</th><th style="width:13%">الإجراءات</th>'}
function adminHeader(){const tr=document.querySelector('#ordersListPanel table thead tr');if(!tr)return;tr.innerHTML='<th style="width:12%">رقم الطلب / Sipariş / باركود</th><th style="width:12%">العميل / الكود</th><th style="width:5%">الكمية</th><th style="width:8%">المنتج</th><th style="width:10%">سعر السلعة</th><th style="width:10%">أجور الشحن</th><th style="width:12%">التحصيل الصافي (عند الباب)</th><th style="width:8%">الفرع</th><th style="width:11%">الحالة</th><th style="width:12%">الإجراءات</th>'}
function installEmployee(){
  installCss();employeeHeader();
  window.doorCollectionAmount=collectionDue;
  window.orderRowHtml=function(o){
    const id=encodeURIComponent(cloudId(o.id)),qty=o._quantity||orderQuantity(o),price=product(o),status=o.status||'انتظار رد الموظف',code=o.order_code||o.id,due=collectionDue(o),mainPhone=o._customer_phone||o.customer_phone||'',ext=fee(o),extCur=extCurrencyValue(o),pricingDisabled=can('pricing')?'':'disabled';bindInputValue('price-'+id,price);bindInputValue('externalFee-'+id,ext);
    return `<tr class="${orderRowClass(status)}">
<td><b>${escapeHtml(code)}</b><br><input id="ref-${id}" value="${escapeHtml(o.reference_order_no||'')}" placeholder="Sipariş No"><svg class="barcode-svg" data-barcode="${escapeHtml(code)}" data-order-id="${escapeHtml(cloudId(o.id))}"></svg><button class="btn btn-blue" onclick="printOrderBarcode('${id}')">طباعة</button></td>
<td><b>${escapeHtml(o.customer_name||'---')}</b><br><span dir="ltr">${escapeHtml(mainPhone)}</span><br><span class="customer-code">${escapeHtml(orderCustomerCode(o))}</span>${employeeSecondaryContact(o)}</td>
<td><span class="qty-badge">${escapeHtml(qty)}</span>${qty>1?`<div class="qty-warning">${escapeHtml(qty)} قطع</div>`:''}</td>
<td><div class="mw-native-controls"><input id="price-${id}" type="number" min="0" step="0.01" value="${escapeHtml(price)}" placeholder="0" ${pricingDisabled}><select id="currency-${id}" ${pricingDisabled} onchange="syncEmployeeExternalCurrency('${id}')">${shortCurrencyOptions(o.currency||'USD')}</select></div></td>
<td><div class="mw-native-controls"><input id="externalFee-${id}" type="number" min="0" step="0.01" value="${escapeHtml(ext||'')}" placeholder="0" ${pricingDisabled}><select id="externalCurrency-${id}" data-manual-currency="0" ${pricingDisabled} onchange="markEmployeeExternalCurrencyManual('${id}')">${shortCurrencyOptions(extCur)}</select></div></td>
<td><div class="mw-native-stack"><select id="pay-${id}">${paymentOptions(o.delivery_payment_type)}</select><span class="collect-due">${due.toFixed(2)} ${escapeHtml(o.currency||'$')}</span></div></td>
<td><select id="branch-${id}" ${can('branches')?'':'disabled'}>${branchOptions(o.branch_id)}</select></td>
<td><div class="mw-native-stack"><select id="status-${id}" onchange="document.getElementById('courier-${id}').style.display=this.value==='مندوب'?'block':'none';document.getElementById('parcels-wrap-${id}').style.display=this.value==='تجهيز شحن'?'block':'none'">${statusOptions(status)}</select><select id="courier-${id}" style="display:${status==='مندوب'?'block':'none'}">${courierOptionsForOrder(o)}</select><div id="parcels-wrap-${id}" style="display:${status==='تجهيز شحن'?'block':'none'}"><label class="mini">عدد الطرود</label><input id="parcels-${id}" type="number" min="1" step="1" value="${orderParcelsCount(o)}"></div></div></td>
<td><div class="mw-native-actions"><a class="btn-whatsapp" href="https://wa.me/${String(mainPhone).replace(/[^0-9]/g,'')}" target="_blank">واتساب</a><button class="btn btn-orange" onclick="openChat('${encodeURIComponent(cloudId(o.customer_id))}','${escapeHtml(o.customer_name||'العميل')}')">دردشة</button><button class="btn btn-dark" onclick="openOrderDetailsById('${id}')">تفاصيل</button><button class="btn btn-purple" onclick="openCustomerPortal('${encodeURIComponent(cloudId(o.customer_id))}')">ملف العميل</button><button class="btn btn-green" style="grid-column:1/-1" onclick="saveOrderRow('${id}')">حفظ</button></div></td>
</tr>`;
  };
  window.saveOrderRow=async function(encodedId){
    const id=cloudId(decodeURIComponent(encodedId)),o=cloudOrders.find(x=>cloudId(x.id)===id);if(!o)return;
    let status=document.getElementById('status-'+encodedId)?.value||o.status;
    const reference=document.getElementById('ref-'+encodedId)?.value?.trim()||null,payment=paymentType(document.getElementById('pay-'+encodedId)?.value),branchId=cloudId(document.getElementById('branch-'+encodedId)?.value),branch=cloudBranches.find(b=>cloudId(b.id)===branchId),agentId=cloudId(document.getElementById('courier-'+encodedId)?.value),extRaw=document.getElementById('externalFee-'+encodedId)?.value??'0',extFee=Number(extRaw),extCur=document.getElementById('externalCurrency-'+encodedId)?.value||document.getElementById('currency-'+encodedId)?.value||'USD',payload={status,reference_order_no:reference,delivery_payment_type:payment,branch_id:branchId||null,branch_name:branch?(branch.name||branch.branch_name||null):null,external_shipping_fee:Number.isFinite(extFee)?extFee:0,external_shipping_currency:extCur};
    if(!Number.isFinite(extFee)||extFee<0)return alert('أجور الشحن الخارجي يجب أن تكون رقماً صحيحاً أكبر من أو يساوي صفر.');
    if(status==='مندوب'){if(!isCloudUuid(agentId))return alert('معرف موظف التوصيل غير صالح. يجب أن يكون UUID صحيحاً.');payload.delivery_agent_id=agentId}else if(o.status==='مندوب'){payload.delivery_agent_id=null}
    if(can('pricing')){const raw=document.getElementById('price-'+encodedId)?.value??'';if(raw==='')payload.total_price=null;else{const n=Number(raw);if(!Number.isFinite(n)||n<0)return alert('أدخل مبلغاً صحيحاً');payload.total_price=n;payload.currency=document.getElementById('currency-'+encodedId)?.value||'$';if(n>0&&o.status==='انتظار رد الموظف'&&status==='انتظار رد الموظف'){status='بانتظار موافقة العميل';payload.status=status}}}
    if(status!=='رفض الطلب'&&Object.prototype.hasOwnProperty.call(o,'rejection_reason'))payload.rejection_reason=null;
    const parcelsRaw=document.getElementById('parcels-'+encodedId)?.value??orderParcelsCount(o),parcelsCount=Math.max(1,Math.floor(Number(parcelsRaw)||1));payload.details=JSON.stringify({...parseDetails(o.details),parcels_count:parcelsCount});
    try{const sb=await ensureEmployeeSupabase(),{error}=await sb.from('orders').update(payload).eq('id',id);if(error)throw error;await Promise.all([loadPipelineOrders(),refreshPipelineCounts()])}catch(e){console.error('Order save error:',e);alert('تعذر الحفظ: '+(e.message||e))}
  };
  setTimeout(()=>{employeeHeader();loadPipelineOrders?.()},0);
}
function installAdmin(){
  installCss();adminHeader();
  window.doorCollection=collectionDue;
  window.adminOrderRow=function(o){
    const id=encodeURIComponent(String(o.id)),code=o.order_code||o.id,status=o.status||'انتظار رد الموظف',qty=o._quantity||adminOrderQuantity(o),price=product(o),url=adminOrderProductUrl(o),phone=o._customer_phone||o.customer_phone||'---',ext=fee(o),extCur=extCurrencyValue(o),due=collectionDue(o);bindInputValue('adminPrice-'+id,price);bindInputValue('adminExternalFee-'+id,ext);
    return `<tr class="${rowClass(status)}">
<td><b>${esc(code)}</b><br><input id="adminRef-${id}" value="${esc(o.reference_order_no||'')}" placeholder="Sipariş No"><svg class="barcode-svg" data-admin-barcode="${esc(code)}" data-admin-id="${esc(o.id)}"></svg><button class="btn-blue" onclick="printAdminOrderBarcode('${id}')">طباعة</button></td>
<td><b>${esc(o.customer_name||'---')}</b><br><span dir="ltr">${esc(phone)}</span><br><span class="customer-code">${esc(orderCustomerCode(o))}</span>${secondaryContactHtml(o._secondary_phone)}</td>
<td><span class="qty-badge">${esc(qty)}</span><div class="mini">📦 ${esc(adminOrderParcelsCount(o))}</div></td>
<td>${o.image_url?`<img class="order-thumb" src="${esc(o.image_url)}">`:''}${url?`<br><a target="_blank" rel="noopener noreferrer" href="${esc(url)}">فتح الرابط</a>`:''}</td>
<td><div class="mw-native-controls"><input id="adminPrice-${id}" type="number" min="0" step="0.01" value="${esc(price)}" placeholder="0"><select id="adminCurrency-${id}" onchange="syncAdminExternalCurrency('${id}')">${adminShortCurrencyOptions(o.currency||'USD')}</select></div></td>
<td><div class="mw-native-controls"><input id="adminExternalFee-${id}" type="number" min="0" step="0.01" value="${esc(ext||'')}" placeholder="0"><select id="adminExternalCurrency-${id}" data-manual-currency="0" onchange="markAdminExternalCurrencyManual('${id}')">${adminShortCurrencyOptions(extCur)}</select></div></td>
<td><div class="mw-native-stack"><select id="adminPay-${id}">${payOptions(o.delivery_payment_type)}</select><span class="collect-due">${due.toFixed(2)} ${esc(o.currency||'$')}</span></div></td>
<td><select id="adminBranch-${id}">${adminBranchOptions(o.branch_id)}</select></td>
<td><div class="mw-native-stack"><select id="adminStatus-${id}" onchange="document.getElementById('adminCourier-${id}').style.display=this.value==='مندوب'?'block':'none';document.getElementById('adminRejectWrap-${id}').style.display=this.value==='رفض الطلب'?'block':'none'">${statusOptions(status)}</select><select id="adminCourier-${id}" style="display:${status==='مندوب'?'block':'none'}">${adminCourierOptions(o)}</select><div id="adminRejectWrap-${id}" style="display:${status==='رفض الطلب'?'block':'none'}"><input id="adminReject-${id}" value="${esc(o.rejection_reason||'')}" placeholder="سبب الرفض"></div></div></td>
<td><div class="mw-native-actions"><button class="btn-green" onclick="saveAdminOrderRow('${id}')">حفظ</button><button class="btn-details" onclick="openOrderDetailsModalData('${id}')">تفاصيل</button></div></td>
</tr>`;
  };
  window.saveAdminOrderRow=async function(encodedId){
    const id=decodeURIComponent(encodedId),o=adminOrdersCloud.find(x=>String(x.id)===String(id));if(!o)return;let status=document.getElementById('adminStatus-'+encodedId).value;
    const branchId=document.getElementById('adminBranch-'+encodedId).value,branch=adminBranches.find(b=>String(b.id)===String(branchId)),reason=document.getElementById('adminReject-'+encodedId)?.value.trim()||null,raw=document.getElementById('adminPrice-'+encodedId)?.value??'',agentId=String(document.getElementById('adminCourier-'+encodedId)?.value||'').trim(),extRaw=document.getElementById('adminExternalFee-'+encodedId)?.value??'0',extFee=Number(extRaw),extCur=document.getElementById('adminExternalCurrency-'+encodedId)?.value||document.getElementById('adminCurrency-'+encodedId)?.value||'USD',payload={reference_order_no:document.getElementById('adminRef-'+encodedId)?.value.trim()||null,delivery_payment_type:payType(document.getElementById('adminPay-'+encodedId)?.value),branch_id:branchId||null,branch_name:branch?(branch.name||branch.branch_name||null):null,status,rejection_reason:status==='رفض الطلب'?reason:null,external_shipping_fee:Number.isFinite(extFee)?extFee:0,external_shipping_currency:extCur};
    if(!Number.isFinite(extFee)||extFee<0)return alert('أجور الشحن الخارجي يجب أن تكون رقماً صحيحاً أكبر من أو يساوي صفر.');
    if(status==='مندوب'){if(!isAdminUuid(agentId))return alert('معرف موظف التوصيل غير صالح. يجب أن يكون UUID صحيحاً.');payload.delivery_agent_id=agentId}else if(o.status==='مندوب'){payload.delivery_agent_id=null}
    if(raw==='')payload.total_price=null;else{const n=Number(raw);if(!Number.isFinite(n)||n<0)return alert('أدخل مبلغاً صحيحاً');payload.total_price=n;payload.currency=document.getElementById('adminCurrency-'+encodedId)?.value||'$';if(n>0&&o.status==='انتظار رد الموظف'&&status==='انتظار رد الموظف'){status='بانتظار موافقة العميل';payload.status=status}}
    if(status==='رفض الطلب'&&!reason)return alert('أدخل سبب الرفض');
    try{const sb=await ensureCustomerSupabase(),{error}=await sb.from('orders').update(payload).eq('id',id);if(error)throw error;await Promise.all([loadAdminOrders(),refreshAdminPipelineCounts()])}catch(e){console.error('Admin order save error:',e);alert('تعذر الحفظ: '+(e.message||e))}
  };
  setTimeout(()=>{adminHeader();loadAdminOrders?.()},0);
}
if(screen==='employee')installEmployee();else installAdmin();
window.MeshwarExternalShippingNativeOrderRenderV1={VERSION,collectionDue};
})();
