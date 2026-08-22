/* MESHWAR_VENDOR_ORDER_STATUS_CONTRAST_V18 */
(function(){
  const STYLE_ID='mwVendorOrderStatusContrastV18Css';

  function normalizeStatus(value){
    return String(value??'').trim().toLowerCase();
  }

  function statusTone(value){
    const s=normalizeStatus(value);
    if(/تم التسليم|تم التسديد|مسدد|مدفوع|delivered|paid/.test(s))return'success';
    if(/ملغي|ملغى|الغاء|إلغاء|مرتجع|ارجاع|إرجاع|مرفوض|رفض|cancel|return|refund/.test(s))return'danger';
    if(/قيد التوصيل|جاري الشحن|تم الشحن|شحن|مندوب|توزيع|فرع|delivery|courier|shipping/.test(s))return'transit';
    if(/بانتظار الموافقة|بانتظار رد الموظف|انتظار|موافقة|تدقيق|جديد|pending|approval/.test(s))return'pending';
    return'neutral';
  }

  function injectCss(win){
    const d=win.document;if(d.getElementById(STYLE_ID))return;
    const style=d.createElement('style');style.id=STYLE_ID;style.textContent=`
      html.light body{background:#f3f4f6!important;background-image:linear-gradient(135deg,#f3f4f6,#e5e7eb)!important}
      html.light .glass{background:#f3f4f6!important;border-color:#c7cbd1!important;box-shadow:0 10px 26px rgba(31,41,55,.08)!important}
      html.light .vendor-table-wrap,html.light table{background:#f3f4f6!important;border-color:#c7cbd1!important}
      html.light #ordersBody tr{background:#f8f9fb!important;border-color:#d1d5db!important}
      html.light #ordersBody tr:hover{background:#eef0f3!important}
      html.light #vendorOrderSmartSearchBox{background:#e9eef3!important;border-color:#9ca3af!important}

      #vendorOrderCameraBtn{opacity:1!important;border-width:1px!important;transition:transform .16s ease,box-shadow .16s ease,background .16s ease!important}
      html.light #vendorOrderCameraBtn{background:linear-gradient(135deg,#17345f,#244f86)!important;color:#fff!important;border-color:#102d54!important;box-shadow:0 5px 14px rgba(23,52,95,.2)!important}
      html.light #vendorOrderCameraBtn:hover{background:linear-gradient(135deg,#102d54,#1f4577)!important;border-color:#d4af37!important;box-shadow:0 8px 18px rgba(23,52,95,.28)!important;transform:translateY(-1px)}
      html.dark #vendorOrderCameraBtn{background:#1d4ed8!important;color:#fff!important;border-color:#60a5fa!important}
      html.dark #vendorOrderCameraBtn:hover{background:#2563eb!important;box-shadow:0 7px 18px rgba(37,99,235,.25)!important;transform:translateY(-1px)}

      #ordersBody button[onclick*="openVendorOrderDetails"]{opacity:1!important;transition:transform .16s ease,box-shadow .16s ease,background .16s ease!important}
      html.light #ordersBody button[onclick*="openVendorOrderDetails"]{background:linear-gradient(135deg,#c79518,#e4bd4f)!important;color:#172033!important;border:1px solid #9f7411!important;box-shadow:0 4px 11px rgba(164,118,17,.18)!important}
      html.light #ordersBody button[onclick*="openVendorOrderDetails"]:hover{background:linear-gradient(135deg,#b58412,#d4af37)!important;border-color:#76540b!important;box-shadow:0 7px 16px rgba(164,118,17,.28)!important;transform:translateY(-1px)}
      html.dark #ordersBody button[onclick*="openVendorOrderDetails"]{background:#b98b17!important;color:#fff!important;border-color:#e0bc53!important}
      html.dark #ordersBody button[onclick*="openVendorOrderDetails"]:hover{background:#d4af37!important;color:#111827!important;transform:translateY(-1px)}

      [data-mw-order-status-tone]{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-height:28px!important;padding:5px 10px!important;border-radius:999px!important;border-width:1px!important;border-style:solid!important;font-weight:900!important;line-height:1.25!important;white-space:nowrap!important}
      html.light [data-mw-order-status-tone="success"]{background:#dcfce7!important;color:#166534!important;border-color:#86efac!important}
      html.light [data-mw-order-status-tone="danger"]{background:#fee2e2!important;color:#b91c1c!important;border-color:#fca5a5!important}
      html.light [data-mw-order-status-tone="transit"]{background:#dbeafe!important;color:#1e40af!important;border-color:#93c5fd!important}
      html.light [data-mw-order-status-tone="pending"]{background:#fef3c7!important;color:#92400e!important;border-color:#fcd34d!important}
      html.light [data-mw-order-status-tone="neutral"]{background:#e5e7eb!important;color:#374151!important;border-color:#9ca3af!important}
      html.dark [data-mw-order-status-tone="success"]{background:rgba(22,101,52,.32)!important;color:#bbf7d0!important;border-color:#22c55e!important}
      html.dark [data-mw-order-status-tone="danger"]{background:rgba(185,28,28,.3)!important;color:#fecaca!important;border-color:#ef4444!important}
      html.dark [data-mw-order-status-tone="transit"]{background:rgba(30,64,175,.34)!important;color:#bfdbfe!important;border-color:#3b82f6!important}
      html.dark [data-mw-order-status-tone="pending"]{background:rgba(146,64,14,.3)!important;color:#fde68a!important;border-color:#f59e0b!important}
      html.dark [data-mw-order-status-tone="neutral"]{background:rgba(71,85,105,.45)!important;color:#e2e8f0!important;border-color:#64748b!important}
    `;d.head.appendChild(style);
  }

  function decorateStatuses(win){
    const d=win.document;
    d.querySelectorAll('#ordersBody tr').forEach(row=>{
      const cell=row.querySelector('td[data-label="الحالة"]');if(!cell)return;
      const badge=cell.querySelector('span')||cell;
      badge.dataset.mwOrderStatusTone=statusTone(cell.textContent||'');
    });
  }

  function decorate(win){
    injectCss(win);decorateStatuses(win);
  }

  function install(win){
    if(!win)return;
    const boot=()=>{
      decorate(win);
      if(win.__mwOrderStatusContrastObserver)return;
      const body=win.document.getElementById('ordersBody');
      if(body){
        const ob=new win.MutationObserver(()=>setTimeout(()=>decorateStatuses(win),0));
        ob.observe(body,{childList:true,subtree:true});
        win.__mwOrderStatusContrastObserver=ob;
      }
      let attempts=0;const timer=win.setInterval(()=>{
        attempts++;decorate(win);
        if(attempts>30&&win.document.getElementById('vendorOrderCameraBtn'))win.clearInterval(timer);
      },250);
    };
    if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }

  window.MeshwarVendorOrderStatusContrastV18={install,decorateStatuses,statusTone};
})();
