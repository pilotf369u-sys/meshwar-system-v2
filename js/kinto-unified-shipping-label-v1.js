/* KINTO unified shipping label renderer — presentation only.
 * Monetary values MUST be verified outstanding balances, never gross totals.
 * No database writes, no order state mutations.
 */
(function(global){
'use strict';
const escape=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const present=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&String(v).trim()!=='---';
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
function invoiceCollection(order){
 const o=order||{},d=typeof o.details==='object'&&o.details?o.details:(()=>{try{return JSON.parse(o.details||'{}')}catch{return{}}})();
 const type=String(o.delivery_payment_type||d.delivery_payment_type||'');
 const num=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
 const curr=v=>String(v||'').trim();
 const currency=curr(o.currency||d.currency);
 const externalCurrency=curr(o.external_shipping_currency||d.external_shipping_currency||currency);
 const internalCurrency=curr(o.delivery_currency||d.delivery_currency||currency);
 const isSegment=Boolean(o._v95SegmentId||o.segment_id||o._invoiceStoreScopeV58);
 const segmentId=o._v95SegmentId||o.segment_id;
 const collector=o.external_shipping_collector_segment_id;
 const external=collector&&segmentId&&String(collector)!==String(segmentId)?0:num(o.external_shipping_fee??d.external_shipping_fee);
 const internal=num(o.delivery_fee??d.delivery_fee);
 if(type==='paid_prepaid')return {type,amounts:[]};
 if(type==='product_paid_delivery_cod'){
  if(external===null||internal===null||!externalCurrency||!internalCurrency)return {type,amounts:null};
  const amounts=[];
  if(external>0)amounts.push({amount:external,currency:externalCurrency});
  if(internal>0)amounts.push({amount:internal,currency:internalCurrency});
  return {type,amounts};
 }
 if(type==='cod_full'){
  // A store segment must never inherit the parent invoice total.
  if(isSegment||!global.KintoBundleV93||typeof global.KintoBundleV93.totals!=='function')return {type,amounts:null};
  try{
   const t=global.KintoBundleV93.totals(o);
   if(!t||num(t.grand)===null||!curr(t.currency))return {type,amounts:null};
   const c=curr(t.currency).toUpperCase(),dc=curr(t.deliveryCurrency||c).toUpperCase();
   const reward=t.reward||{},campaign=t.campaign||{};
   if(num(reward.amount)>0&&curr(reward.currency).toUpperCase()!==c)return {type,amounts:null};
   if(num(campaign.amount)>0&&curr(campaign.currency).toUpperCase()!==c)return {type,amounts:null};
   if(t.mixed){
    const base=num(t.goods),ext=num(t.external),delivery=num(t.delivery);
    if(base===null||ext===null||delivery===null||!dc)return {type,amounts:null};
    const discount=(curr(reward.currency).toUpperCase()===c?Number(reward.amount)||0:0)+(curr(campaign.currency).toUpperCase()===c?Number(campaign.amount)||0:0);
    return {type,amounts:[{amount:Math.max(0,base+ext-discount),currency:c},{amount:delivery,currency:dc}].filter(x=>x.amount>0)};
   }
   return {type,amounts:t.grand>0?[{amount:t.grand,currency:c}]:[]};
  }catch(e){console.warn('KINTO invoice collection unavailable',e);return {type,amounts:null}}
 }
 return {type,amounts:null};
}
function collectionCharges(order){return invoiceCollection(order)}
function render(data){
 const d=data||{}, code=String(d.orderCode||'').trim();
 if(!code)throw Error('Order code is required');
 const lines=[];
 function field(label,value){if(present(value))lines.push('<div class="field"><b>'+escape(label)+'</b><span>'+escape(value)+'</span></div>')}
 field('المتجر',d.storeName);field('المستلم',d.customerName);
 field('الهاتف',d.phone);field('هاتف احتياطي',d.secondaryPhone);
 field('المحافظة',d.governorate);field('القضاء',d.district);field('الناحية',d.subdistrict);
 field('المنطقة',d.area);field('الحي',d.neighborhood);field('الشارع',d.street);
 field('العنوان التفصيلي',d.address);field('أقرب نقطة دالة',d.landmark);
 field('ملاحظات التوصيل',d.deliveryNotes);field('الفرع',d.branch);
 field('رقم مرجعي',d.referenceOrderNo);field('عدد القطع',d.pieces);field('عدد الطرود',d.parcels);
 field('تاريخ الطلب',d.date);
 const collection=d.invoiceCollection||d.collectionCharges||null;
 if(collection&&collection.type==='paid_prepaid')field('التحصيل','مدفوع شامل — لا يوجد مبلغ للتحصيل');
 else if(collection&&Array.isArray(collection.amounts)){
  const groups=new Map();let valid=true;
  for(const x of collection.amounts){
   if(!x||typeof x.amount!=='number'||!Number.isFinite(x.amount)||x.amount<0||!present(x.currency)){valid=false;break}
   const c=String(x.currency).trim().toUpperCase();groups.set(c,(groups.get(c)||0)+x.amount);
  }
  if(!valid)field('التحصيل','راجع الفاتورة — مبلغ التحصيل غير مؤكد');
  else if(!groups.size)field('التحصيل','لا يوجد مبلغ للتحصيل');
  else field(collection.type==='cod_full'?'التحصيل الكامل شامل الشحن والتوصيل':'تحصيل الشحن الخارجي والتوصيل الداخلي',[...groups].map(([c,v])=>v.toLocaleString('en-US',{maximumFractionDigits:2})+' '+c).join(' + '));
 }else field('التحصيل','راجع الفاتورة — مبلغ التحصيل غير مؤكد');
 const logo=escape(d.logoUrl||'images/kinto-header-logo-v158.jpeg');
 return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>KINTO — '+escape(code)+'</title>'+
 '<style>@page{size:100mm 100mm;margin:0}*{box-sizing:border-box}body{margin:0;font:10px Arial,sans-serif;color:#111;background:#fff}.sheet{width:100mm;min-height:100mm;padding:3mm;break-after:page}.head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0a2f23;padding-bottom:2mm}.head img{max-height:12mm;max-width:34mm;object-fit:contain}.head strong{font-size:16px;color:#0a2f23}.code{text-align:center;font-size:15px;font-weight:bold;margin:2mm 0}.barcode{text-align:center}.barcode svg{max-width:90mm;height:13mm}.fields{display:grid;grid-template-columns:1fr 1fr;gap:1mm;margin-top:2mm}.field{border:1px solid #aaa;border-radius:2px;padding:1mm;min-width:0;overflow-wrap:anywhere}.field b{display:block;font-size:8px;color:#444}.field span{font-weight:700;font-size:10px}@media print{body{margin:0}.sheet{width:100mm;min-height:100mm}}</style></head><body><section class="sheet"><header class="head"><img src="'+logo+'" alt="KINTO"><strong>KINTO</strong></header><div class="code">'+escape(code)+'</div><div class="barcode"><svg id="kintoLabelBarcode"></svg></div><div class="fields">'+lines.join('')+'</div></section>'+
 '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script><script>window.addEventListener("load",function(){try{if(window.JsBarcode)JsBarcode("#kintoLabelBarcode",'+JSON.stringify(code)+',{format:"CODE128",displayValue:false,height:36,margin:0})}catch(e){console.error(e)}setTimeout(function(){window.print()},300)});</script></body></html>';
}
function print(data){const w=global.open('','_blank','width=700,height=750');if(!w)throw Error('Popup blocked');w.document.open();w.document.write(render(data));w.document.close();return w}
global.KintoUnifiedShippingLabel={render,print,collectionCharges,invoiceCollection};
})(window);
