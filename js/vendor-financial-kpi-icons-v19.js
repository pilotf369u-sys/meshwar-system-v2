/* MESHWAR_VENDOR_FINANCIAL_KPI_ICONS_V19 */
(function(){
  const MAP=[
    {id:'statSales',icon:'🛒',tone:'emerald',label:'إجمالي المبيعات الكلية'},
    {id:'statCommission',icon:'🎖️',tone:'sky',label:'عمولة MeshWar'},
    {id:'statOther',icon:'🏷️',tone:'rose',label:'إجمالي الخصومات / أخرى'},
    {id:'statPending',icon:'🪙',tone:'amber',label:'المبلغ المعلق'},
    {id:'statPaid',icon:'💳',tone:'indigo',label:'المبلغ المدفوع'},
    {id:'statNet',icon:'👛',tone:'violet',label:'صافي حساب التاجر'}
  ];
  const COLORS={
    emerald:['#ecfdf5','#059669','#a7f3d0'],sky:['#eff6ff','#0284c7','#bae6fd'],rose:['#fff1f2','#e11d48','#fecdd3'],
    amber:['#fffbeb','#d97706','#fde68a'],indigo:['#eef2ff','#4f46e5','#c7d2fe'],violet:['#f5f3ff','#7c3aed','#ddd6fe']
  };
  function injectCss(win){
    const d=win.document;if(d.getElementById('mwVendorFinancialKpiIconsV19Css'))return;
    const s=d.createElement('style');s.id='mwVendorFinancialKpiIconsV19Css';s.textContent=`
      .mw-kpi-icon-card{position:relative!important;overflow:hidden!important;min-height:108px!important;padding-top:18px!important}
      .mw-kpi-icon-badge{position:absolute;top:12px;inset-inline-start:12px;width:36px;height:36px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:19px;line-height:1;border:1px solid var(--mw-kpi-border);background:var(--mw-kpi-bg);box-shadow:0 7px 18px rgba(15,23,42,.09);user-select:none}
      .mw-kpi-icon-card>.vendor-muted{padding-inline-start:46px!important;min-height:36px;display:flex;align-items:center}
      html.dark .mw-kpi-icon-badge{background:color-mix(in srgb,var(--mw-kpi-accent) 18%,#0f172a)!important;border-color:color-mix(in srgb,var(--mw-kpi-accent) 48%,#334155)!important;box-shadow:0 7px 18px rgba(0,0,0,.22)}
      @media(max-width:640px){.mw-kpi-icon-badge{width:34px;height:34px;font-size:18px}.mw-kpi-icon-card>.vendor-muted{padding-inline-start:44px!important}}
    `;d.head.appendChild(s);
  }
  function decorate(win){
    injectCss(win);const d=win.document;
    MAP.forEach(item=>{
      const value=d.getElementById(item.id);const card=value?.closest('article');if(!card||card.dataset.mwKpiIcon)return;
      const colors=COLORS[item.tone];card.dataset.mwKpiIcon=item.tone;card.classList.add('mw-kpi-icon-card');
      card.style.setProperty('--mw-kpi-bg',colors[0]);card.style.setProperty('--mw-kpi-accent',colors[1]);card.style.setProperty('--mw-kpi-border',colors[2]);
      const badge=d.createElement('div');badge.className='mw-kpi-icon-badge';badge.setAttribute('aria-hidden','true');badge.title=item.label;badge.textContent=item.icon;card.appendChild(badge);
    });
  }
  function install(win){
    if(!win)return;const boot=()=>{decorate(win);let n=0;const t=win.setInterval(()=>{decorate(win);if(++n>20||win.document.querySelectorAll('[data-mw-kpi-icon]').length===6)win.clearInterval(t)},250)};
    if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }
  window.MeshwarVendorFinancialKpiIconsV19={install,decorate};
})();
