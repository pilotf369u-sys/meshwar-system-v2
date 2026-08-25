/* MESHWAR_EXTERNAL_SHIPPING_UI_POLISH_V3 */
(function(){
'use strict';
const script=document.currentScript,screen=String(script?.dataset?.meshwarScreen||'').trim().toLowerCase();
const n=v=>{const x=Number(v);return Number.isFinite(x)?x:0};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const product=o=>Math.max(0,n(o?.total_price));
const external=o=>Math.max(0,n(o?.external_shipping_fee));
const total=o=>product(o)+external(o);
const baseCurrency=o=>String(o?.currency||'USD');
const externalCurrency=o=>{
  const base=baseCurrency(o),ext=String(o?.external_shipping_currency||'').trim();
  // Schema default USD is only a storage fallback. For a new/unpriced external fee,
  // present the order currency as the operational default.
  if(external(o)===0 && ext==='USD' && base && base!=='USD') return base;
  return ext||base||'USD';
};
function money(v,c){return `${n(v).toFixed(2)} ${esc(c||'')}`.trim()}
function stylePricingBlock(root){
  if(!root)return;
  root.style.display='grid';
  root.style.gridTemplateColumns='minmax(92px,1fr) minmax(82px,.72fr)';
  root.style.gap='6px';
  root.style.alignItems='center';
  root.style.padding='8px';
  root.style.marginTop='8px';
  root.style.border='1px solid rgba(148,163,184,.18)';
  root.style.borderRadius='10px';
  root.style.background='rgba(15,23,42,.22)';
  const label=root.querySelector('label');if(label){label.style.gridColumn='1/-1';label.style.margin='0';label.style.lineHeight='1.3'}
  root.querySelectorAll('input,select').forEach(el=>{el.style.width='100%';el.style.minWidth='0';el.style.margin='0';el.style.height='36px';el.style.boxSizing='border-box'});
}
function wireCurrencyAutoMatch(prefix,encodedId){
  const ext=document.getElementById(prefix+'ExternalCurrency-'+encodedId)||document.getElementById('externalCurrency-'+encodedId),
        base=document.getElementById(prefix==='admin'?'adminCurrency-'+encodedId:'currency-'+encodedId),
        feeEl=document.getElementById(prefix+'ExternalFee-'+encodedId)||document.getElementById('externalFee-'+encodedId);
  if(!ext||!base||ext.dataset.autoMatchWired==='1')return;
  const feeZero=()=>n(feeEl?.value)===0;
  if(feeZero() && (ext.value==='USD'||!ext.value) && base.value) ext.value=base.value;
  ext.dataset.autoMatchWired='1';
  ext.dataset.manualCurrency='0';
  ext.addEventListener('change',()=>{ext.dataset.manualCurrency='1'});
  base.addEventListener('change',()=>{if(ext.dataset.manualCurrency!=='1'&&base.value)ext.value=base.value});
}
function polishEmployeeAdmin(){
  const admin=screen==='admin',selector=admin?'[data-external-shipping]':'[data-external-shipping]';
  document.querySelectorAll(selector).forEach(root=>{
    stylePricingBlock(root);
    const encodedId=root.dataset.externalShipping||'';
    wireCurrencyAutoMatch(admin?'admin':'',encodedId);
    const due=root.parentElement?.querySelector('.collect-due');
    if(due){due.style.display='block';due.style.marginTop='8px';due.style.paddingTop='7px';due.style.borderTop='1px dashed rgba(148,163,184,.24)'}
  });
}
function wrapRenderForPolish(){
  const candidates=screen==='admin'?['loadAdminOrders']:['loadPipelineOrders'];
  candidates.forEach(name=>{
    const base=window[name];if(typeof base!=='function'||base.__mwExternalPolishV3)return;
    const wrapped=async function(...args){const r=await base.apply(this,args);setTimeout(polishEmployeeAdmin,0);return r};
    wrapped.__mwExternalPolishV3=true;window[name]=wrapped;
  });
  setTimeout(polishEmployeeAdmin,120);
}
function customerCurrency(o){return baseCurrency(o)}
function decisionHtml(o,index){
  const status=o?.status||'انتظار رد الموظف',cur=customerCurrency(o),sum=total(o),priced=sum>0,
        cancelAllowed=typeof window.canCustomerCancelStatus==='function'?window.canCustomerCancelStatus(status):false,
        waiting=typeof window.isWaitingCustomerApprovalStatus==='function'?window.isWaitingCustomerApprovalStatus(status):false;
  if(waiting&&priced){return `<div class="decision-box"><div style="margin-bottom:7px;font-weight:bold;color:#9a3412">المجموع الكلي: ${money(sum,cur)}</div><div style="font-size:11px;opacity:.82;margin-bottom:7px">يشمل سعر السلعة + الشحن الخارجي</div><button class="btn-approve" onclick="approveOrder(${index})">موافقة على الشراء</button>${cancelAllowed?`<button class="btn-cancel" onclick="cancelOrder(${index})">رفض السعر / إلغاء</button>`:''}</div>`}
  if(status==='تمت الموافقة - بانتظار الدفع')return `<div class="payment-box"><b>تمت الموافقة على الطلب</b><br><b>المبلغ الإجمالي:</b> ${money(sum,cur)}<br><small>سعر السلعة + الشحن الخارجي</small><br>يرجى متابعة تعليمات الدفع من الموظف.</div>`;
  return cancelAllowed&&priced?`<button class="btn-cancel" onclick="cancelOrder(${index})">إلغاء الطلب</button>`:'---';
}
function installCustomerRows(){
  if(typeof window.activeOrderRow==='function'&&!window.__mwExternalCustomerActiveV3){
    const base=window.activeOrderRow;
    window.activeOrderRow=function(o,index){
      let html=base(o,index),cur=customerCurrency(o),ext=external(o),sum=total(o);
      const cells=[];const holder=document.createElement('tbody');holder.innerHTML=html;const tr=holder.firstElementChild;if(!tr)return html;
      tr.querySelectorAll('td').forEach(td=>cells.push(td));
      if(cells.length>=9){
        const extTd=document.createElement('td');extTd.dataset.externalFeeCell='1';extTd.innerHTML=`<b>${money(ext,externalCurrency(o))}</b>`;
        const totalTd=document.createElement('td');totalTd.dataset.externalTotalCell='1';totalTd.innerHTML=`<b>${money(sum,cur)}</b>`;
        cells[5].after(extTd,totalTd);
        const decisionCell=tr.querySelectorAll('td')[10];if(decisionCell)decisionCell.innerHTML=decisionHtml(o,index);
      }
      return tr.outerHTML;
    };
    window.__mwExternalCustomerActiveV3=true;
  }
  if(typeof window.historyOrderRow==='function'&&!window.__mwExternalCustomerHistoryV3){
    const base=window.historyOrderRow;
    window.historyOrderRow=function(o,index){
      const holder=document.createElement('tbody');holder.innerHTML=base(o,index);const tr=holder.firstElementChild;if(!tr)return base(o,index);const cells=[...tr.querySelectorAll('td')];
      if(cells.length>=8){const extTd=document.createElement('td');extTd.innerHTML=`<b>${money(external(o),externalCurrency(o))}</b>`;const totalTd=document.createElement('td');totalTd.innerHTML=`<b>${money(total(o),customerCurrency(o))}</b>`;cells[5].after(extTd,totalTd)}
      return tr.outerHTML;
    };
    window.__mwExternalCustomerHistoryV3=true;
  }
  if(typeof window.customerDecisionHtml==='function')window.customerDecisionHtml=(o,index)=>decisionHtml(o,index);
}
function addCustomerHeaders(){
  const active=document.querySelector('#activeOrders table thead tr'),hist=document.querySelector('#orderHistory table thead tr');
  if(active&&!active.querySelector('[data-external-fee-head]')){
    const ref=active.children[5];
    if(ref){ref.textContent='سعر السلعة';const a=document.createElement('th');a.dataset.externalFeeHead='1';a.textContent='أجور الشحن الخارجي';const b=document.createElement('th');b.dataset.externalTotalHead='1';b.textContent='المجموع الكلي';ref.after(a,b)}
  }
  if(hist&&!hist.querySelector('[data-external-fee-head]')){
    const ref=hist.children[5];
    if(ref){ref.textContent='سعر السلعة';const a=document.createElement('th');a.dataset.externalFeeHead='1';a.textContent='أجور الشحن الخارجي';const b=document.createElement('th');b.dataset.externalTotalHead='1';b.textContent='المجموع الكلي';ref.after(a,b)}
  }
}
function installCustomer(){
  addCustomerHeaders();installCustomerRows();
  if(typeof window.renderOrdersPanels==='function'&&!window.__mwExternalRenderPanelsV3){
    const base=window.renderOrdersPanels;window.renderOrdersPanels=function(...args){addCustomerHeaders();const r=base.apply(this,args);setTimeout(addCustomerHeaders,0);return r};window.__mwExternalRenderPanelsV3=true;
  }
  // Existing rows were rendered before this layer loaded in some browsers; trigger the cloud loader when available.
  const params=new URLSearchParams(location.search),customerId=params.get('customerId')||localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId');
  if(customerId&&typeof window.loadCustomerOrdersFromCloud==='function')setTimeout(()=>window.loadCustomerOrdersFromCloud(customerId).catch(e=>console.warn('Customer V3 refresh:',e)),80);
}
if(screen==='employee'||screen==='admin')wrapRenderForPolish();
if(screen==='customer')installCustomer();
window.MeshwarExternalShippingUIPolishV3={version:'20260825-v3',total,externalCurrency};
})();
