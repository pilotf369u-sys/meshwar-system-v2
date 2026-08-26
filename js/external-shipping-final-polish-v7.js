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

/* Hard light-mode override for all operational table form controls. */
html[data-mw-theme="light"] ${tableSelector} input,
html[data-mw-theme="light"] ${tableSelector} select{
  border:1px solid #cbd5e1!important;
  background-color:#ffffff!important;
  color:#0f172a!important;
  height:36px!important;
  min-height:36px!important;
  border-radius:6px!important;
  padding:0 7px!important;
  margin:0!important;
  font-size:13px!important;
  font-weight:600!important;
  line-height:34px!important;
  text-align:center!important;
  vertical-align:middle!important;
  box-sizing:border-box!important;
  box-shadow:0 1px 2px rgba(15,23,42,.05)!important;
  outline:none!important;
}
html[data-mw-theme="light"] ${tableSelector} select{text-align-last:center!important}
html[data-mw-theme="light"] ${tableSelector} input:focus,
html[data-mw-theme="light"] ${tableSelector} select:focus{
  border-color:#94a3b8!important;
  background-color:#ffffff!important;
  box-shadow:0 0 0 2px rgba(148,163,184,.16)!important;
}

html[data-mw-theme="light"] ${tableSelector} .collect-due{background:#fff7ed!important;color:#9a3412!important;border-color:#fdba74!important}
#mw-theme-toggle{position:fixed;left:14px;bottom:14px;z-index:5000;border:1px solid rgba(148,163,184,.28);border-radius:999px;padding:8px 11px;font-size:12px;font-weight:900;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.18);background:#0f172a;color:#f8fafc}
html[data-mw-theme="light"] #mw-theme-toggle{background:#fff;color:#172033;border-color:#cbd5e1}
`;document.head.appendChild(s)}
function forceLightControls(){
  if(document.documentElement.dataset.mwTheme!=='light')return;
  const table=document.querySelector(tableSelector);if(!table)return;
  table.querySelectorAll('input,select').forEach(el=>{
    el.style.setProperty('border','1px solid #cbd5e1','important');
    el.style.setProperty('background-color','#ffffff','important');
    el.style.setProperty('color','#0f172a','important');
    el.style.setProperty('height','36px','important');
    el.style.setProperty('min-height','36px','important');
    el.style.setProperty('border-radius','6px','important');
    el.style.setProperty('padding','0 7px','important');
    el.style.setProperty('margin','0','important');
    el.style.setProperty('font-size','13px','important');
    el.style.setProperty('font-weight','600','important');
    el.style.setProperty('line-height','34px','important');
    el.style.setProperty('text-align','center','important');
    el.style.setProperty('vertical-align','middle','important');
    el.style.setProperty('box-sizing','border-box','important');
    el.style.setProperty('box-shadow','0 1px 2px rgba(15,23,42,.05)','important');
    if(el.tagName==='SELECT')el.style.setProperty('text-align-last','center','important');
  });
}
function applyTheme(theme){const next=theme==='light'?'light':'dark';document.documentElement.dataset.mwTheme=next;localStorage.setItem(storageKey,next);const b=document.getElementById('mw-theme-toggle');if(b)b.textContent=next==='light'?'🌙 الوضع الداكن':'☀️ الوضع المضيء';if(next==='light')requestAnimationFrame(forceLightControls)}
function installToggle(){if(document.getElementById('mw-theme-toggle'))return;const b=document.createElement('button');b.id='mw-theme-toggle';b.type='button';b.setAttribute('aria-label','تبديل الوضع المضيء والداكن');b.onclick=()=>applyTheme(document.documentElement.dataset.mwTheme==='light'?'dark':'light');document.body.appendChild(b);applyTheme(localStorage.getItem(storageKey)||'dark')}
function centerHeaders(){const table=document.querySelector(tableSelector),head=table?.tHead?.rows?.[0];if(!head)return;[...head.cells].forEach(th=>{th.style.setProperty('text-align','center','important');th.style.setProperty('vertical-align','middle','important')})}
installStyles();installToggle();centerHeaders();forceLightControls();
new MutationObserver(()=>{centerHeaders();forceLightControls()}).observe(document.documentElement,{childList:true,subtree:true});
window.MeshwarExternalShippingFinalPolishV7={version:'20260826-v7.2',applyTheme,centerHeaders,forceLightControls};
})();
