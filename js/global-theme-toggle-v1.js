/* MESHWAR_GLOBAL_THEME_TOGGLE_V1 */
(function(){
'use strict';
const KEY='meshwar_global_theme';
const LEGACY_KEY='meshwar_employee_theme';
const root=document.documentElement;
function readTheme(){
  try{
    const global=localStorage.getItem(KEY);if(global==='light'||global==='dark')return global;
    const legacy=localStorage.getItem(LEGACY_KEY);if(legacy==='light'||legacy==='dark'){localStorage.setItem(KEY,legacy);return legacy}
  }catch{}
  return 'dark';
}
function writeTheme(v){try{localStorage.setItem(KEY,v)}catch{}}
function applyTheme(theme){
  const value=theme==='light'?'light':'dark';
  root.dataset.mwGlobalTheme=value;
  root.dataset.mwTheme=value;
  writeTheme(value);
  const btn=document.getElementById('mwGlobalThemeToggle');
  if(btn){
    btn.setAttribute('aria-pressed',String(value==='light'));
    btn.title=value==='dark'?'تفعيل الوضع المضيء':'تفعيل الوضع الداكن';
    btn.innerHTML=value==='dark'?'<span aria-hidden="true">☀️</span><span>Light</span>':'<span aria-hidden="true">🌙</span><span>Dark</span>';
  }
}
function toggleTheme(){applyTheme(root.dataset.mwGlobalTheme==='light'?'dark':'light')}
function installStyles(){
  if(document.getElementById('mw-global-theme-v1-css'))return;
  const s=document.createElement('style');s.id='mw-global-theme-v1-css';s.textContent=`
:root{--mw-light-bg:#eef2f7;--mw-light-surface:#ffffff;--mw-light-surface-2:#f8fafc;--mw-light-text:#172033;--mw-light-muted:#64748b;--mw-light-line:#dbe3ea;--mw-light-head:#e8eef5;--mw-light-input:#ffffff;--mw-light-shadow:0 6px 22px rgba(15,23,42,.08)}
#mwGlobalThemeToggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:78px;height:38px;padding:0 11px;border:1px solid rgba(246,200,95,.42);border-radius:999px;background:#0b1b2e;color:#f6c85f;font:800 12px/1 Tahoma,Arial,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.18);flex:0 0 auto}
#mwGlobalThemeToggle:hover{filter:brightness(1.06)}
html[data-mw-global-theme="light"]{color-scheme:light!important;background:var(--mw-light-bg)!important}
html[data-mw-global-theme="light"] body{background:var(--mw-light-bg)!important;color:var(--mw-light-text)!important;background-image:none!important}
html[data-mw-global-theme="light"] .container,
html[data-mw-global-theme="light"] .main-content,
html[data-mw-global-theme="light"] .app-shell,
html[data-mw-global-theme="light"] .card,
html[data-mw-global-theme="light"] .panel-card,
html[data-mw-global-theme="light"] .info-card,
html[data-mw-global-theme="light"] .dashboard-header,
html[data-mw-global-theme="light"] .top-nav,
html[data-mw-global-theme="light"] .toolbar,
html[data-mw-global-theme="light"] .order-toolbar,
html[data-mw-global-theme="light"] .branch-tools,
html[data-mw-global-theme="light"] .summary-card,
html[data-mw-global-theme="light"] .stat-card,
html[data-mw-global-theme="light"] .section,
html[data-mw-global-theme="light"] .content-card{background:var(--mw-light-surface)!important;background-image:none!important;color:var(--mw-light-text)!important;border-color:var(--mw-light-line)!important;box-shadow:var(--mw-light-shadow)!important}
html[data-mw-global-theme="light"] .tabs-nav,
html[data-mw-global-theme="light"] .pipeline-tabs,
html[data-mw-global-theme="light"] .employee-workspace-hint,
html[data-mw-global-theme="light"] .notification-head,
html[data-mw-global-theme="light"] .draft-form,
html[data-mw-global-theme="light"] .chat-box-container{background:var(--mw-light-surface-2)!important;background-image:none!important;color:var(--mw-light-text)!important;border-color:var(--mw-light-line)!important}
html[data-mw-global-theme="light"] table,
html[data-mw-global-theme="light"] .table-wrap{background:var(--mw-light-surface)!important;color:var(--mw-light-text)!important;border-color:var(--mw-light-line)!important}
html[data-mw-global-theme="light"] th{background:var(--mw-light-head)!important;background-image:none!important;color:var(--mw-light-text)!important;border-color:var(--mw-light-line)!important}
html[data-mw-global-theme="light"] td{color:var(--mw-light-text)!important;border-color:var(--mw-light-line)!important}
html[data-mw-global-theme="light"] input,
html[data-mw-global-theme="light"] select,
html[data-mw-global-theme="light"] textarea{background:var(--mw-light-input)!important;color:var(--mw-light-text)!important;-webkit-text-fill-color:var(--mw-light-text)!important;border-color:#cbd5e1!important;opacity:1!important;color-scheme:light!important}
html[data-mw-global-theme="light"] input:disabled,
html[data-mw-global-theme="light"] select:disabled,
html[data-mw-global-theme="light"] textarea:disabled{background:#f8fafc!important;color:#475569!important;-webkit-text-fill-color:#475569!important;opacity:1!important}
html[data-mw-global-theme="light"] .mini,
html[data-mw-global-theme="light"] .muted,
html[data-mw-global-theme="light"] .back-link,
html[data-mw-global-theme="light"] small{color:var(--mw-light-muted)!important}
html[data-mw-global-theme="light"] h1,
html[data-mw-global-theme="light"] h2,
html[data-mw-global-theme="light"] h3,
html[data-mw-global-theme="light"] .welcome,
html[data-mw-global-theme="light"] .panel-head h2{color:var(--mw-light-text)!important;text-shadow:none!important}
html[data-mw-global-theme="light"] .tab-btn,
html[data-mw-global-theme="light"] .pipeline-tab{background:#fff!important;color:#334155!important;border-color:var(--mw-light-line)!important;box-shadow:none!important}
html[data-mw-global-theme="light"] .tab-btn.active,
html[data-mw-global-theme="light"] .pipeline-tab.active{background:#1f4f78!important;color:#fff!important;border-color:#1f4f78!important}
html[data-mw-global-theme="light"] .sidebar{background:#f8fafc!important;background-image:none!important;color:var(--mw-light-text)!important;border-color:var(--mw-light-line)!important;box-shadow:var(--mw-light-shadow)!important}
html[data-mw-global-theme="light"] .sidebar a{background:#fff!important;color:#334155!important;border-color:var(--mw-light-line)!important}
html[data-mw-global-theme="light"] .sidebar a.active{background:#f6c85f!important;color:#17130a!important;border-color:#d7a62e!important}
html[data-mw-global-theme="light"] #mwGlobalThemeToggle{background:#fff!important;color:#172033!important;border-color:#cbd5e1!important}

/* Customer dashboard: high-contrast light mode only. */
html[data-mw-global-theme="light"] .dashboard-header .welcome,
html[data-mw-global-theme="light"] .dashboard-header .welcome i,
html[data-mw-global-theme="light"] .identity-chips .chip,
html[data-mw-global-theme="light"] .identity-chips .chip *,
html[data-mw-global-theme="light"] .warehouse-text,
html[data-mw-global-theme="light"] .warehouse-text *,
html[data-mw-global-theme="light"] .info-card,
html[data-mw-global-theme="light"] .info-card h3,
html[data-mw-global-theme="light"] #rewardStatusBadge,
html[data-mw-global-theme="light"] #rewardStatusBadge *{color:#0f172a!important;text-shadow:none!important}
html[data-mw-global-theme="light"] .identity-chips .chip{background:#e2e8f0!important;border:1px solid #cbd5e1!important;color:#0f172a!important}
html[data-mw-global-theme="light"] .warehouse-text{color:#1e293b!important}
html[data-mw-global-theme="light"] .customer-code,
html[data-mw-global-theme="light"] .qty-badge,
html[data-mw-global-theme="light"] .siparis-no{background:#fef3c7!important;color:#78350f!important;border-color:#f59e0b!important;font-weight:900!important}
html[data-mw-global-theme="light"] .tab-badge{background:#dc2626!important;color:#fff!important;border-color:#fff!important}
html[data-mw-global-theme="light"] .btn-details{background:#dbeafe!important;color:#1e3a8a!important;border:1px solid #93c5fd!important;font-weight:900!important}
html[data-mw-global-theme="light"] .decision-box,
html[data-mw-global-theme="light"] .payment-box{box-sizing:border-box!important;width:100%!important;max-width:100%!important;min-width:0!important;overflow:hidden!important;overflow-wrap:anywhere!important;word-break:normal!important;white-space:normal!important}
html[data-mw-global-theme="light"] td .decision-box,
html[data-mw-global-theme="light"] td .payment-box{margin:0!important;padding:8px!important}
html[data-mw-global-theme="light"] .decision-box>*{max-width:100%!important;box-sizing:border-box!important;white-space:normal!important;overflow-wrap:anywhere!important}
html[data-mw-global-theme="light"] .decision-box .btn-approve,
html[data-mw-global-theme="light"] .decision-box .btn-cancel{display:inline-flex!important;align-items:center!important;justify-content:center!important;max-width:100%!important;min-height:34px!important;padding:7px 9px!important;margin:3px 2px!important;white-space:normal!important;line-height:1.25!important;font-weight:900!important;border:1px solid transparent!important}
html[data-mw-global-theme="light"] .decision-box .btn-approve{background:#dcfce7!important;color:#14532d!important;border-color:#86efac!important}
html[data-mw-global-theme="light"] .decision-box .btn-cancel{background:#fee2e2!important;color:#991b1b!important;border-color:#fca5a5!important}
html[data-mw-global-theme="light"] .payment-box{background:#ecfdf5!important;color:#14532d!important;border:1px solid #86efac!important}
html[data-mw-global-theme="light"] .payment-box *{color:#14532d!important}
html[data-mw-global-theme="dark"]{color-scheme:dark}
`;
  document.head.appendChild(s);
}
function findHost(){
  return document.querySelector('.top-actions,.dashboard-header,.top-nav,.header-actions,.page-header,.dashboard-topbar,.topbar,.header')||document.body;
}
function installButton(){
  if(document.getElementById('mwGlobalThemeToggle'))return;
  const host=findHost(),btn=document.createElement('button');
  btn.type='button';btn.id='mwGlobalThemeToggle';btn.setAttribute('aria-label','تبديل الوضع المضيء والداكن');btn.onclick=toggleTheme;
  if(host===document.body){btn.style.position='fixed';btn.style.left='16px';btn.style.top='16px';btn.style.zIndex='15000'}
  else if(host.classList.contains('dashboard-header')){btn.style.marginInlineStart='8px'}
  host.insertBefore(btn,host.firstChild||null);
  applyTheme(root.dataset.mwGlobalTheme||readTheme());
}
installStyles();applyTheme(readTheme());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installButton,{once:true});else installButton();
window.MeshwarGlobalTheme={version:'20260826-global-theme-v1.1',applyTheme,toggleTheme};
})();
