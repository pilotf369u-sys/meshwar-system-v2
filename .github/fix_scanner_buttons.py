from pathlib import Path
import re
files=['admin-dashboard.html','employee-dashboard.html','branch-dashboard.html']
modal='''\n<div id="scannerModal" class="modal" style="display:none;position:fixed;z-index:9999;left:0;top:0;width:100%;height:100%;background:rgba(0,0,0,0.8);overflow:auto;">\n  <div class="modal-content" style="background:#fff;margin:5% auto;padding:20px;border-radius:12px;width:90%;max-width:500px;text-align:center;position:relative;">\n    <h3>📷 مسح باركود مباشر بالكاميرا</h3>\n    <div id="reader" style="width:100%;min-height:250px;background:#f0f0f0;margin:15px 0;border-radius:8px;"></div>\n    <div id="cameraHint" style="font-size:12px;color:#64748b;margin:8px 0;">وجّه الكاميرا نحو الباركود وسيتم التقاطه تلقائياً.</div>\n    <button type="button" onclick="closeCameraScanner()" style="padding:10px 25px;border-radius:6px;background:#d32f2f;color:#fff;border:none;cursor:pointer;font-weight:700;">إلغاء المسح</button>\n  </div>\n</div>\n'''
scanner_code='''let html5QrCode=null;
async function startCameraScanner(){
  const modal=document.getElementById('scannerModal');
  const reader=document.getElementById('reader');
  const hint=document.getElementById('cameraHint');
  if(!modal||!reader){console.error('Scanner modal elements are missing');return;}
  modal.style.display='block';
  if(hint)hint.textContent='جاري تشغيل الكاميرا الخلفية...';
  if(html5QrCode){try{await html5QrCode.stop()}catch{}try{await html5QrCode.clear()}catch{}html5QrCode=null;}
  reader.innerHTML='';
  html5QrCode=new Html5Qrcode('reader');
  const onSuccess=async(decodedText)=>{
    const clean=cleanBarcodeScannerInput(decodedText);
    if(!clean)return;
    const input=document.getElementById(DASHBOARD_BARCODE_SEARCH_ID);
    try{await html5QrCode.stop()}catch{}
    try{await html5QrCode.clear()}catch{}
    html5QrCode=null;
    modal.style.display='none';
    if(input){
      input.value=clean;
      input.dispatchEvent(new Event('input',{bubbles:true}));
    }
  };
  try{
    await html5QrCode.start(
      {facingMode:'environment'},
      {fps:10,qrbox:{width:250,height:150}},
      onSuccess,
      ()=>{}
    );
    if(hint)hint.textContent='وجّه الكاميرا نحو الباركود وسيتم التقاطه تلقائياً.';
  }catch(err){
    console.error('Camera scanner error:',err);
    try{await html5QrCode.clear()}catch{}
    html5QrCode=null;
    reader.innerHTML='<div style="padding:20px;text-align:center;color:#e74c3c"><p><b>تعذر تشغيل الكاميرا.</b></p><p style="font-size:12px;color:#555">تأكد من السماح للموقع باستخدام الكاميرا من إعدادات المتصفح ثم أعد المحاولة.</p></div>';
    if(hint)hint.textContent='';
  }
}
async function closeCameraScanner(){
  if(html5QrCode){
    try{await html5QrCode.stop()}catch{}
    try{await html5QrCode.clear()}catch{}
    html5QrCode=null;
  }
  const modal=document.getElementById('scannerModal');
  if(modal)modal.style.display='none';
}
'''
for fn in files:
    p=Path(fn); s=p.read_text(encoding='utf-8')
    s=s.replace('onclick="startDashboardCameraScanner()"','onclick="startCameraScanner()"')
    s=re.sub(r'\n?<div id="dashboardScannerModal"[\s\S]*?</div>\s*</div>\s*', '\n', s, count=1)
    if 'id="scannerModal"' not in s:
        marker="<script>\nconst DASHBOARD_BARCODE_SEARCH_ID="
        if marker not in s:
            raise SystemExit(f'{fn}: dashboard scanner script marker not found')
        s=s.replace('<script>\nconst DASHBOARD_BARCODE_SEARCH_ID=',modal+'<script>\nconst DASHBOARD_BARCODE_SEARCH_ID=',1)
    pattern=r'let dashboardCameraScanner=null;[\s\S]*?async function stopDashboardCameraScanner\(\)\{[\s\S]*?\}\n'
    s2,n=re.subn(pattern,scanner_code,s,count=1)
    if n!=1:
        raise SystemExit(f'{fn}: old scanner implementation not found uniquely ({n})')
    s=s2
    s=s.replace('#dashboardScannerReader','#reader')
    if 'onclick="startCameraScanner()"' not in s: raise SystemExit(f'{fn}: button not rebound')
    if 'id="scannerModal"' not in s or 'id="reader"' not in s: raise SystemExit(f'{fn}: modal missing')
    if 'async function closeCameraScanner()' not in s: raise SystemExit(f'{fn}: close function missing')
    p.write_text(s,encoding='utf-8')
# trigger
