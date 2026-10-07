/* MESHWAR_BRANCH_WHATSAPP_CONTACT_V1
   Append-only UI enhancement for Branch Dashboard.
   - Reuses customer phone already loaded by branch-dashboard.html.
   - No Supabase reads/writes.
   - No replacement of existing DOM, render functions, or event handlers.
   - Native anchor navigation only (https://wa.me/<customer_phone>).
*/
(function(){
'use strict';

function digits(value){
  return String(value||'').replace(/[^0-9]/g,'');
}

function shipmentPhone(order){
  return String(order?._customer_phone||order?.customer_phone||'').trim();
}

function whatsappLink(phone){
  const number=digits(phone);
  if(!number)return null;
  const a=document.createElement('a');
  a.className='mw-branch-whatsapp-link';
  a.href='https://wa.me/'+number;
  a.target='_blank';
  a.rel='noopener noreferrer';
  a.title='مراسلة الزبون عبر واتساب';
  a.setAttribute('aria-label','مراسلة الزبون عبر واتساب');
  a.textContent='🟢 واتساب';
  return a;
}

function decorateOrderRows(){
  let list;
  try{list=typeof orders!=='undefined'&&Array.isArray(orders)?orders:[]}catch{return}
  for(const order of list){
    const id=order?.id==null?'':String(order.id).trim();
    if(!id)continue;
    const row=document.getElementById('row-'+encodeURIComponent(id));
    if(!row||row.querySelector('.mw-branch-whatsapp-primary'))continue;
    const customerCell=row.children?.[2];
    if(!customerCell)continue;
    const link=whatsappLink(shipmentPhone(order));
    if(!link)continue;
    const wrap=document.createElement('span');
    wrap.className='contact-mini mw-branch-whatsapp-primary';
    wrap.appendChild(link);
    customerCell.appendChild(wrap);
  }
}

function decorateScanCard(){
  let order;
  try{order=typeof scannedOrder!=='undefined'?scannedOrder:null}catch{return}
  if(!order)return;
  const card=document.getElementById('scanResultCard');
  const customerBox=card?.querySelector('.scan-item');
  if(!customerBox||customerBox.querySelector('.mw-branch-whatsapp-primary'))return;
  const link=whatsappLink(shipmentPhone(order));
  if(!link)return;
  const wrap=document.createElement('span');
  wrap.className='contact-mini mw-branch-whatsapp-primary';
  wrap.appendChild(link);
  customerBox.appendChild(wrap);
}

function decorate(){
  decorateOrderRows();
  decorateScanCard();
}

let queued=false;
function queueDecorate(){
  if(queued)return;
  queued=true;
  requestAnimationFrame(()=>{queued=false;decorate()});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',decorate,{once:true});
else decorate();

const root=document.getElementById('ordersBody')?.parentElement||document.body;
const observer=new MutationObserver(queueDecorate);
observer.observe(root,{childList:true,subtree:true});

window.MeshwarBranchWhatsAppContactV1={version:'20260827-v1',refresh:decorate};
})();
