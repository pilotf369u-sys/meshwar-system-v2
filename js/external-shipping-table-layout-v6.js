/* MESHWAR_EXTERNAL_SHIPPING_TABLE_LAYOUT_V6 */
(function(){
'use strict';
const script=document.currentScript,screen=String(script?.dataset?.meshwarScreen||'').trim().toLowerCase();
if(screen!=='employee'&&screen!=='admin')return;

const BODY_ID=screen==='employee'?'pipelineOrdersBody':'adminOrdersTableBody';
const TABLE_SELECTOR=screen==='employee'?'#ordersPanel .table-wrap table':'#ordersListPanel .table-wrap table';
const labels=screen==='employee'
 ? ['رقم الطلب / Sipariş / باركود','العميل / الكود','الكمية','سعر السلعة','أجور الشحن الخارجي','التحصيل الصافي (عند الباب)','الفرع','الحالة','الإجراءات']
 : ['رقم الطلب / Sipariş / باركود','العميل / الكود','الهاتف','الكمية','المنتج','سعر السلعة','أجور الشحن الخارجي','التحصيل الصافي (عند الباب)','الفرع','الحالة','الإجراءات'];

function td(kind,minWidth){const x=document.createElement('td');x.dataset.mwV6=kind;x.style.cssText=`min-width:${minWidth||150}px;padding:10px 8px;vertical-align:middle;position:static!important;z-index:auto!important;overflow:visible`;return x}
function controls(){const x=document.createElement('div');x.style.cssText='display:grid;grid-template-columns:minmax(86px,1fr) minmax(74px,.72fr);gap:7px;align-items:center;width:100%;min-width:0';return x}
function stack(){const x=document.createElement('div');x.style.cssText='display:flex;flex-direction:column;gap:7px;align-items:stretch;width:100%;min-width:0';return x}
function actions(){const x=document.createElement('div');x.style.cssText='display:flex;flex-wrap:wrap;gap:6px;align-items:center;justify-content:center;width:100%;min-width:180px';return x}
function styleControl(el){if(!el)return;el.style.cssText+=';width:100%!important;max-width:100%!important;min-width:0!important;height:38px!important;margin:0!important;box-sizing:border-box!important;position:static!important;z-index:auto!important'}
function styleExternal(root){root.querySelector('label')?.remove();root.style.cssText='display:grid!important;grid-template-columns:minmax(86px,1fr) minmax(74px,.72fr)!important;gap:7px!important;align-items:center!important;width:100%!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important;position:static!important;z-index:auto!important';root.querySelectorAll('input,select').forEach(styleControl)}
function styleDue(el){el.style.cssText='display:flex!important;align-items:center!important;justify-content:center!important;min-height:38px!important;margin:0!important;padding:7px 9px!important;border-radius:8px!important;background:#fff7ed!important;color:#9a3412!important;font-weight:900!important;border:1px solid #fed7aa!important;white-space:nowrap!important;position:static!important;z-index:auto!important'}
function moveAll(from,to){if(!from||!to)return;while(from.firstChild)to.appendChild(from.firstChild)}
function header(){const table=document.querySelector(TABLE_SELECTOR),tr=table?.tHead?.rows?.[0];if(!tr)return;tr.innerHTML=labels.map(v=>`<th>${v}</th>`).join('');table.style.tableLayout='auto';table.style.minWidth=screen==='employee'?'1650px':'1900px';table.style.width='100%'}
function findCell(el){return el?.closest('td')||null}

function rebuildEmployee(tr){
 if(!tr||tr.dataset.mwV6Done==='1')return false;
 const price=tr.querySelector('input[id^="price-"]'),currency=tr.querySelector('select[id^="currency-"]'),pay=tr.querySelector('select[id^="pay-"]'),ext=tr.querySelector('[data-external-shipping]'),due=tr.querySelector('.collect-due');
 if(!price||!currency||!pay||!ext||!due)return false;
 const priceCell=findCell(price),branch=tr.querySelector('select[id^="branch-"]')?.closest('td'),status=tr.querySelector('select[id^="status-"]')?.closest('td');
 if(!priceCell||!branch||!status)return false;
 const cells=[...tr.cells],code=cells[0],customer=cells[1],qty=cells[2];
 const contact=[...cells].find(c=>c.querySelector('a.btn-whatsapp,button[onclick*="openChat"],button[onclick*="openCustomerPortal"]'));
 const save=[...cells].find(c=>c.querySelector('button[onclick*="saveOrderRow"]'));
 if(!code||!customer||!qty||!contact||!save)return false;
 const ptd=td('product',185),etd=td('external',195),dtd=td('due',230),atd=td('actions',235);
 const pg=controls();styleControl(price);styleControl(currency);pg.append(price,currency);ptd.append(pg);
 styleExternal(ext);etd.append(ext);
 const ds=stack();styleControl(pay);styleDue(due);ds.append(pay,due);dtd.append(ds);
 const warning=priceCell.querySelector('.qty-warning');if(warning){warning.style.marginTop='7px';qty.append(warning)}
 const aw=actions();moveAll(contact,aw);moveAll(save,aw);atd.append(aw);
 // Construct the row explicitly. No legacy price/contact/save cells survive.
 tr.replaceChildren(code,customer,qty,ptd,etd,dtd,branch,status,atd);
 tr.dataset.mwV6Done='1';return true;
}

function rebuildAdmin(tr){
 if(!tr||tr.dataset.mwV6Done==='1')return false;
 const price=tr.querySelector('input[id^="adminPrice-"]'),currency=tr.querySelector('select[id^="adminCurrency-"]'),pay=tr.querySelector('select[id^="adminPay-"]'),ext=tr.querySelector('[data-external-shipping]'),due=tr.querySelector('.collect-due');
 if(!price||!currency||!pay||!ext||!due)return false;
 const priceCell=findCell(price),branch=tr.querySelector('select[id^="adminBranch-"]')?.closest('td'),status=tr.querySelector('select[id^="adminStatus-"]')?.closest('td');
 if(!priceCell||!branch||!status)return false;
 const cells=[...tr.cells],code=cells[0],customer=cells[1],phone=cells[2],qty=cells[3],productInfo=cells[4];
 const action=[...cells].find(c=>c.querySelector('button[onclick*="saveAdminOrderRow"],button[onclick*="openOrderDetailsModalData"]'));
 if(!code||!customer||!phone||!qty||!productInfo||!action)return false;
 const ptd=td('product',185),etd=td('external',195),dtd=td('due',230);
 const pg=controls();styleControl(price);styleControl(currency);pg.append(price,currency);ptd.append(pg);
 styleExternal(ext);etd.append(ext);
 const ds=stack();styleControl(pay);styleDue(due);ds.append(pay,due);dtd.append(ds);
 const warning=priceCell.querySelector('.qty-warning');if(warning){warning.style.marginTop='7px';qty.append(warning)}
 const aw=actions();moveAll(action,aw);action.append(aw);action.style.minWidth='190px';
 tr.replaceChildren(code,customer,phone,qty,productInfo,ptd,etd,dtd,branch,status,action);
 tr.dataset.mwV6Done='1';return true;
}

function apply(){header();const body=document.getElementById(BODY_ID);if(!body)return;[...body.rows].forEach(tr=>screen==='employee'?rebuildEmployee(tr):rebuildAdmin(tr))}
function observe(){const body=document.getElementById(BODY_ID);if(!body||body.dataset.mwV6Observed==='1')return;body.dataset.mwV6Observed='1';new MutationObserver(()=>queueMicrotask(apply)).observe(body,{childList:true,subtree:true})}
const loader=screen==='employee'?'loadPipelineOrders':'loadAdminOrders',base=window[loader];if(typeof base==='function'&&!base.__mwV6){const w=async function(...args){const r=await base.apply(this,args);apply();observe();return r};w.__mwV6=true;window[loader]=w}
setTimeout(()=>{apply();observe()},50);setTimeout(apply,250);setTimeout(apply,700);
window.MeshwarExternalShippingTableLayoutV6={version:'20260825-v6',apply};
})();
