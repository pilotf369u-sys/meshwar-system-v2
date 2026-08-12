from pathlib import Path
p=Path('delivery-dashboard.html')
s=p.read_text(encoding='utf-8')
# Remove photo-fallback controls from scanner modal if present
s=s.replace('<div id="scannerModal" class="scanner-wrap"><div class="scanner-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><b>مسح باركود مباشر بالكاميرا الخلفية</b><button class="btn btn-red" onclick="stopScanner()">إلغاء المسح</button></div><div id="reader"></div><div id="cameraHint" class="muted" style="margin-top:8px;text-align:center">وجّه الكاميرا نحو الباركود وسيتم التقاطه تلقائياً.</div></div></div>','<div id="scannerModal" class="scanner-wrap"><div class="scanner-panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px"><b>مسح باركود مباشر بالكاميرا الخلفية</b><button class="btn btn-red" onclick="stopScanner()">إلغاء المسح</button></div><div id="reader"></div><div id="cameraHint" class="muted" style="margin-top:8px;text-align:center">وجّه الكاميرا نحو الباركود وسيتم التقاطه تلقائياً.</div></div></div>')
start=s.index('async function startCameraScanner(){')
end=s.index('async function setupDeliveryRealtime()', start)
new=r'''async function startCameraScanner(){
  const modal=document.getElementById('scannerModal');
  const hint=document.getElementById('cameraHint');
  modal.classList.add('show');
  if(hint)hint.textContent='جاري تشغيل الكاميرا الخلفية...';
  if(scanner){try{await scanner.stop()}catch{}try{await scanner.clear()}catch{}scanner=null}
  scanner=new Html5Qrcode('reader');
  const onSuccess=async decodedText=>{
    const clean=cleanBarcodeScannerInput(decodedText);
    if(!clean)return;
    try{await scanner.stop()}catch{}
    try{await scanner.clear()}catch{}
    scanner=null;
    modal.classList.remove('show');
    const input=document.getElementById('deliverySearch');
    if(input){
      input.value=clean;
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }
  };
  const onError=()=>{};
  try{
    await scanner.start(
      {facingMode:'environment'},
      {fps:10,qrbox:{width:250,height:150}},
      onSuccess,
      onError
    );
    if(hint)hint.textContent='وجّه الكاميرا نحو الباركود وسيتم التقاطه تلقائياً.';
  }catch(err){
    console.error('Camera permission error:',err);
    try{await scanner.clear()}catch{}
    scanner=null;
    const reader=document.getElementById('reader');
    if(reader){
      reader.innerHTML=`<div style="padding:20px;text-align:center;color:#e74c3c;"><p><b>تم حظر الوصول للكاميرا من إعدادات المتصفح.</b></p><p style="font-size:12px;color:#555;">يرجى الضغط على رمز القفل 🔒 بجانب رابط الموقع في أعلى المتصفح والسماح بـ "الكاميرا"، ثم تحديث الصفحة.</p></div>`;
    }
    if(hint)hint.textContent='';
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
'''
s=s[:start]+new+s[end:]
s=s.replace('Object.assign(window,{cleanBarcodeScannerInput,deliverySearchInput,deliverySearchKeyup,deliverySearchKeydown,toggleScanner,startCameraScanner,stopScanner,filterOrdersByBarcode,openDeliveryImage,closeDeliveryImage,chooseDeliveryProof,handleDeliveryProofFile});','Object.assign(window,{cleanBarcodeScannerInput,deliverySearchInput,deliverySearchKeyup,deliverySearchKeydown,toggleScanner,startCameraScanner,stopScanner,openDeliveryImage,closeDeliveryImage,chooseDeliveryProof,handleDeliveryProofFile});')
# Ensure no barcode image fallback survived
for bad in ['barcodePhotoFallbackInput','barcodePhotoFallbackBtn','scanBarcodePhotoFallback','openBarcodePhotoFallback','scanFile(file']:
    if bad in s:
        raise SystemExit('Unexpected scanner fallback remains: '+bad)
p.write_text(s,encoding='utf-8')
