/* MESHWAR_EXTERNAL_SHIPPING_UI_GRID_V4 */
(function(){
'use strict';
const script=document.currentScript,screen=String(script?.dataset?.meshwarScreen||'').trim().toLowerCase();
if(screen!=='employee'&&screen!=='admin')return;
function styleControl(el){if(!el)return;el.style.width='100%';el.style.minWidth='0';el.style.height='38px';el.style.margin='0';el.style.boxSizing='border-box'}
function card(title,kind){const d=document.createElement('div');d.className='mw-price-card mw-price-'+kind;d.style.cssText='min-width:0;padding:9px;border:1px solid rgba(148,163,184,.18);border-radius:11px;background:rgba(15,23,42,.16);display:flex;flex-direction:column;gap:6px;justify-content:flex-start';const h=document.createElement('div');h.textContent=title;h.style.cssText='font-size:11px;font-weight:900;color:#64748b;white-space:nowrap';d.appendChild(h);return d}
function labelRow(){const d=document.createElement('div');d.style.cssText='display:grid;grid-template-columns:minmax(88px,1fr) minmax(74px,.75fr);gap:6px;align-items:center';return d}
function organizeCell(root){
  if(!root||root.dataset.gridV4==='1')return;
  const cell=root.closest('td');if(!cell)return;
  const id=root.dataset.externalShipping||'';
  const price=document.getElementById((screen==='admin'?'adminPrice-':'price-')+id)||cell.querySelector('input[id^="price-"],input[id^="adminPrice-"]');
  const currency=document.getElementById((screen==='admin'?'adminCurrency-':'currency-')+id)||cell.querySelector('select[id^="currency-"],select[id^="adminCurrency-"]');
  const pay=document.getElementById((screen==='admin'?'adminPay-':'pay-')+id)||cell.querySelector('select[id^="pay-"],select[id^="adminPay-"]');
  const due=cell.querySelector('.collect-due');
  if(!price||!currency||!pay||!due)return;
  const qty=cell.querySelector('.qty-warning');
  const oldWrap=price.closest('.money-wrap');
  const grid=document.createElement('div');grid.dataset.mwPricingGrid='1';grid.style.cssText='display:grid;grid-template-columns:minmax(180px,1fr) minmax(180px,1fr) minmax(180px,1fr);gap:9px;align-items:stretch;min-width:570px';
  const productCard=card('سعر السلعة','product'),pRow=labelRow();styleControl(price);styleControl(currency);pRow.append(price,currency);productCard.appendChild(pRow);
  const externalCard=card('أجور الشحن الخارجي','external');root.style.cssText='display:grid;grid-template-columns:minmax(88px,1fr) minmax(74px,.75fr);gap:6px;align-items:center;padding:0;margin:0;border:0;background:transparent';const extLabel=root.querySelector('label');if(extLabel)extLabel.style.display='none';root.querySelectorAll('input,select').forEach(styleControl);externalCard.appendChild(root);
  const dueCard=card('التحصيل الصافي (عند الباب)','due');styleControl(pay);pay.style.marginBottom='2px';due.style.cssText='display:flex;align-items:center;justify-content:center;min-height:38px;margin:0;padding:7px 9px;border-radius:8px;background:#fff7ed;color:#9a3412;font-weight:900;border:1px solid #fed7aa;white-space:nowrap';dueCard.append(pay,due);
  grid.append(productCard,externalCard,dueCard);
  if(oldWrap&&oldWrap.parentElement===cell)oldWrap.remove();
  cell.insertBefore(grid,qty||cell.firstChild);
  if(qty){qty.style.marginTop='8px';qty.style.width='100%'}
  cell.style.minWidth='610px';cell.style.verticalAlign='middle';
  root.dataset.gridV4='1';
}
function apply(){document.querySelectorAll('[data-external-shipping]').forEach(organizeCell)}
function wrapLoader(){const names=screen==='admin'?['loadAdminOrders']:['loadPipelineOrders'];names.forEach(name=>{const base=window[name];if(typeof base!=='function'||base.__mwGridV4)return;const wrapped=async function(...args){const r=await base.apply(this,args);setTimeout(apply,0);return r};wrapped.__mwGridV4=true;window[name]=wrapped})}
wrapLoader();setTimeout(apply,80);setTimeout(apply,350);
window.MeshwarExternalShippingGridV4={version:'20260825-v4',apply};
})();
