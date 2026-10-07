/* MESHWAR_EXTERNAL_SHIPPING_TABLE_LAYOUT_V6 */
(function(){
'use strict';
const script=document.currentScript,screen=String(script?.dataset?.meshwarScreen||'').trim().toLowerCase();
if(screen!=='employee'&&screen!=='admin')return;

const BODY_ID=screen==='employee'?'pipelineOrdersBody':'adminOrdersTableBody';
const TABLE_SELECTOR=screen==='employee'?'#ordersPanel .table-wrap table':'#ordersListPanel .table-wrap table';
const WRAP_SELECTOR=screen==='employee'?'#ordersPanel .table-wrap':'#ordersListPanel .table-wrap';
const labels=screen==='employee'
 ? ['رقم الطلب / Sipariş / باركود','العميل / الكود','الكمية','سعر السلعة','أجور الشحن الخارجي','التحصيل الصافي (عند الباب)','الفرع','الحالة','الإجراءات']
 : ['رقم الطلب / Sipariş / باركود','العميل / الكود','الهاتف','الكمية','المنتج','سعر السلعة','أجور الشحن الخارجي','التحصيل الصافي (عند الباب)','الفرع','الحالة','الإجراءات'];
const widths=screen==='employee'?[14,13,5,11,12,14,9,9,13]:[12,9,8,5,8,9,10,12,8,9,10];

function td(kind){const x=document.createElement('td');x.dataset.mwV6=kind;x.style.cssText='padding:5px 4px!important;vertical-align:middle!important;position:static!important;z-index:auto!important;overflow:hidden!important;min-width:0!important;max-width:none!important;text-align:center!important;font-size:12px!important;line-height:1.25!important';return x}
function controls(){const x=document.createElement('div');x.style.cssText='display:grid;grid-template-columns:minmax(0,1fr) minmax(54px,.72fr);gap:4px;align-items:center;width:100%;min-width:0';return x}
function stack(){const x=document.createElement('div');x.style.cssText='display:flex;flex-direction:column;gap:4px;align-items:stretch;width:100%;min-width:0';return x}
function actions(){const x=document.createElement('div');x.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;align-items:center;justify-content:center;width:100%;min-width:0';return x}
function styleControl(el){if(!el)return;el.style.cssText+=';width:100%!important;max-width:100%!important;min-width:0!important;height:30px!important;margin:0!important;padding:3px 4px!important;box-sizing:border-box!important;position:static!important;z-index:auto!important;font-size:11px!important;line-height:1.1!important;border-radius:5px!important'}
function styleExternal(root){root.querySelector('label')?.remove();root.style.cssText='display:grid!important;grid-template-columns:minmax(0,1fr) minmax(54px,.72fr)!important;gap:4px!important;align-items:center!important;width:100%!important;min-width:0!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important;position:static!important;z-index:auto!important;box-shadow:none!important';root.querySelectorAll('input,select').forEach(styleControl)}
function styleDue(el){el.style.cssText='display:flex!important;align-items:center!important;justify-content:center!important;min-height:30px!important;margin:0!important;padding:4px!important;border-radius:6px!important;background:#fff7ed!important;color:#9a3412!important;font-weight:900!important;border:1px solid #fed7aa!important;white-space:normal!important;word-break:break-word!important;position:static!important;z-index:auto!important;font-size:11px!important;line-height:1.2!important'}
function compactCell(tdEl){if(!tdEl)return;tdEl.style.cssText+=';padding:5px 4px!important;min-width:0!important;max-width:none!important;overflow:hidden!important;vertical-align:middle!important;font-size:12px!important;line-height:1.25!important;position:static!important;z-index:auto!important';tdEl.querySelectorAll('input,select').forEach(styleControl);tdEl.querySelectorAll('button,a.btn-whatsapp').forEach(compactButton);const svg=tdEl.querySelector('.barcode-svg');if(svg)svg.style.cssText+=';max-width:105px!important;width:100%!important;height:30px!important;margin:2px auto!important';const badge=tdEl.querySelector('.qty-badge');if(badge)badge.style.cssText+=';min-width:30px!important;height:28px!important;padding:0 6px!important;font-size:12px!important';}
function compactButton(el){if(!el)return;el.style.cssText+=';padding:5px 6px!important;margin:0!important;font-size:10px!important;line-height:1.15!important;min-height:28px!important;height:auto!important;min-width:0!important;max-width:100%!important;width:auto!important;border-radius:5px!important;white-space:normal!important;word-break:break-word!important;position:static!important;z-index:auto!important'}
function currencySymbol(value,text){const raw=(String(value||'')+' '+String(text||'')).trim().toUpperCase();if(raw.includes('IQD')||raw.includes('دينار'))return'IQD';if(raw.includes('TRY')||raw.includes(' TL')||raw==='TL'||raw.includes('ليرة'))return'TL';if(raw.includes('EUR')||raw.includes('€')||raw.includes('يورو'))return'€';if(raw.includes('USD')||raw.includes('$')||raw.includes('دولار'))return'$';return String(text||value||'').trim()}
function normalizeCurrencySelect(sel){if(!sel)return;[...sel.options].forEach(o=>{o.textContent=currencySymbol(o.value,o.textContent)});sel.style.setProperty('min-width','54px','important');sel.style.setProperty('text-align','center','important');sel.style.setProperty('text-align-last','center','important')}
function isBackupAction(el){const t=(String(el?.textContent||'')+' '+String(el?.title||'')+' '+String(el?.getAttribute?.('aria-label')||'')).toLowerCase();return t.includes('احتياط')||t.includes('backup')||t.includes('اتصال')||el?.matches?.('a[href^="tel:"]')}
function moveOperationalActions(sourceCells,target){const seen=new Set();sourceCells.filter(Boolean).forEach(cell=>{[...cell.querySelectorAll('a.btn-whatsapp,button,a[href^="tel:"]')].forEach(el=>{if(seen.has(el)||isBackupAction(el))return;const txt=(String(el.textContent||'')+' '+String(el.title||'')+' '+String(el.getAttribute('aria-label')||'')).toLowerCase();const isPrimaryWhatsApp=el.matches('a.btn-whatsapp')||txt.includes('واتساب')||txt.includes('whatsapp');const isSave=String(el.getAttribute('onclick')||'').includes('saveOrderRow');if(isPrimaryWhatsApp||isSave){seen.add(el);target.appendChild(el)}})})}
function installResponsiveCSS(){if(document.getElementById('mw-external-table-compact-v6'))return;const s=document.createElement('style');s.id='mw-external-table-compact-v6';s.textContent=`
${WRAP_SELECTOR}{width:100%!important;max-width:100%!important;overflow-x:hidden!important;overflow-y:visible!important}
${TABLE_SELECTOR}{width:100%!important;max-width:100%!important;min-width:0!important;table-layout:fixed!important;border-collapse:collapse!important}
${TABLE_SELECTOR} th,${TABLE_SELECTOR} td{box-sizing:border-box!important;min-width:0!important;max-width:none!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:12px!important;line-height:1.25!important;padding:5px 4px!important;vertical-align:middle!important}
${TABLE_SELECTOR} th{white-space:normal!important;word-break:break-word!important;font-size:11px!important;font-weight:900!important;text-align:center!important}
${TABLE_SELECTOR} input,${TABLE_SELECTOR} select{font-size:11px!important;height:30px!important;min-width:0!important;max-width:100%!important;padding:3px 4px!important;margin:0!important}
${TABLE_SELECTOR} button,${TABLE_SELECTOR} a.btn-whatsapp{font-size:10px!important;padding:5px 6px!important;margin:0!important;min-width:0!important;max-width:100%!important;white-space:normal!important;line-height:1.15!important}
${TABLE_SELECTOR} .customer-code,${TABLE_SELECTOR} .mini{font-size:10px!important}
${TABLE_SELECTOR} .qty-warning{font-size:9px!important;padding:3px 4px!important;margin-top:3px!important}
${TABLE_SELECTOR} .barcode-svg{max-width:105px!important;width:100%!important;height:30px!important;margin:2px auto!important}
html[data-mw-theme="light"] ${TABLE_SELECTOR} .customer-code{background:#fde68a!important;color:#78350f!important;border:1px solid #f59e0b!important;font-weight:900!important}
html[data-mw-theme="light"] ${TABLE_SELECTOR} .qty-badge{background:#fef3c7!important;color:#78350f!important;border:1px solid #f59e0b!important;font-weight:900!important}
@media(max-width:1250px){${TABLE_SELECTOR} th,${TABLE_SELECTOR} td{font-size:11px!important;padding:4px 3px!important}${TABLE_SELECTOR} th{font-size:10px!important}${TABLE_SELECTOR} input,${TABLE_SELECTOR} select{font-size:10px!important;height:28px!important;padding:2px 3px!important}${TABLE_SELECTOR} button,${TABLE_SELECTOR} a.btn-whatsapp{font-size:9px!important;padding:4px!important;min-height:25px!important}.barcode-svg{max-width:90px!important;height:27px!important}}
@media(max-width:1050px){${TABLE_SELECTOR} th,${TABLE_SELECTOR} td{font-size:10px!important;padding:3px 2px!important}${TABLE_SELECTOR} th{font-size:9px!important}${TABLE_SELECTOR} input,${TABLE_SELECTOR} select{font-size:9px!important;height:27px!important}${TABLE_SELECTOR} button,${TABLE_SELECTOR} a.btn-whatsapp{font-size:8.5px!important;padding:3px!important}}
`;document.head.appendChild(s)}
function header(){installResponsiveCSS();const table=document.querySelector(TABLE_SELECTOR),tr=table?.tHead?.rows?.[0];if(!tr)return;tr.innerHTML=labels.map((v,i)=>`<th style="width:${widths[i]}%">${v}</th>`).join('');table.style.setProperty('table-layout','fixed','important');table.style.setProperty('min-width','0','important');table.style.setProperty('width','100%','important');const wrap=document.querySelector(WRAP_SELECTOR);if(wrap){wrap.style.setProperty('overflow-x','hidden','important');wrap.style.setProperty('width','100%','important');wrap.style.setProperty('max-width','100%','important')}}
function findCell(el){return el?.closest('td')||null}
function setColumnWidths(tr){[...tr.cells].forEach((cell,i)=>{if(widths[i]!=null){cell.style.setProperty('width',widths[i]+'%','important');cell.style.setProperty('min-width','0','important')}})}

function rebuildEmployee(tr){
 if(!tr)return false;
 if(tr.dataset.mwV6Done==='1'){setColumnWidths(tr);tr.querySelectorAll('select[id^="currency-"],select[id^="externalCurrency-"]').forEach(normalizeCurrencySelect);return false}
 const price=tr.querySelector('input[id^="price-"]'),currency=tr.querySelector('select[id^="currency-"]'),pay=tr.querySelector('select[id^="pay-"]'),ext=tr.querySelector('[data-external-shipping]'),due=tr.querySelector('.collect-due');
 if(!price||!currency||!pay||!ext||!due)return false;
 const priceCell=findCell(price),branch=tr.querySelector('select[id^="branch-"]')?.closest('td'),status=tr.querySelector('select[id^="status-"]')?.closest('td');
 if(!priceCell||!branch||!status)return false;
 const cells=[...tr.cells],code=cells[0],customer=cells[1],qty=cells[2];
 const save=[...cells].find(c=>c.querySelector('button[onclick*="saveOrderRow"]'));
 if(!code||!customer||!qty||!save)return false;
 const ptd=td('product'),etd=td('external'),dtd=td('due'),atd=td('actions');
 const pg=controls();styleControl(price);styleControl(currency);normalizeCurrencySelect(currency);pg.append(price,currency);ptd.append(pg);
 styleExternal(ext);const extCurrency=ext.querySelector('select');normalizeCurrencySelect(extCurrency);etd.append(ext);
 const ds=stack();styleControl(pay);styleDue(due);ds.append(pay,due);dtd.append(ds);
 const warning=priceCell.querySelector('.qty-warning');if(warning){warning.style.marginTop='3px';qty.append(warning)}
 const aw=actions();moveOperationalActions(cells,aw);[...aw.querySelectorAll('button,a')].forEach(compactButton);atd.append(aw);
 // Critical: customer identity/contact/backup controls remain in the original customer TD.
 tr.replaceChildren(code,customer,qty,ptd,etd,dtd,branch,status,atd);
 [...tr.cells].forEach(compactCell);setColumnWidths(tr);tr.dataset.mwV6Done='1';return true;
}

function rebuildAdmin(tr){
 if(!tr)return false;
 if(tr.dataset.mwV6Done==='1'){setColumnWidths(tr);tr.querySelectorAll('select[id^="adminCurrency-"],select[id^="adminExternalCurrency-"]').forEach(normalizeCurrencySelect);return false}
 const price=tr.querySelector('input[id^="adminPrice-"]'),currency=tr.querySelector('select[id^="adminCurrency-"]'),pay=tr.querySelector('select[id^="adminPay-"]'),ext=tr.querySelector('[data-external-shipping]'),due=tr.querySelector('.collect-due');
 if(!price||!currency||!pay||!ext||!due)return false;
 const priceCell=findCell(price),branch=tr.querySelector('select[id^="adminBranch-"]')?.closest('td'),status=tr.querySelector('select[id^="adminStatus-"]')?.closest('td');
 if(!priceCell||!branch||!status)return false;
 const cells=[...tr.cells],code=cells[0],customer=cells[1],phone=cells[2],qty=cells[3],productInfo=cells[4];
 const action=[...cells].find(c=>c.querySelector('button[onclick*="saveAdminOrderRow"],button[onclick*="openOrderDetailsModalData"]'));
 if(!code||!customer||!phone||!qty||!productInfo||!action)return false;
 const ptd=td('product'),etd=td('external'),dtd=td('due');
 const pg=controls();styleControl(price);styleControl(currency);normalizeCurrencySelect(currency);pg.append(price,currency);ptd.append(pg);
 styleExternal(ext);normalizeCurrencySelect(ext.querySelector('select'));etd.append(ext);
 const ds=stack();styleControl(pay);styleDue(due);ds.append(pay,due);dtd.append(ds);
 const warning=priceCell.querySelector('.qty-warning');if(warning){warning.style.marginTop='3px';qty.append(warning)}
 const aw=actions();while(action.firstChild)aw.appendChild(action.firstChild);[...aw.querySelectorAll('button,a')].forEach(compactButton);action.append(aw);
 tr.replaceChildren(code,customer,phone,qty,productInfo,ptd,etd,dtd,branch,status,action);
 [...tr.cells].forEach(compactCell);setColumnWidths(tr);tr.dataset.mwV6Done='1';return true;
}

function apply(){header();const body=document.getElementById(BODY_ID);if(!body)return;[...body.rows].forEach(tr=>screen==='employee'?rebuildEmployee(tr):rebuildAdmin(tr))}
function observe(){const body=document.getElementById(BODY_ID);if(!body||body.dataset.mwV6Observed==='1')return;body.dataset.mwV6Observed='1';new MutationObserver(()=>queueMicrotask(apply)).observe(body,{childList:true,subtree:true})}
const loader=screen==='employee'?'loadPipelineOrders':'loadAdminOrders',base=window[loader];if(typeof base==='function'&&!base.__mwV6){const w=async function(...args){const r=await base.apply(this,args);apply();observe();return r};w.__mwV6=true;window[loader]=w}
setTimeout(()=>{apply();observe()},50);setTimeout(apply,250);setTimeout(apply,700);
window.addEventListener('resize',()=>requestAnimationFrame(apply));
window.MeshwarExternalShippingTableLayoutV6={version:'20260826-v6.1-customer-cell',apply};
})();
