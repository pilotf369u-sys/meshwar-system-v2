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
/* CUSTOMER_POST_LOGIN_ROOT_FIX_V50: legacy customer table/header renderer removed. */
if(screen==='employee'||screen==='admin')wrapRenderForPolish();
window.MeshwarExternalShippingUIPolishV3={version:'20260825-v3',total,externalCurrency};
})();
