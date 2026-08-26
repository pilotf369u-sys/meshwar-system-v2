/* MESHWAR_EXTERNAL_SHIPPING_FINAL_POLISH_V7 */
(function(){
'use strict';
const script=document.currentScript,screen=String(script?.dataset?.meshwarScreen||'').trim().toLowerCase();
if(screen!=='employee'&&screen!=='admin')return;
const tableSelector=screen==='employee'?'#ordersPanel .table-wrap table':'#ordersListPanel .table-wrap table';
const storageKey='meshwar_operational_theme';
const productCol=screen==='employee'?4:6;
const externalCol=screen==='employee'?5:7;
function installStyles(){if(document.getElementById('mw-final-polish-v7'))return;const s=document.createElement('style');s.id='mw-final-polish-v7';s.textContent=`
${tableSelector} thead th{text-align:center!important;vertical-align:middle!important;padding-left:3px!important;padding-right:3px!important}
${tableSelector} thead th:nth-child(${productCol}),
${tableSelector} thead th:nth-child(${externalCol}),
${tableSelector} thead th:nth-child(${screen==='employee'?6:8}){text-align:center!important;justify-content:center!important}
html[data-mw-theme="light"] body{background:#eef2f7!important;color:#172033!important}
html[data-mw-theme="light"] .container,html[data-mw-theme="light"] .main-content,html[data-mw-theme="light"] .card{color:#172033!important}
html[data-mw-theme="light"] ${tableSelector}{background:#fff!important;color:#172033!important}
html[data-mw-theme="light"] ${tableSelector} th{background:#e8edf4!important;color:#172033!important;border-color:#cbd5e1!important}
html[data-mw-theme="light"] ${tableSelector} td{background:#fff!important;color:#172033!important;border-color:#dbe3ea!important}
html[data-mw-theme="light"] ${tableSelector} tr:nth-child(even) td{background:#f8fafc!important}
html[data-mw-theme="light"] ${tableSelector} input,html[data-mw-theme="light"] ${tableSelector} select{background:#fff!important;color:#172033!important;border-color:#94a3b8!important}

/* Light-mode refinement: product price + external shipping only */
html[data-mw-theme="light"] ${tableSelector} tbody td:nth-child(${productCol}) input,
html[data-mw-theme="light"] ${tableSelector} tbody td:nth-child(${productCol}) select,
html[data-mw-theme="light"] ${tableSelector} tbody td:nth-child(${externalCol}) input,
html[data-mw-theme="light"] ${tableSelector} tbody td:nth-child(${externalCol}) select{
  height:34px!important;
  min-height:34px!important;
  padding:0 8px!important;
  margin:0!important;
  border:1px solid #d1d5db!important;
  border-radius:7px!important;
  background:#f9fafb!important;
  color:#111827!important;
  font-size:13px!important;
  font-weight:600!important;
  line-height:32px!important;
  text-align:center!important;
  vertical-align:middle!important;
  box-shadow:inset 0 1px 2px rgba(15,23,42,.04)!important;
  outline:none!important;
  box-sizing:border-box!important;
}
html[data-mw-theme="light"] ${tableSelector} tbody td:nth-child(${productCol}) input:focus,
html[data-mw-theme="light"] ${tableSelector} tbody td:nth-child(${productCol}) select:focus,
html[data-mw-theme="light"] ${tableSelector} tbody td:nth-child(${externalCol}) input:focus,
html[data-mw-theme="light"] ${tableSelector} tbody td:nth-child(${externalCol}) select:focus{
  border-color:#9ca3af!important;
  background:#fff!important;
  box-shadow:0 0 0 2px rgba(148,163,184,.14)!important;
}
html[data-mw-theme="light"] ${tableSelector} tbody td:nth-child(${productCol}) select,
html[data-mw-theme="light"] ${tableSelector} tbody td:nth-child(${externalCol}) select{
  text-align-last:center!important;
}

html[data-mw-theme="light"] ${tableSelector} .collect-due{background:#fff7ed!important;color:#9a3412!important;border-color:#fdba74!important}
#mw-theme-toggle{position:fixed;left:14px;bottom:14px;z-index:5000;border:1px solid rgba(148,163,184,.28);border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18);background:#0f172a;color:#f8fafc}
html[data-mw-theme="light"] #mw-theme-toggle{background:#fff;color:#172033;border-color:#cbd5e1}
`;document.head.appendChild(s)}
function applyTheme(theme){const next=theme==='light'?'light':'dark';document.documentElement.dataset.mwTheme=next;localStorage.setItem(storageKey,next);const b=document.getElementById('mw-theme-toggle');if(b)b.textContent=next==='light'?'🌙 الوضع الداكن':'☀️ الوضع المضيء'}
function installToggle(){if(document.getElementById('mw-theme-toggle'))return;const b=document.createElement('button');b.id='mw-theme-toggle';b.type='button';b.setAttribute('aria-label','تبديل الوضع المضيء والداكن');b.onclick=()=>applyTheme(document.documentElement.dataset.mwTheme==='light'?'dark':'light');document.body.appendChild(b);applyTheme(localStorage.getItem(storageKey)||'dark')}
function centerHeaders(){const table=document.querySelector(tableSelector),head=table?.tHead?.rows?.[0];if(!head)return;[...head.cells].forEach(th=>{th.style.setProperty('text-align','center','important');th.style.setProperty('vertical-align','middle','important')})}
installStyles();installToggle();centerHeaders();
new MutationObserver(centerHeaders).observe(document.documentElement,{childList:true,subtree:true});
window.MeshwarExternalShippingFinalPolishV7={version:'20260826-v7.1',applyTheme,centerHeaders};
})();
