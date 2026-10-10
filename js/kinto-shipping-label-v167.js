/* Shared, on-demand label printing. No order/status/finance mutations. */
(function () {
  'use strict';
  const obj = v => { if (typeof v === 'string') { try { return obj(JSON.parse(v)); } catch { return {}; } } return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; };
  const first = (...values) => values.find(v => v !== null && v !== undefined && String(v).trim() !== '') ?? '';
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const payments = {paid_prepaid:'مدفوع مقدماً شامل التوصيل', cod_full:'تحصيل كامل عند الاستلام', product_paid_delivery_cod:'البضاعة مدفوعة — التوصيل عند الاستلام'};
  function normalize(order, customer = {}, context = {}) {
    const d = obj(order.details), snapshot = obj(order.customer_snapshot), loc = obj(first(order.customer_location, d.customer_location)), dc = obj(d.customer);
    const sources = [snapshot, loc, dc, order, d, obj(customer)];
    const pick = (...keys) => first(...sources.flatMap(s => keys.map(k => s[k])));
    const items = Array.isArray(order.items) ? order.items : Array.isArray(d.items) ? d.items : [];
    const products = items.length ? items.map(i => ({name:first(i.product_name, i.name, 'منتج غير مسمى'),quantity:first(i.quantity, 0), options:obj(i.selected_options)})) : [{name:first(d.product_name, order.product_name, 'غير مسجل'),quantity:first(d.quantity, order.quantity, order._quantity, 1),options:obj(d.selected_options)}];
    const quantity = products.reduce((n,i) => n + (Number.isFinite(Number(i.quantity)) ? Number(i.quantity) : 0), 0);
    return {code:first(order.order_code,order.id),reference:first(order.reference_order_no,d.reference_order_no,'غير مسجل'),date:order.created_at ? new Date(order.created_at).toLocaleDateString('en-GB') : 'غير مسجل',
      name:pick('name','customer_name','_customer_name'), customerCode:pick('code','customer_code','_customer_code'), phone:pick('phone','customer_phone','_customer_phone'),secondary:pick('secondary_phone','customer_secondary_phone','phone2','_secondary_phone'),
      country:pick('country','customer_country'),province:pick('province','governorate','state','_customer_governorate'),city:pick('city'),area:pick('area','district','neighborhood'),address:pick('address','delivery_address','address_details','full_address','customer_address','_customer_address'),landmark:pick('landmark','nearest_landmark'),
      branch:first(order.branch_name,d.branch_name,context.branchName,'غير مسجل'), store:first(context.storeName,order.store_name,d.store_name),shipping:first(order.shipping_company_name,d.shipping_company_name,'غير مسجل'),
      payment:payments[first(order.delivery_payment_type,d.delivery_payment_type)] || 'غير محددة — راجع حالة التحصيل',status:first(order.status,order.store_status,'غير مسجل'),
      parcels:first(order.parcels_count,d.parcels_count,order.parcels,1),quantity,products,notes:first(d.delivery_notes,order.delivery_notes,d.shipping_notes)};
  }
  async function hydrate(sb, cached, context) {
    const id = cached._v95OrderId || cached.id;
    const result = await sb.from('orders').select('*').eq('id',id).maybeSingle();
    if (result.error || !result.data) throw new Error('تعذر جلب بيانات الطلب الحالية؛ لم تُجهّز طباعة ناقصة.');
    const order = result.data;
    let customer = {};
    if (order.customer_id) {
      const r = await sb.from('customers').select('id,name,code,phone,secondary_phone,country,state,address').eq('id',order.customer_id).maybeSingle();
      if (r.error) throw new Error('تعذر جلب بيانات العميل؛ حاول مجدداً.');
      customer = r.data || {};
    }
    if (order.branch_id && !order.branch_name && !context.branchName) {
      const r = await sb.from('branches').select('*').eq('id',order.branch_id).maybeSingle();
      if (r.error) throw new Error('تعذر جلب اسم الفرع.');
      context = {...context,branchName:first(r.data?.name,r.data?.branch_name)};
    }
    return normalize(order,customer,context);
  }
  function settings(raw) { if (Array.isArray(raw)) return settings(raw[0]); const s=obj(raw);return s.value!=null ? settings(s.value) : s; }
  let barcodePromise;
  function barcodeReady() {
    if (typeof window.JsBarcode === 'function') return Promise.resolve(window.JsBarcode);
    if (!barcodePromise) barcodePromise = new Promise((resolve,reject) => {
      const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
      const timeout=setTimeout(()=>{s.remove();reject(new Error('تعذر تحميل الباركود؛ حاول مجدداً.'));},15000);
      s.onload=()=>{clearTimeout(timeout);typeof window.JsBarcode==='function'?resolve(window.JsBarcode):reject(new Error('تعذر تجهيز الباركود'));};
      s.onerror=()=>{clearTimeout(timeout);reject(new Error('تعذر تحميل الباركود'));};document.head.appendChild(s);
    }).catch(e=>{barcodePromise=null;throw e;});
    return barcodePromise;
  }
  function body(model,logo) {
    const field=(label,value,wide=false,ltr=false)=>`<div class="field${wide?' wide':''}"><span>${esc(label)}</span><strong${ltr?' dir="ltr"':''}>${esc(first(value,'غير مسجل'))}</strong></div>`;
    return `<header>${logo?`<img id="brand" alt="KINTO" src="${esc(logo)}">`:''}<b>KINTO</b><span>ملصق توصيل${model.store?' · '+esc(model.store):''}</span></header><div class="code" dir="ltr">${esc(model.code)}</div><svg id="barcode" aria-label="باركود الطلب"></svg><div class="grid">${field('العميل',model.name)}${field('رمز العميل',model.customerCode)}${field('الهاتف',model.phone,false,true)}${field('هاتف احتياطي',model.secondary,false,true)}${field('الدولة',model.country)}${field('المحافظة',model.province)}${field('المدينة / المنطقة',[model.city,model.area].filter(Boolean).join(' / '),true)}${field('العنوان الكامل',model.address,true)}${model.landmark?field('أقرب نقطة دالة',model.landmark,true):''}${field('الفرع',model.branch)}${field('شركة التوصيل',model.shipping)}${field('القطع',model.quantity)}${field('الطرود',model.parcels)}${field('حالة التحصيل',model.payment,true)}${field('حالة الطلب',model.status)}${field('التاريخ',model.date)}${field('رقم المرجع / Sipariş',model.reference,true,true)}</div><section class="products"><b>محتويات الطرد</b>${model.products.map(i=>`<div>${esc(i.quantity)} × ${esc(i.name)}${Object.entries(i.options).filter(([,v])=>v!==''&&v!=null).map(([k,v])=>` · ${esc(({color:'اللون',size:'المقاس',volume:'الحجم'})[k]||k)}: ${esc(v)}`).join('')}</div>`).join('')}</section>${model.notes?`<section class="notes">ملاحظات التوصيل: ${esc(model.notes)}</section>`:''}`;
  }
  async function open({sb,order,role='staff',branchName='',storeName=''}) {
    // Open before awaiting network requests, so mobile browsers retain the user's gesture.
    const w=window.open('','_blank','width=700,height=800');
    if (!w) { alert('يرجى السماح بالنوافذ المنبثقة لطباعة الملصق.');return; }
    w.document.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KINTO — ملصق التوصيل</title></head><body><p>جارٍ تجهيز بيانات التوصيل…</p></body></html>');w.document.close();
    try {
      const client=typeof sb==='function'?await sb():sb;
      let model;
      if(role==='vendor' && order._v95SegmentId) {
        let session;try{session=JSON.parse(sessionStorage.getItem('meshwar_vendor_session_v95')||'null');}catch{}
        if(!session?.token) throw new Error('انتهت جلسة التاجر؛ سجّل الدخول مجدداً.');
        const r=await client.rpc('vendor_shipping_label_v167',{p_session_token:session.token,p_segment_id:order._v95SegmentId});
        if(r.error||!r.data)throw new Error('تعذر جلب ملصق التاجر. تأكد من تطبيق تحديث SQL للملصقات ثم حاول مجدداً.');
        model=normalize(r.data.order,r.data.customer,{storeName:first(r.data.store_name,storeName),branchName:r.data.branch_name});
      } else {
        model=await hydrate(client,order,{branchName,storeName});
        // Legacy vendor rows contain the already-authorized store projection.
        if(role==='vendor') { const own=normalize(order,{}, {storeName});model.products=own.products;model.quantity=own.quantity; }
      }
      const [r,barcode]=await Promise.all([client.rpc('get_site_settings'),barcodeReady()]);
      if(r.error)throw new Error('تعذر جلب شعار المنصة الموحد؛ حاول مجدداً.');
      let logo=settings(r.data).brand_logo_url||'';
      if(logo){const u=new URL(logo,location.href);if(!['https:','http:'].includes(u.protocol))throw new Error('رابط شعار المنصة غير صالح');logo=u.href;}
      // Fetch the CMS image in the opener; the print document remains self-contained.
      // Supabase public storage supports CORS. Abort failed asset loads instead of printing a missing logo.
      const logoSource=logo;
      if(logo){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);try{const response=await fetch(logo,{signal:controller.signal});if(!response.ok)throw new Error('تعذر تحميل شعار المنصة');const blob=await response.blob();logo=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('تعذر تجهيز الشعار'));reader.readAsDataURL(blob);});}finally{clearTimeout(timer);}}
      if(w.closed)return;
      const doc=w.document;
      const styles=`<style id="layout"></style><style>*{box-sizing:border-box}body{margin:0;background:#e9eeeb;color:#000;font-family:Tahoma,Arial,sans-serif}.toolbar{padding:12px;background:#073c30;color:#fff;display:flex;flex-wrap:wrap;gap:10px;align-items:center}.toolbar input{width:65px;padding:6px}.toolbar button{padding:8px 14px}#message{padding:8px;margin:0;color:#8b2100}#label{margin:15px auto;background:white;border:1px solid black;padding:2mm;font-size:10px;line-height:1.2;overflow-wrap:anywhere}header{display:flex;align-items:center;gap:8px;border-bottom:1px solid black;padding-bottom:1mm}header img{height:7mm;max-width:25mm;object-fit:contain}header b{font-size:16px}header span{margin-inline-start:auto}.code{text-align:center;font-size:17px;font-weight:bold;margin:1mm 0}#barcode{display:block;margin:auto;width:100%;height:12mm}.grid{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid black;margin-top:1mm}.field{padding:.35mm .8mm;border-bottom:1px solid #aaa;min-width:0}.field span{font-size:9px;margin-inline-end:4px}.field strong{font-size:11px;white-space:pre-wrap;unicode-bidi:isolate}.wide{grid-column:1/-1}.products,.notes{padding-top:1mm;white-space:pre-wrap}.products div{padding:.3mm 0}@media print{body{background:#fff}.toolbar,#message{display:none!important}#label{margin:0;border:0;break-inside:avoid}html,body{margin:0;padding:0}}</style>`;
      const content=`<div class="toolbar"><b>قياس الملصق بالسنتيمتر</b><label>عرض <input id="width" type="number" min="8" max="30" step="0.5" value="10"></label><label>ارتفاع <input id="height" type="number" min="8" max="50" step="0.5" value="10"></label><button id="print" disabled>طباعة / حفظ PDF</button><span>اختر نفس المقاس في إعدادات الطابعة، بمقياس 100% ودون هوامش.</span></div><p id="message"></p><article id="label">${body(model,logo)}</article>`;
      doc.open();doc.write('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>KINTO — ملصق التوصيل</title>'+styles+'</head><body>'+content+'</body></html>');doc.close();
      barcode(doc.getElementById('barcode'),String(model.code),{format:'CODE128',displayValue:false,height:45,margin:10,width:2});
      const img=doc.getElementById('brand');
      if(img)img.dataset.source=logoSource;
      if(img) await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('تعذر تحميل شعار المنصة')),15000);const done=()=>{clearTimeout(timer);img.naturalWidth?resolve():reject(new Error('تعذر تحميل شعار المنصة'));};if(img.complete)done();else {img.onload=done;img.onerror=done;}});
      if(doc.fonts)await doc.fonts.ready;
      const label=doc.getElementById('label'),print=doc.getElementById('print'),message=doc.getElementById('message');
      function fit(){const width=Number(doc.getElementById('width').value),height=Number(doc.getElementById('height').value);if(!(width>=8&&width<=30&&height>=8&&height<=50)){print.disabled=true;message.textContent='اختر عرضاً بين 8 و30 سم وارتفاعاً بين 8 و50 سم.';return;}doc.getElementById('layout').textContent=`@page{size:${width*10}mm ${height*10}mm;margin:0}#label{width:${width*10}mm;min-height:${height*10}mm} @media print{html,body{width:${width*10}mm}}`;const limit=height*10*96/25.4;const okay=label.getBoundingClientRect().height<=limit+1;print.disabled=!okay;message.textContent=okay?'جاهز للطباعة — راجع بيانات التوصيل قبل الطباعة.':'المحتوى أطول من المقاس المختار. زِد الارتفاع؛ لن نحذف عنواناً أو منتجاً لتصغير الملصق.';label.dataset.fits=String(okay);}
      doc.getElementById('width').addEventListener('input',fit);doc.getElementById('height').addEventListener('input',fit);
      print.addEventListener('click',()=>{fit();if(!print.disabled)w.print();});
      w.addEventListener('beforeprint',fit);fit();
    } catch(e) { if(!w.closed)w.document.body.textContent='تعذر تجهيز الملصق: '+(e.message||e);console.warn('KINTO label:',e); }
  }
  window.KintoShippingLabelV167={open,normalize};
})();
