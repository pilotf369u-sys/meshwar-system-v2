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
 const rawExternal=num(o.external_shipping_fee??d.external_shipping_fee);
 const external=isSegment&&rawExternal>0&&!collector?null:collector&&segmentId&&String(collector)!==String(segmentId)?0:rawExternal;
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
function destination(order){
 const o=order||{},d=typeof o.details==='object'&&o.details?o.details:(()=>{try{return JSON.parse(o.details||'{}')}catch{return{}}})();
 const c=o._kintoCustomer||d.customer||{},loc=typeof o.customer_location==='object'&&o.customer_location?o.customer_location:(()=>{try{return JSON.parse(o.customer_location||d.customer_location||'{}')}catch{return{}}})();
 const pick=(...values)=>values.find(v=>v!=null&&String(v).trim()&&!['---','غير محددة','undefined','null'].includes(String(v).trim()))||'';
 return {
 country:pick(c.country,c.country_name,o.country,o.customer_country,d.country,d.customer_country,loc.country),
 governorate:pick(c.province,c.governorate,c.state,c.city,o._customer_governorate,o.governorate,o.province,o.state,o.city,d.customer_governorate,d.customer_province,d.province,d.governorate,d.state,d.city,loc.province,loc.governorate,loc.city),
 address:pick(c.address,c.address_details,c.full_address,c.delivery_address,o.customer_address,o.address,o.address_details,o.delivery_address,d.customer_address,d.address,d.address_details,d.full_address,d.delivery_address,loc.address,loc.address_details,loc.full_address),
 district:pick(c.district,o.district,d.district,loc.district),
 subdistrict:pick(c.subdistrict,o.subdistrict,d.subdistrict,loc.subdistrict),
 area:pick(c.area,o.area,d.area,loc.area),
 neighborhood:pick(c.neighborhood,o.neighborhood,d.neighborhood,loc.neighborhood),
 street:pick(c.street,o.street,d.street,loc.street),
 landmark:pick(c.landmark,o.landmark,d.landmark,loc.landmark)
 };
}
function buildOrderLabel(order,opts){
 const o=order||{},x=opts||{},d=typeof o.details==='object'&&o.details?o.details:(()=>{try{return JSON.parse(o.details||'{}')}catch{return{}}})();
 const c=o._kintoCustomer||d.customer||{};
 const pick=(...v)=>v.find(y=>y!==null&&y!==undefined&&String(y).trim()&&String(y).trim()!=='---')||'';
 const dest=destination(o);
 return {orderCode:pick(o.order_code,o.id),referenceOrderNo:pick(o.reference_order_no),storeName:pick(x.storeName,o.store_name,d.store_name),customerName:pick(c.name,c.customer_name,o.customer_name,d.customer_name),customerCode:pick(c.code,c.customer_code,o._customer_code,o.customer_code,d.customer_code),phone:pick(c.phone,c.customer_phone,o.customer_phone,o.phone,d.phone),secondaryPhone:pick(c.secondary_phone,c.secondaryPhone,c.alternate_phone,c.alternative_phone,c.backup_phone,c.phone2,c.second_phone,c.phone_secondary,o.secondary_phone,o.secondaryPhone,o.alternate_phone,o.backup_phone,d.secondary_phone,d.alternate_phone,d.backup_phone),...dest,deliveryNotes:pick(o.delivery_notes,d.delivery_notes),branch:pick(o.branch_name,d.branch_name),pieces:x.pieces,parcels:x.parcels,date:o.created_at?new Date(o.created_at).toLocaleDateString('en-GB'):'',invoiceCollection:x.invoiceCollection||invoiceCollection(o),storeInvoiceTotal:x.storeInvoiceTotal||''};
}
function render(data){
 const d=data||{}, code=String(d.orderCode||'').trim();
 if(!code)throw Error('Order code is required');
 const lines=[];
 function field(label,value){if(present(value))lines.push('<div class="field">'+(present(label)?'<b>'+escape(label)+'</b>':'')+'<span>'+escape(value)+'</span></div>')}
 field('المتجر',d.storeName);field('المستلم',[d.customerName,present(d.customerCode)?'('+d.customerCode+')':''].filter(present).join('  '));
 field('الهاتف',d.phone);field('هاتف احتياطي',d.secondaryPhone);
 field('الدولة / المحافظة',[d.country,d.governorate].filter(present).join(' — '));field('القضاء',d.district);field('الناحية',d.subdistrict);
 field('المنطقة',d.area);field('الحي',d.neighborhood);field('الشارع',d.street);
 field('العنوان التفصيلي',d.address);field('أقرب نقطة دالة',d.landmark);
 field('ملاحظات التوصيل',d.deliveryNotes);field('الفرع',d.branch);
 field('رقم مرجعي',d.referenceOrderNo);field('','قطع: '+(present(d.pieces)?d.pieces:'—')+' | طرود: '+(present(d.parcels)?d.parcels:'—'));
 field('تاريخ الطلب',d.date);
 const collection=d.invoiceCollection||d.collectionCharges||null;
 if(collection&&collection.type==='paid_prepaid')field('','واصل');
 else if(collection&&Array.isArray(collection.amounts)){
  const groups=new Map();let valid=true;
  for(const x of collection.amounts){
   if(!x||typeof x.amount!=='number'||!Number.isFinite(x.amount)||x.amount<0||!present(x.currency)){valid=false;break}
   const c=String(x.currency).trim().toUpperCase();groups.set(c,(groups.get(c)||0)+x.amount);
  }
  if(!valid)field('','راجع الفاتورة — مبلغ غير مؤكد');
  else if(!groups.size||![...groups.values()].some(v=>v>0))field('','واصل');
  else field('المبلغ',[...groups].filter(([,v])=>v>0).map(([c,v])=>v.toLocaleString('en-US',{maximumFractionDigits:2})+' '+c).join(' + '));
 }else if(present(d.storeInvoiceTotal))field('قيمة فاتورة المتجر',d.storeInvoiceTotal);
 else field('','راجع الفاتورة — مبلغ غير مؤكد');
 const logo=escape(d.logoUrl||'images/kinto-header-logo-v158.jpeg');
 return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>KINTO — '+escape(code)+'</title>'+
 '<style id="kintoPageStyle">@page{size:4in 5in;margin:0}</style><style>*{box-sizing:border-box}body{margin:0;font:10px Arial,sans-serif;color:#111;background:#fff}.sheet{width:4in;max-width:100%;padding:2mm;break-inside:avoid;page-break-inside:avoid}.head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0a2f23;padding-bottom:2mm}.head img{max-height:10mm;max-width:25mm;object-fit:contain}.head strong{font-size:13px;color:#0a2f23}.head-code{flex:1;min-width:0;max-width:43mm;margin:0 1mm;text-align:center}.code{text-align:center;font-size:10px;font-weight:bold;margin:0;white-space:nowrap}.barcode{text-align:center}.barcode svg{max-width:100%;height:7mm}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1mm;margin-top:2mm}.field{display:flex;align-items:baseline;gap:1mm;border:1px solid #aaa;border-radius:2px;padding:0.7mm;min-width:0;overflow-wrap:anywhere}.field b{flex-shrink:0;display:inline;font-size:8px;color:#444}.field b::after{content:":"}.field:not(:has(b)){justify-content:center}.field:not(:has(b)) span{font-size:11px}.field span{display:inline;font-weight:700;font-size:9px;min-width:0}@media print{.print-controls{display:none}html,body{margin:0;padding:0}.sheet{width:100%;max-width:100%;height:auto;min-height:0;break-after:auto;page-break-after:auto}.fields{gap:0.7mm;margin-top:1mm}.field{padding:0.45mm}.head{padding-bottom:1mm}}</style></head><body><div class="print-controls" style="text-align:center;padding:6px;background:#eee"><label>حجم الورق <select id="kintoSize" onchange="kintoSetSize(this.value)"><option value="4in 5in">4 × 5 إنچ (الطابعة)</option><option value="100mm 100mm">10 × 10 سم</option><option value="80mm 80mm">8 × 8 سم</option><option value="50mm 40mm">5 × 4 سم</option><option value="A4">A4</option><option value="auto">حسب الطابعة</option></select></label><button onclick="window.print()">طباعة</button></div><section class="sheet"><header class="head"><img src="'+logo+'" alt="KINTO"><div class="head-code"><div class="barcode"><svg id="kintoLabelBarcode"></svg></div><div class="code">'+escape(code)+'</div></div><strong>KINTO</strong></header><div class="fields">'+lines.join('')+'</div></section>'+
 '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script><script>function kintoSetSize(v){if(!["4in 5in","100mm 100mm","80mm 80mm","50mm 40mm","A4","auto"].includes(v))return;document.getElementById("kintoPageStyle").textContent="@page{size:"+v+";margin:0}";var sheet=document.querySelector(".sheet");sheet.style.width=v==="A4"||v==="auto"?"100mm":v.split(" ")[0];sheet.style.maxWidth="100%";}window.addEventListener("load",function(){try{if(window.JsBarcode)JsBarcode("#kintoLabelBarcode",'+JSON.stringify(code)+',{format:"CODE128",displayValue:false,height:36,margin:0})}catch(e){console.error(e)}/* Paper selection is made before printing; never auto-print before user can choose. */});</script></body></html>';
}
function print(data,popup){const w=popup||global.open('','_blank','width=700,height=750');if(!w)throw Error('Popup blocked');if(typeof w.document.open==='function')w.document.open();w.document.write(render(data));w.document.close();return w}
global.KintoUnifiedShippingLabel={render,print,collectionCharges,invoiceCollection,destination,buildOrderLabel};
})(window);
