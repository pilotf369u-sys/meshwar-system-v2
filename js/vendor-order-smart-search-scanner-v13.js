/* MESHWAR_VENDOR_ORDER_SMART_SEARCH_SCANNER_V13_CAMERA_DEVICEID_V14 */
(function(){
  const QR_LIB='https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js';
  const state=new WeakMap();

  function clean(value){
    let v=String(value??'').normalize('NFKD')
      .replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d))
      .replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
      .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u200B-\u200F\u202A-\u202E\u2060\uFEFF]/g,'')
      .replace(/[\r\n\t\s]+/g,'').toUpperCase().replace(/[^A-Z0-9-]/g,'').replace(/-{2,}/g,'-');
    v=v.replace(/^-+/,'-').replace(/-+$/,'');
    if(/^-[0-9]+$/.test(v))v='MW'+v;
    else if(/^MW[0-9]+$/.test(v))v='MW-'+v.slice(2);
    return v;
  }

  function normalizeText(value){return String(value??'').trim().toLowerCase()}

  function sanitizeInput(win,{preserveCaret=true}={}){
    const input=win.document.getElementById('vendorOrderSmartSearch');if(!input)return'';
    const before=String(input.value||''),after=clean(before);
    if(before!==after){
      const pos=preserveCaret?Math.min(after.length,input.selectionStart??after.length):after.length;
      input.value=after;
      try{input.setSelectionRange(pos,pos)}catch{}
    }
    return after;
  }

  function rowOrderCode(row){
    const first=row?.querySelector('td[data-label="رقم الطلب"] .font-bold,td[data-label="رقم الطلب"]');
    return clean(first?.textContent||'');
  }

  function clearHighlight(win){
    win.document.querySelectorAll('#ordersBody tr[data-mw-order-highlight]').forEach(row=>{
      delete row.dataset.mwOrderHighlight;
      row.style.removeProperty('outline');row.style.removeProperty('outline-offset');row.style.removeProperty('box-shadow');row.style.removeProperty('background');
    });
  }

  function filterRows(win,{highlightExact=false}={}){
    const d=win.document,input=d.getElementById('vendorOrderSmartSearch');
    const raw=String(input?.value||'').trim(),q=normalizeText(raw),barcode=clean(raw);
    clearHighlight(win);
    let visible=0,exactRow=null;
    d.querySelectorAll('#ordersBody tr').forEach(row=>{
      const cells=row.querySelectorAll('td');if(!cells.length)return;
      const hay=normalizeText(row.textContent||'');
      const orderCode=rowOrderCode(row);
      const show=!q||hay.includes(q)||(barcode&&orderCode===barcode);
      row.style.setProperty('display',show?'':'none','important');
      if(show)visible++;
      if(barcode&&orderCode===barcode)exactRow=row;
    });
    const hint=d.getElementById('vendorOrderSmartSearchHint');
    if(hint)hint.textContent=raw?`النتائج المطابقة: ${visible}`:'ابحث برقم الطلب، اسم المنتج، المحافظة/المدينة أو الحالة. يمكنك أيضًا مسح باركود الملصق.';
    if(exactRow&&highlightExact){
      exactRow.dataset.mwOrderHighlight='1';
      exactRow.style.setProperty('outline','3px solid #fbbf24','important');
      exactRow.style.setProperty('outline-offset','-3px','important');
      exactRow.style.setProperty('box-shadow','0 0 0 5px rgba(251,191,36,.18),0 14px 36px rgba(2,6,23,.32)','important');
      exactRow.style.setProperty('background','rgba(251,191,36,.12)','important');
      exactRow.scrollIntoView({behavior:'smooth',block:'center'});
      const code=exactRow.querySelector('td[data-label="رقم الطلب"] .font-bold')?.textContent?.trim()||raw;
      if(hint)hint.textContent=`تم تحديد الطلب ${code}`;
    }
    return exactRow;
  }

  function ensureLibrary(win){
    if(win.Html5Qrcode)return Promise.resolve();
    if(win.__mwOrderQrLibPromise)return win.__mwOrderQrLibPromise;
    win.__mwOrderQrLibPromise=new Promise((resolve,reject)=>{
      const s=win.document.createElement('script');s.src=QR_LIB;s.async=true;
      s.onload=resolve;s.onerror=()=>reject(new Error('تعذر تحميل مكتبة ماسح الباركود بالكاميرا.'));
      win.document.head.appendChild(s);
    });
    return win.__mwOrderQrLibPromise;
  }

  function cameraOnlyScanPolicy(win){
    return {supportedScanTypes:[win.Html5QrcodeScanType?.SCAN_TYPE_CAMERA??0]};
  }

  function ensureScannerModal(win){
    const d=win.document;if(d.getElementById('vendorOrderScannerModal'))return;
    const modal=d.createElement('div');modal.id='vendorOrderScannerModal';
    modal.style.cssText='display:none;position:fixed;inset:0;z-index:12000;background:rgba(2,6,23,.9);padding:16px;align-items:center;justify-content:center;';
    modal.innerHTML='<div style="width:min(96vw,620px);background:#0f172a;color:#f8fafc;border:1px solid rgba(251,191,36,.28);border-radius:20px;padding:14px;box-shadow:0 24px 70px rgba(0,0,0,.55)"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px"><b>📷 مسح باركود الطلب</b><button type="button" id="vendorOrderScannerClose" style="border:0;border-radius:10px;background:#be123c;color:#fff;padding:7px 11px;font-weight:900;cursor:pointer">إغلاق</button></div><div id="vendorOrderScannerReader" style="width:100%;min-height:280px"></div><div id="vendorOrderScannerCameraHint" style="margin-top:9px;text-align:center;color:#94a3b8;font-size:12px">جاري تحديد الكاميرا الخلفية...</div></div>';
    d.body.appendChild(modal);
    d.getElementById('vendorOrderScannerClose')?.addEventListener('click',()=>stopCamera(win));
  }

  async function stopCamera(win){
    const st=state.get(win)||{};
    try{if(st.scanner){await st.scanner.stop().catch(()=>{});await st.scanner.clear().catch(()=>{})}}catch{}
    st.scanner=null;state.set(win,st);
    const modal=win.document.getElementById('vendorOrderScannerModal');if(modal)modal.style.display='none';
    setTimeout(()=>win.document.getElementById('vendorOrderSmartSearch')?.focus(),50);
  }

  function applyScannedValue(win,value){
    const input=win.document.getElementById('vendorOrderSmartSearch');if(!input)return;
    input.value=clean(value);filterRows(win,{highlightExact:true});
  }

  function isVirtualOrScreenCamera(camera){
    const label=String(camera?.label||'').toLowerCase();
    return /(screen|display|virtual|obs|capture|desktop|window)/i.test(label);
  }

  function isRearCamera(camera){
    const label=String(camera?.label||'').toLowerCase();
    return /(back|rear|environment|world|traseira|trasera|arrière|arriere|rück|ruck|hinter|خلف|خلفية|الخلفية)/i.test(label);
  }

  async function resolveRearCamera(win){
    const cameras=await win.Html5Qrcode.getCameras();
    if(!Array.isArray(cameras)||!cameras.length)throw new Error('لم يتم العثور على كاميرا متاحة على هذا الجهاز.');
    const physical=cameras.filter(camera=>camera?.id&&!isVirtualOrScreenCamera(camera));
    if(!physical.length)throw new Error('لم يتم العثور على عدسة كاميرا فعلية؛ تم استبعاد مصادر الشاشة/الكاميرات الافتراضية.');
    const rear=physical.find(isRearCamera)||physical[physical.length-1];
    return rear;
  }

  async function startCamera(win){
    ensureScannerModal(win);await ensureLibrary(win);
    const modal=win.document.getElementById('vendorOrderScannerModal');if(modal)modal.style.display='flex';
    const st=state.get(win)||{};
    if(st.scanner){await stopCamera(win);if(modal)modal.style.display='flex'}

    // Camera-only policy. `supportedScanTypes` is a Html5QrcodeScanner option;
    // this layer deliberately uses low-level Html5Qrcode, which has no file/screen picker.
    st.scanPolicy=cameraOnlyScanPolicy(win);

    const rearCamera=await resolveRearCamera(win);
    const hint=win.document.getElementById('vendorOrderScannerCameraHint');
    if(hint)hint.textContent=`الكاميرا المختارة: ${rearCamera.label||'الكاميرا الخلفية'} — وجّه العدسة نحو الباركود.`;

    const scanner=new win.Html5Qrcode('vendorOrderScannerReader');st.scanner=scanner;st.cameraId=rearCamera.id;state.set(win,st);
    const config={fps:10,qrbox:{width:280,height:150},aspectRatio:1.777};
    try{
      await scanner.start({deviceId:{exact:rearCamera.id}},config,async decoded=>{
        applyScannedValue(win,decoded);await stopCamera(win);
      },()=>{});
    }catch(exactDeviceError){
      try{
        await scanner.start(rearCamera.id,config,async decoded=>{
          applyScannedValue(win,decoded);await stopCamera(win);
        },()=>{});
      }catch(e){await stopCamera(win);throw e}
    }
  }

  function injectUi(win){
    const d=win.document,panel=d.getElementById('vendorTab-orders');if(!panel||d.getElementById('vendorOrderSmartSearch'))return;
    const filters=panel.querySelector('.vendor-order-filters');if(!filters)return;
    const box=d.createElement('div');box.id='vendorOrderSmartSearchBox';box.className='mb-3 rounded-2xl border border-sky-400/20 bg-sky-500/10 p-3';
    box.innerHTML='<div class="mb-2 flex flex-wrap items-center justify-between gap-2"><div class="text-xs font-black text-sky-200">🔎 بحث الطلبات / ماسح الباركود</div><button id="vendorOrderCameraBtn" type="button" class="rounded-xl border border-sky-400/30 bg-sky-500/15 px-3 py-2 text-xs font-black text-sky-100">📷 مسح بالكاميرا</button></div><div style="display:flex;gap:8px;align-items:center"><input id="vendorOrderSmartSearch" class="field" placeholder="MW-5664 / اسم المنتج / المحافظة / المدينة / الحالة" autocomplete="off"><button id="vendorOrderSearchClear" type="button" title="مسح البحث" style="width:42px;height:42px;flex:0 0 auto;border:0;border-radius:50%;background:#64748b;color:white;font-size:22px;font-weight:900;cursor:pointer">×</button></div><div id="vendorOrderSmartSearchHint" class="vendor-muted mt-2 text-xs text-slate-400">ابحث برقم الطلب، اسم المنتج، المحافظة/المدينة أو الحالة. يمكنك أيضًا مسح باركود الملصق.</div>';
    filters.parentElement?.insertBefore(box,filters);
    const input=d.getElementById('vendorOrderSmartSearch');
    input?.addEventListener('input',()=>{sanitizeInput(win);filterRows(win)});
    input?.addEventListener('paste',()=>setTimeout(()=>{sanitizeInput(win,{preserveCaret:false});filterRows(win)},0));
    input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();sanitizeInput(win,{preserveCaret:false});filterRows(win,{highlightExact:true});input.select()}});
    d.getElementById('vendorOrderSearchClear')?.addEventListener('click',()=>{if(input){input.value='';filterRows(win);input.focus()}});
    d.getElementById('vendorOrderCameraBtn')?.addEventListener('click',()=>startCamera(win).catch(err=>{console.error('Vendor order scanner failed',err);win.alert('تعذر تشغيل الكاميرا الخلفية: '+(err?.message||err))}));
  }

  function install(win){
    if(!win)return;
    const boot=()=>{
      injectUi(win);ensureScannerModal(win);
      if(!state.has(win))state.set(win,{scanner:null});
      if(!win.__mwVendorOrderSearchObserver){
        const body=win.document.getElementById('ordersBody');
        if(body){
          const ob=new win.MutationObserver(()=>{injectUi(win);setTimeout(()=>filterRows(win),0)});
          ob.observe(body,{childList:true,subtree:false});win.__mwVendorOrderSearchObserver=ob;
        }
      }
      setTimeout(()=>win.document.getElementById('vendorOrderSmartSearch')?.focus(),180);
    };
    if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }

  window.MeshwarVendorOrderSmartSearchV13={install,filterRows,startCamera,stopCamera,clean,sanitizeInput,resolveRearCamera,cameraOnlyScanPolicy};
})();
