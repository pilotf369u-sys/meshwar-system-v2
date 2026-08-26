/* MESHWAR_CUSTOMER_LIGHT_POLISH_V1 — customer-light-v16 — CSS only, no DOM restructuring */
(function(){
'use strict';
if(document.getElementById('mw-customer-light-polish-v1')) return;
const s=document.createElement('style');
s.id='mw-customer-light-polish-v1';
s.textContent=`
/* Customer Light Mode only — build: customer-light-v16 */
html[data-mw-global-theme="light"] .panel-head > span,
html[data-mw-global-theme="light"] .panel-head .mini,
html[data-mw-global-theme="light"] .panel-head .muted{
  color:#334155!important;
  background:#f8fafc!important;
  border-color:#e2e8f0!important;
}
/* All Siparis badges, including the missing / غير محدد state */
html[data-mw-global-theme="light"] .siparis-no,
html[data-mw-global-theme="light"] .siparis-no.missing{
  display:inline-block!important;
  margin-top:5px!important;
  padding:4px 7px!important;
  border-radius:7px!important;
  background:#f1f5f9!important;
  color:#475569!important;
  border:1px solid #cbd5e1!important;
  font-weight:800!important;
  box-shadow:none!important;
}
html[data-mw-global-theme="light"] .tab-btn.active{
  box-shadow:0 5px 14px rgba(15,23,42,.16)!important;
}
html[data-mw-global-theme="light"] .summary-grid .info-card,
html[data-mw-global-theme="light"] .warehouse-card{
  border:1px solid #e2e8f0!important;
  border-radius:12px!important;
}
/* Preserve existing hover behavior; only soften light-mode border/shadow */
html[data-mw-global-theme="light"] .summary-grid .info-card:hover{
  border-color:#cbd5e1!important;
  box-shadow:0 10px 24px rgba(15,23,42,.10)!important;
}
@media(max-width:850px){
  html[data-mw-global-theme="light"] .summary-grid .info-card,
  html[data-mw-global-theme="light"] .warehouse-card{border-radius:12px!important}
}
`;
document.head.appendChild(s);
})();
