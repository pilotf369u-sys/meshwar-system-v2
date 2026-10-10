/* KINTO unified shipping label renderer — presentation only.
 * Monetary values MUST be verified outstanding balances, never gross totals.
 * No database writes, no order state mutations.
 */
(function(global){
'use strict';
const escape=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const present=v=>v!==null&&v!==undefined&&String(v).trim()!==''&&String(v).trim()!=='---';
const amount=v=>typeof v==='number'&&Number.isFinite(v)&&v>0?v:null;
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
 const balances=d.verifiedOutstanding||null;
 if(balances&&balances.verified===true){
   const monetary=[['المنتجات',balances.products],['الشحن الخارجي',balances.externalShipping],['التوصيل الداخلي',balances.internalDelivery]];
   let total=0,valid=true;
   for(const [label,v] of monetary){
     if(v===undefined||v===null||typeof v!=='number'||!Number.isFinite(v)||v<0){valid=false;break}
   }
   if(valid){for(const [label,v] of monetary){if(amount(v)){field('المتبقي — '+label,v.toLocaleString('en-US')+' '+(balances.currency||'IQD'));total+=v}}
     if(total>0)field('الإجمالي المطلوب تحصيله',total.toLocaleString('en-US')+' '+(balances.currency||'IQD'));
     else field('التحصيل','مدفوع بالكامل — لا يوجد مبلغ للتحصيل');
   }else field('التحصيل','يلزم التحقق من المبالغ قبل التسليم');
 }else field('التحصيل','يلزم التحقق من المبالغ قبل التسليم');
 const logo=escape(d.logoUrl||'images/kinto-header-logo-v158.jpeg');
 return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>KINTO — '+escape(code)+'</title>'+
 '<style>@page{size:100mm 100mm;margin:0}*{box-sizing:border-box}body{margin:0;font:10px Arial,sans-serif;color:#111;background:#fff}.sheet{width:100mm;min-height:100mm;padding:3mm;break-after:page}.head{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0a2f23;padding-bottom:2mm}.head img{max-height:12mm;max-width:34mm;object-fit:contain}.head strong{font-size:16px;color:#0a2f23}.code{text-align:center;font-size:15px;font-weight:bold;margin:2mm 0}.barcode{text-align:center}.barcode svg{max-width:90mm;height:13mm}.fields{display:grid;grid-template-columns:1fr 1fr;gap:1mm;margin-top:2mm}.field{border:1px solid #aaa;border-radius:2px;padding:1mm;min-width:0;overflow-wrap:anywhere}.field b{display:block;font-size:8px;color:#444}.field span{font-weight:700;font-size:10px}@media print{body{margin:0}.sheet{width:100mm;min-height:100mm}}</style></head><body><section class="sheet"><header class="head"><img src="'+logo+'" alt="KINTO"><strong>KINTO</strong></header><div class="code">'+escape(code)+'</div><div class="barcode"><svg id="kintoLabelBarcode"></svg></div><div class="fields">'+lines.join('')+'</div></section>'+
 '<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script><script>window.addEventListener("load",function(){try{if(window.JsBarcode)JsBarcode("#kintoLabelBarcode",'+JSON.stringify(code)+',{format:"CODE128",displayValue:false,height:36,margin:0})}catch(e){console.error(e)}setTimeout(function(){window.print()},300)});</script></body></html>';
}
function print(data){const w=global.open('','_blank','width=700,height=750');if(!w)throw Error('Popup blocked');w.document.open();w.document.write(render(data));w.document.close();return w}
global.KintoUnifiedShippingLabel={render,print};
})(window);
