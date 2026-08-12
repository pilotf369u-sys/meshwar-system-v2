from pathlib import Path
p=Path('delivery-dashboard.html')
s=p.read_text(encoding='utf-8')
s=s.replace('<div id="scannerModal" class="scanner-wrap"><div class="scanner-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><b>مسح باركود مباشر بالكاميرا الخلفية</b><button class="btn btn-red" onclick="stopScanner()">إلغاء المسح</button></div><div id="reader"></div><div id="cameraHint" class="muted" style="margin-top:8px;text-align:center">جاري طلب صلاحية الكاميرا وتشغيل البث الحي...</div><button id="barcodePhotoFallbackBtn" class="btn btn-blue" type="button" style="display:none;width:100%;margin-top:10px" onclick="openBarcodePhotoFallback()">📸 التقاط صورة للباركود للتحليل الفوري</button><input id="barcodePhotoFallbackInput" type="file" accept="image/*" capture="environment" style="display:none" onchange="scanBarcodePhotoFallback(this.files[0])"></div></div>','<div id="scannerModal" class="scanner-wrap"><div class="scanner-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><b>مسح باركود مباشر بالكاميرا الخلفية</b><button class="btn btn-red" onclick="stopScanner()">إلغاء المسح</button></div><div id="reader"></div><div id="cameraHint" class="muted" style="margin-top:8px;text-align:center">وجّه الكاميرا نحو الباركود وسيتم التقاطه تلقائياً.</div></div></div>')
start=s.index('async function requestDeliveryCameraPermission()')
end=s.index('async function setupDeliveryRealtime()',start)
new="""async function startCameraScanner(){
  const modal=document.getElementById('scannerModal'),hint=document.getElementById('cameraHint');
  modal.classList.add('show');
  if(hint)hint.textContent='جاري تشغيل الكاميرا الخلفية...';
  if(scanner){try{await scanner.stop()}catch{}try{await scanner.clear()}catch{}scanner=null}
  scanner=new Html5Qrcode('reader');
  const config={fps:15,qrbox:{width:280,height:160}};
  const onSuccess=async decodedText=>{
    const clean=cleanBarcodeScannerInput(decodedText);
    if(!clean)return;
    await handleCameraScan(clean);
  };
  const onError=()=>{};
  try{
    await scanner.start({facingMode:{exact:'environment'}},config,onSuccess,onError);
    if(hint)hint.textContent='وجّه الكاميرا نحو الباركود وسيتم التقاطه تلقائياً.';
  }catch(firstError){
    console.warn('Exact environment camera unavailable, retrying standard environment mode:',firstError);
    try{
      await scanner.start({facingMode:'environment'},config,onSuccess,onError);
      if(hint)hint.textContent='وجّه الكاميرا نحو الباركود وسيتم التقاطه تلقائياً.';
    }catch(secondError){
      console.error('Live camera scanner error:',secondError);
      if(hint)hint.textContent='تعذر تشغيل الكاميرا الحية. تحقق من صلاحية الكاميرا في المتصفح ثم أعد المحاولة.';
    }
  }
}
async function toggleScanner(event){
  if(event&&event.isTrusted===false)return;
  if(scanner){await stopScanner();return}
  await startCameraScanner();
}
async function stopScanner(){
  if(scanner){try{await scanner.stop()}catch{}try{await scanner.clear()}catch{}scanner=null}
  document.getElementById('scannerModal')?.classList.remove('show');
}
function filterOrdersByBarcode(clean){
  const normalized=cleanBarcodeScannerInput(clean);
  if(!normalized)return;
  deliverySearch.value=normalized;
  deliveryPage=1;
  clearTimeout(deliveryTimer);
  const loaded=deliveryOrders.filter(o=>{
    const values=[o.order_code,o.reference_order_no,o.id,o.customer_phone].map(v=>cleanBarcodeScannerInput(v));
    return values.some(v=>v===normalized||v.includes(normalized)||normalized.includes(v));
  });
  if(loaded.length){
    deliveryTotal=loaded.length;
    deliveryOrders=loaded;
    ordersGrid.innerHTML=loaded.map(renderOrderCard).join('');
    renderPager();
    scanResult.classList.add('show');
    scanResult.textContent=`تم العثور على: ${loaded[0].order_code||loaded[0].id}`;
    setTimeout(()=>scanResult.classList.remove('show'),3000);
    return;
  }
  loadDeliveryOrders(normalized);
}
async function handleCameraScan(decoded){
  const clean=cleanBarcodeScannerInput(decoded);
  if(!clean)return;
  await stopScanner();
  deliverySearch.value=clean;
  filterOrdersByBarcode(clean);
}
"""
s=s[:start]+new+s[end:]
s=s.replace('Object.assign(window,{cleanBarcodeScannerInput,deliverySearchInput,deliverySearchKeyup,deliverySearchKeydown,toggleScanner,startCameraScanner,stopScanner,openBarcodePhotoFallback,scanBarcodePhotoFallback,openDeliveryImage,closeDeliveryImage,chooseDeliveryProof,handleDeliveryProofFile});','Object.assign(window,{cleanBarcodeScannerInput,deliverySearchInput,deliverySearchKeyup,deliverySearchKeydown,toggleScanner,startCameraScanner,stopScanner,filterOrdersByBarcode,openDeliveryImage,closeDeliveryImage,chooseDeliveryProof,handleDeliveryProofFile});')
assert 'barcodePhotoFallback' not in s
assert 'scanBarcodePhotoFallback' not in s
assert 'openBarcodePhotoFallback' not in s
p.write_text(s,encoding='utf-8')
