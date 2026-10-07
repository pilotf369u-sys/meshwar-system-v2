/* MESHWAR_EXTERNAL_SHIPPING_TABLE_LAYOUT_V5 */
(function(){
'use strict';
const script=document.currentScript,screen=String(script?.dataset?.meshwarScreen||'').trim().toLowerCase();
if(screen!=='employee'&&screen!=='admin')return;

function setControl(el,width){if(!el)return;el.style.width=width||'100%';el.style.maxWidth='100%';el.style.minWidth='0';el.style.height='38px';el.style.margin='0';el.style.boxSizing='border-box'}
function newCell(kind,minWidth){const td=document.createElement('td');td.dataset.mwLayoutV5=kind;td.style.minWidth=minWidth||'150px';td.style.verticalAlign='middle';td.style.padding='10px 8px';td.style.position='static';td.style.overflow='visible';return td}
function fieldGrid(){const d=document.createElement('div');d.style.cssText='display:grid;grid-template-columns:minmax(82px,1fr) minmax(72px,.72fr);gap:6px;align-items:center;width:100%';return d}
function stack(){const d=document.createElement('div');d.style.cssText='display:flex;flex-direction:column;gap:7px;align-items:stretch;width:100%;min-width:0';return d}
function actionWrap(){const d=document.createElement('div');d.style.cssText='display:flex;gap:6px;align-items:center;justify-content:center;flex-wrap:wrap;min-width:170px';return d}
function styleDue(due){if(!due)return;due.style.cssText='display:flex;align-items:center;justify-content:center;min-height:38px;margin:0;padding:7px 9px;border-radius:8px;background:#fff7ed;color:#9a3412;font-weight:900;border:1px solid #fed7aa;white-space:nowrap;position:static;z-index:auto'}
function styleExternal(root){if(!root)return;root.style.cssText='display:grid;grid-template-columns:minmax(82px,1fr) minmax(72px,.72fr);gap:6px;align-items:center;width:100%;padding:0;margin:0;border:0;background:transparent;position:static;z-index:auto';const label=root.querySelector('label');if(label)label.style.display='none';root.querySelectorAll('input,select').forEach(el=>setControl(el))}
function moveChildren(from,to){if(!from||!to)return;while(from.firstChild)to.appendChild(from.firstChild)}
function setHeaders(table,labels){const tr=table?.tHead?.rows?.[0];if(!tr)return;tr.innerHTML=labels.map(x=>`<th>${x}</th>`).join('');table.style.tableLayout='auto';table.style.width='100%';table.style.minWidth=screen==='employee'?'1620px':'1850px';}

function employeeRow(tr){if(!tr||tr.dataset.mwTableV5==='1')return;const c=[...tr.cells];if(c.length!==8)return;
  const [code,customer,qty,priceCell,branch,status,contact,save]=c;
  const id=(priceCell.querySelector('[data-external-shipping]')?.dataset.externalShipping)||'';
  const price=document.getElementById('price-'+id),currency=document.getElementById('currency-'+id),pay=document.getElementById('pay-'+id),ext=priceCell.querySelector('[data-external-shipping]'),due=priceCell.querySelector('.collect-due'),qtyWarn=priceCell.querySelector('.qty-warning');
  if(!price||!currency||!pay||!ext||!due)return;
  const productTd=newCell('product','180px'),extTd=newCell('external','190px'),dueTd=newCell('due','220px'),actionsTd=newCell('actions','210px');
  const p=fieldGrid();setControl(price);setControl(currency);p.append(price,currency);productTd.appendChild(p);
  styleExternal(ext);extTd.appendChild(ext);
  const ds=stack();setControl(pay);styleDue(due);ds.append(pay,due);dueTd.appendChild(ds);
  if(qtyWarn){qtyWarn.style.marginTop='7px';qty.appendChild(qtyWarn)}
  const aw=actionWrap();moveChildren(contact,aw);moveChildren(save,aw);actionsTd.appendChild(aw);
  priceCell.replaceWith(productTd,extTd,dueTd);contact.replaceWith(actionsTd);save.remove();
  [code,customer,qty,productTd,extTd,dueTd,branch,status,actionsTd].forEach(td=>{td.style.position='static';td.style.zIndex='auto'});
  branch.style.minWidth='145px';status.style.minWidth='165px';actionsTd.style.minWidth='230px';tr.dataset.mwTableV5='1';
}
function adminRow(tr){if(!tr||tr.dataset.mwTableV5==='1')return;const c=[...tr.cells];if(c.length!==9)return;
  const [code,customer,phone,qty,productInfo,priceCell,branch,status,actions]=c;
  const id=(priceCell.querySelector('[data-external-shipping]')?.dataset.externalShipping)||'';
  const price=document.getElementById('adminPrice-'+id),currency=document.getElementById('adminCurrency-'+id),pay=document.getElementById('adminPay-'+id),ext=priceCell.querySelector('[data-external-shipping]'),due=priceCell.querySelector('.collect-due'),qtyWarn=priceCell.querySelector('.qty-warning');
  if(!price||!currency||!pay||!ext||!due)return;
  const productTd=newCell('product-price','180px'),extTd=newCell('external','190px'),dueTd=newCell('due','220px');
  const p=fieldGrid();setControl(price);setControl(currency);p.append(price,currency);productTd.appendChild(p);
  styleExternal(ext);extTd.appendChild(ext);
  const ds=stack();setControl(pay);styleDue(due);ds.append(pay,due);dueTd.appendChild(ds);
  if(qtyWarn){qtyWarn.style.marginTop='7px';qty.appendChild(qtyWarn)}
  priceCell.replaceWith(productTd,extTd,dueTd);
  [code,customer,phone,qty,productInfo,productTd,extTd,dueTd,branch,status,actions].forEach(td=>{td.style.position='static';td.style.zIndex='auto'});
  branch.style.minWidth='145px';status.style.minWidth='165px';actions.style.minWidth='170px';
  const aw=actionWrap();moveChildren(actions,aw);actions.appendChild(aw);tr.dataset.mwTableV5='1';
}
function applyEmployee(){const table=document.querySelector('#ordersPanel .table-wrap table');if(!table)return;setHeaders(table,['رقم الطلب / Sipariş / باركود','العميل / الكود','الكمية','سعر السلعة','أجور الشحن الخارجي','التحصيل الصافي (عند الباب)','الفرع','الحالة','الإجراءات']);document.querySelectorAll('#pipelineOrdersBody tr').forEach(employeeRow)}
function applyAdmin(){const table=document.querySelector('#ordersListPanel .table-wrap table');if(!table)return;setHeaders(table,['رقم الطلب / Sipariş / باركود','العميل / الكود','الهاتف','الكمية','المنتج','سعر السلعة','أجور الشحن الخارجي','التحصيل الصافي (عند الباب)','الفرع','الحالة','الإجراءات']);document.querySelectorAll('#adminOrdersTableBody tr').forEach(adminRow)}
function apply(){if(screen==='employee')applyEmployee();else applyAdmin()}
function wrapLoader(){const name=screen==='employee'?'loadPipelineOrders':'loadAdminOrders',base=window[name];if(typeof base!=='function'||base.__mwTableV5)return;const wrapped=async function(...args){const r=await base.apply(this,args);setTimeout(apply,0);return r};wrapped.__mwTableV5=true;window[name]=wrapped}
wrapLoader();setTimeout(apply,80);setTimeout(apply,350);
window.MeshwarExternalShippingTableLayoutV5={version:'20260825-v5',apply};
})();
