from pathlib import Path

FILES = ['employee-dashboard.html','admin-dashboard.html','branch-dashboard.html','branch-manifest.html']
MARK = 'BARCODE_SCANNER_NORMALIZATION_V1'

COMMON = r'''
<script>
/* BARCODE_SCANNER_NORMALIZATION_V1 */
(function(){
  const arabicKeyboardToEnglish={
    'ض':'q','ص':'w','ث':'e','ق':'r','ف':'t','غ':'y','ع':'u','ه':'i','خ':'o','ح':'p','ج':'[','د':']',
    'ش':'a','س':'s','ي':'d','ب':'f','ل':'g','ا':'h','ت':'j','ن':'k','م':'l','ك':';','ط':"'",
    'ئ':'z','ء':'x','ؤ':'c','ر':'v','ى':'n','ة':'m','و':',','ز':'.','ظ':'/'
  };
  function latinizeArabicScannerLetters(text){
    return String(text||'').split('').map(ch=>arabicKeyboardToEnglish[ch]??ch).join('');
  }
  window.cleanBarcodeScannerInput=function(value){
    let s=String(value??'').normalize('NFKC');
    s=s.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g,'')
       .replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g,'')
       .replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
       .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
       .replace(/[‐‑‒–—―−﹘﹣－]/g,'-')
       .replace(/[“”„‟«»‹›'`´]/g,'')
       .replace(/[\r\n\t]+/g,' ')
       .trim();
    const compact=s.replace(/\s+/g,'');
    const hasDigit=/\d/.test(compact);
    const looksScannerToken=hasDigit && compact.length<=80 && !/[\u0600-\u06FF]{4,}/.test(compact);
    if(looksScannerToken){
      s=latinizeArabicScannerLetters(s);
      s=s.replace(/\s+/g,'').toUpperCase();
      s=s.replace(/^MW[_:./\\]+/,'MW-').replace(/^MW(?=\d)/,'MW-');
      s=s.replace(/[^A-Z0-9._\-\/]/g,'');
    }else{
      s=s.replace(/\s{2,}/g,' ');
    }
    return s.trim();
  };
})();
</script>
'''

EXTRAS = {
'employee-dashboard.html': r'''
<script>
/* BARCODE_SCANNER_NORMALIZATION_V1_EMPLOYEE */
(function(){
  const oldNormalize=typeof normalizeSearch==='function'?normalizeSearch:null;
  normalizeSearch=function(v){const cleaned=window.cleanBarcodeScannerInput(v);return oldNormalize?oldNormalize(cleaned):cleaned};
  function bind(){
    const el=document.getElementById('employeeOrderSearch');if(!el||el.dataset.barcodeCleanBound)return;
    el.dataset.barcodeCleanBound='1';
    el.addEventListener('input',()=>{const c=window.cleanBarcodeScannerInput(el.value);if(c!==el.value)el.value=c;});
    el.addEventListener('keydown',e=>{if(e.key==='Enter'){const c=window.cleanBarcodeScannerInput(el.value);el.value=c;clearTimeout(pipelineSearchTimer);pipelinePage=1;loadPipelineOrders();}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
</script>
''',
'admin-dashboard.html': r'''
<script>
/* BARCODE_SCANNER_NORMALIZATION_V1_ADMIN */
(function(){
  const oldSearchTerm=typeof searchTerm==='function'?searchTerm:null;
  searchTerm=function(v){const cleaned=window.cleanBarcodeScannerInput(v);return oldSearchTerm?oldSearchTerm(cleaned):cleaned};
  function bind(){
    const el=document.getElementById('orderSearchInput');if(!el||el.dataset.barcodeCleanBound)return;
    el.dataset.barcodeCleanBound='1';
    el.addEventListener('input',()=>{const c=window.cleanBarcodeScannerInput(el.value);if(c!==el.value)el.value=c;});
    el.addEventListener('keydown',e=>{if(e.key==='Enter'){const c=window.cleanBarcodeScannerInput(el.value);el.value=c;clearTimeout(orderSearchTimer);orderPage=1;loadAdminOrders();}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
</script>
''',
'branch-dashboard.html': r'''
<script>
/* BARCODE_SCANNER_NORMALIZATION_V1_BRANCH */
(function(){
  const oldClean=typeof cleanSearchText==='function'?cleanSearchText:null;
  cleanSearchText=function(v){const cleaned=window.cleanBarcodeScannerInput(v);return oldClean?oldClean(cleaned):cleaned};
  normalizeOrderBarcodeInput=function(value){
    const cleaned=window.cleanBarcodeScannerInput(value),compact=cleaned.toUpperCase().replace(/\s+/g,''),m=compact.match(/(?:MW-?)?(\d+)/i),digits=m?m[1]:'';
    const barcodeLike=!!digits && (/^MW-?\d+$/i.test(compact)||/^\d+$/.test(compact)||compact.length<=18);
    if(!barcodeLike)return{raw:cleaned,term:cleanSearchText(cleaned),digits:'',code:'',barcodeLike:false};
    return{raw:cleaned,term:digits,digits,code:`MW-${digits}`,barcodeLike:true};
  };
  function bind(){
    const el=document.getElementById('orderSearch');if(!el||el.dataset.barcodeCleanBound)return;
    el.dataset.barcodeCleanBound='1';
    el.addEventListener('input',()=>{const c=window.cleanBarcodeScannerInput(el.value);if(c!==el.value)el.value=c;});
    el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();el.value=window.cleanBarcodeScannerInput(el.value);page=1;loadOrders();}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
</script>
''',
'branch-manifest.html': r'''
<script>
/* BARCODE_SCANNER_NORMALIZATION_V1_MANIFEST */
(function(){
  function bindFutureScannerFields(){document.querySelectorAll('[data-barcode-search],#manifestSearch,#orderSearch').forEach(el=>{if(el.dataset.barcodeCleanBound)return;el.dataset.barcodeCleanBound='1';el.addEventListener('input',()=>{const c=window.cleanBarcodeScannerInput(el.value);if(c!==el.value)el.value=c;});el.addEventListener('keydown',e=>{if(e.key==='Enter'){el.value=window.cleanBarcodeScannerInput(el.value);el.dispatchEvent(new Event('input',{bubbles:true}));}})})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindFutureScannerFields);else bindFutureScannerFields();
})();
</script>
'''
}

for name in FILES:
    p=Path(name)
    text=p.read_text(encoding='utf-8')
    if MARK in text:
        continue
    p.write_text(text + '\n' + COMMON + EXTRAS[name] + '\n', encoding='utf-8')
