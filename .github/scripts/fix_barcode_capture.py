from pathlib import Path

FILES = {
    'employee-dashboard.html': ('employeeOrderSearch', 'employee'),
    'admin-dashboard.html': ('orderSearchInput', 'admin'),
    'branch-dashboard.html': ('orderSearch', 'branch'),
}

COMMON = r'''
<script>
/* BARCODE_SCANNER_CAPTURE_FIX_V2 */
(function(){
  const arabicKeyboardToEnglish={
    'ض':'q','ص':'w','ث':'e','ق':'r','ف':'t','غ':'y','ع':'u','ه':'i','خ':'o','ح':'p','ج':'[','د':']',
    'ش':'a','س':'s','ي':'d','ب':'f','ل':'g','ا':'h','ت':'j','ن':'k','م':'l','ك':';','ط':"'",
    'ئ':'z','ء':'x','ؤ':'c','ر':'v','ى':'n','ة':'m','و':',','ز':'.','ظ':'/'
  };
  function keyboardLatinize(text){return String(text||'').split('').map(ch=>arabicKeyboardToEnglish[ch]??ch).join('')}
  window.cleanBarcodeScannerInput=function(value){
    let s=String(value??'').normalize('NFKC');
    try{s=s.replace(/\p{M}+/gu,'')}catch(_){s=s.replace(/[\u0300-\u036f\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g,'')}
    s=s.replace(/[\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g,'')
      .replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[‐‑‒–—―−﹘﹣－]/g,'-')
      .replace(/[“”„‟«»‹›`´]/g,'')
      .replace(/[\r\n\t]+/g,' ')
      .trim();
    if(/\d/.test(s)){
      s=keyboardLatinize(s).toUpperCase().replace(/\s+/g,'');
      s=s.replace(/^MW[_:./\\-]*/,'MW-').replace(/^MW(?=\d)/,'MW-');
      s=s.replace(/[^A-Z0-9._\-\/]/g,'');
      s=s.replace(/^[-_./\\]+|[-_./\\]+$/g,'');
      const mw=s.match(/^MW[-_./\\]*(\d+)$/i);if(mw)return 'MW-'+mw[1];
      if(/^\d+$/.test(s))return s;
      if(/^\d+[-_./\\]+$/.test(s))return s.replace(/\D/g,'');
    }
    return s.replace(/\s{2,}/g,' ').trim();
  };
})();
</script>
'''

BINDINGS = {
'employee': r'''
<script>
/* BARCODE_SCANNER_CAPTURE_FIX_V2_EMPLOYEE */
(function(){
  function runCleanSearch(el){
    el.value=window.cleanBarcodeScannerInput(el.value);
    clearTimeout(pipelineSearchTimer);pipelinePage=1;loadPipelineOrders();
  }
  function bind(){const el=document.getElementById('employeeOrderSearch');if(!el||el.dataset.barcodeCaptureV2)return;el.dataset.barcodeCaptureV2='1';
    el.addEventListener('input',()=>{const c=window.cleanBarcodeScannerInput(el.value);if(c!==el.value)el.value=c;},true);
    el.addEventListener('paste',e=>{e.preventDefault();const pasted=(e.clipboardData||window.clipboardData)?.getData('text')||'';el.value=window.cleanBarcodeScannerInput(pasted);el.dispatchEvent(new Event('input',{bubbles:true}));},true);
    el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();runCleanSearch(el);}},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
</script>
''',
'admin': r'''
<script>
/* BARCODE_SCANNER_CAPTURE_FIX_V2_ADMIN */
(function(){
  function runCleanSearch(el){
    el.value=window.cleanBarcodeScannerInput(el.value);
    clearTimeout(orderSearchTimer);orderPage=1;loadAdminOrders();
  }
  function bind(){const el=document.getElementById('orderSearchInput');if(!el||el.dataset.barcodeCaptureV2)return;el.dataset.barcodeCaptureV2='1';
    el.addEventListener('input',()=>{const c=window.cleanBarcodeScannerInput(el.value);if(c!==el.value)el.value=c;},true);
    el.addEventListener('paste',e=>{e.preventDefault();const pasted=(e.clipboardData||window.clipboardData)?.getData('text')||'';el.value=window.cleanBarcodeScannerInput(pasted);el.dispatchEvent(new Event('input',{bubbles:true}));},true);
    el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();runCleanSearch(el);}},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
</script>
''',
'branch': r'''
<script>
/* BARCODE_SCANNER_CAPTURE_FIX_V2_BRANCH */
(function(){
  const oldClean=typeof cleanSearchText==='function'?cleanSearchText:null;
  cleanSearchText=function(v){const c=window.cleanBarcodeScannerInput(v);return oldClean?oldClean(c):c};
  function runCleanSearch(el){el.value=window.cleanBarcodeScannerInput(el.value);page=1;loadOrders();}
  function bind(){const el=document.getElementById('orderSearch');if(!el||el.dataset.barcodeCaptureV2)return;el.dataset.barcodeCaptureV2='1';
    el.addEventListener('input',()=>{const c=window.cleanBarcodeScannerInput(el.value);if(c!==el.value)el.value=c;},true);
    el.addEventListener('paste',e=>{e.preventDefault();const pasted=(e.clipboardData||window.clipboardData)?.getData('text')||'';el.value=window.cleanBarcodeScannerInput(pasted);el.dispatchEvent(new Event('input',{bubbles:true}));},true);
    el.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();runCleanSearch(el);}},true);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind);else bind();
})();
</script>
'''
}

for name, (_, kind) in FILES.items():
    p=Path(name)
    text=p.read_text(encoding='utf-8')
    marker='BARCODE_SCANNER_CAPTURE_FIX_V2_'+kind.upper()
    if marker in text:
        continue
    p.write_text(text+'\n'+COMMON+'\n'+BINDINGS[kind]+'\n',encoding='utf-8')
