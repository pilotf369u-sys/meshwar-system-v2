/* KINTO unified shipping label renderer — presentation only.
 * Monetary values MUST be verified outstanding balances, never gross totals.
 * No database writes, no order state mutations.
 */
(function(global){
'use strict';
const escape=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const present=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&String(v).trim()!=='---';
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
function collectionCharges(order){
 const o=order||{},d=typeof o.details==='object'&&o.details?o.details:(()=>{try{return JSON.parse(o.details||'{}')}catch{return{}}})();
 const t=String(o.delivery_payment_type||'');
 const status=t==='paid_prepaid'?['collected','collected','collected']:t==='cod_full'?['uncollected','uncollected','uncollected']:t==='product_paid_delivery_cod'?['collected','uncollected','uncollected']:null;
 if(!status)return null;
 const read=(...v)=>{for(const x of v){if(x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)>=0)return Number(x)}return null};
 const currency=String(o.currency||d.currency||'IQD');
 const products=read(o.total_price,d.total_price),external=read(o.external_shipping_fee,d.external_shipping_fee),internal=read(o.delivery_fee,d.delivery_fee);
 const make=(state,amount)=>({status:state,amount,currency});
 // An absent amount is never interpreted as zero. External shipping may be
 // assigned to one store segment only; never duplicate a parent order fee.
 return {products:make(status[0],products),externalShipping:make(status[1],external),internalDelivery:make(status[2],internal)};
}
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
 const charges=d.collectionCharges||null;
 if(charges){
   const rows=[['المنتجات',charges.products],['الشحن الخارجي',charges.externalShipping],['التوصيل الداخلي',charges.internalDelivery]];
   let unknown=false,shown=0;
   for(const [label,item] of rows){
     if(!item||item.status!=='collected'&&item.status!=='uncollected'){unknown=true;continue}
     if(item.status==='collected')continue;
     if(typeof item.amount!=='number'||!Number.isFinite(item.amount)||item.amount<0||!present(item.currency)){unknown=true;continue}
     if(item.amount>0){field('للتحصيل — '+label,item.amount.toLocaleString('en-US')+' '+item.currency);shown++}
   }
   if(unknown)field('تنبيه التحصيل','توجد بنود لم يتم التحقق من حالتها');
   else if(!shown)field('التحصيل','لا توجد مبالغ للتحصيل');
 }else field('التحصيل','يلزم التحقق من حالة التحصيل قبل التسليم');
 const logo=escape(d.logoUrl||'images/kinto-header-logo-v158.jpeg');
 return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>KINTO — '+escape(code)+'</title>'+
 '<style>@page{size:100mm 100mm;margin:0}*{box-sizing:border-box}body{margin:0;font:10px Arial,sans-serif;color:#111;background:#fff}.sheet{width:100mm;min-height:100mm;padding:3mm;break-after:page}.head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0a2f23;padding-bottom:2mm}.head img{max-height:12mm;max-width:34mm;object-fit:contain}.head strong{font-size:16px;color:#0a2f23}.code{text-align:center;font-size:15px;font-weight:bold;margin:2mm 0}.barcode{text-align:center}.barcode svg{max-width:90mm;height:13mm}.fields{display:grid;grid-template-columns:1fr 1fr;gap:1mm;margin-top:2mm}.field{border:1px solid #aaa;border-radius:2px;padding:1mm;min-width:0;overflow-wrap:anywhere}.field b{display:block;font-size:8px;color:#444}.field span{font-weight:700;font-size:10px}@media print{body{margin:0}.sheet{width:100mm;min-height:100mm}}</style></head><body><section class="sheet"><header class="head"><img src="'+logo+'" alt="KINTO"><strong>KINTO</strong></header><div class="code">'+escape(code)+'</div><div class="barcode"><svg id="kintoLabelBarcode"></svg></div><div class="fields">'+lines.join('')+'</div></section>'+
 '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script><script>window.addEventListener("load",function(){try{if(window.JsBarcode)JsBarcode("#kintoLabelBarcode",'+JSON.stringify(code)+',{format:"CODE128",displayValue:false,height:36,margin:0})}catch(e){console.error(e)}setTimeout(function(){window.print()},300)});</script></body></html>';
}
function print(data){const w=global.open('','_blank','width=700,height=750');if(!w)throw Error('Popup blocked');w.document.open();w.document.write(render(data));w.document.close();return w}
global.KintoUnifiedShippingLabel={render,print,collectionCharges};
})(window);
