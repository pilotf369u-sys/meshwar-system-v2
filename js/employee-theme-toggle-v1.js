/* MESHWAR_EMPLOYEE_THEME_TOGGLE_V1 */
(function(){
'use strict';
const KEY='meshwar_employee_theme';
const root=document.documentElement;
function storedTheme(){try{const v=localStorage.getItem(KEY);return v==='light'||v==='dark'?v:null}catch{return null}}
function preferredTheme(){return storedTheme()||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark')}
function applyTheme(theme){
  const value=theme==='light'?'light':'dark';
  root.dataset.mwTheme=value;
  try{localStorage.setItem(KEY,value)}catch{}
  const btn=document.getElementById('employeeThemeToggle');
  if(btn){btn.setAttribute('aria-pressed',String(value==='light'));btn.title=value==='dark'?'تفعيل الوضع المضيء':'تفعيل الوضع الداكن';btn.innerHTML=value==='dark'?'<i class="fa-solid fa-sun"></i><span>Light</span>':'<i class="fa-solid fa-moon"></i><span>Dark</span>'}
}
function toggleTheme(){applyTheme(root.dataset.mwTheme==='light'?'dark':'light')}
function installStyles(){
  if(document.getElementById('employee-theme-toggle-v1-css'))return;
  const style=document.createElement('style');style.id='employee-theme-toggle-v1-css';style.textContent=`
#employeeThemeToggle{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:78px;height:38px;padding:0 11px;border:1px solid rgba(246,200,95,.42);border-radius:999px;background:#0b1b2e;color:#f6c85f;font-weight:900;cursor:pointer;box-shadow:0 4px 14px #0002}
#employeeThemeToggle:hover{transform:translateY(-1px)}
html[data-mw-theme="light"] body{background:#eef2f7!important;color:#172033!important}
html[data-mw-theme="light"] .container{background:#fff!important;color:#172033!important;box-shadow:0 3px 16px #00000012!important}
html[data-mw-theme="light"] .top-nav{border-color:#e2e8f0!important}
html[data-mw-theme="light"] .toolbar,html[data-mw-theme="light"] .employee-workspace-hint{background:#f8fafc!important;color:#172033!important;border-color:#dbe3ea!important}
html[data-mw-theme="light"] .table-wrap,html[data-mw-theme="light"] table{background:#fff!important;border-color:#dbe3ea!important;color:#172033!important}
html[data-mw-theme="light"] th{background:#e8eef5!important;color:#172033!important;border-color:#d7e0ea!important}
html[data-mw-theme="light"] td{color:#172033!important;border-color:#e2e8f0!important}
html[data-mw-theme="light"] tr.row-new{background:#fff9c4!important}html[data-mw-theme="light"] tr.row-approved{background:#dcfce7!important}html[data-mw-theme="light"] tr.row-rejected{background:#fee2e2!important}
html[data-mw-theme="light"] input,html[data-mw-theme="light"] select{background:#fff!important;color:#172033!important;border-color:#cbd5e1!important;-webkit-text-fill-color:#172033!important;color-scheme:light!important}
html[data-mw-theme="light"] .pipeline-tab{background:#fff!important;color:#334155!important;border-color:#dbe3ea!important}html[data-mw-theme="light"] .pipeline-tab.active{background:#1f4f78!important;color:#fff!important}
html[data-mw-theme="light"] #employeeThemeToggle{background:#fff!important;color:#172033!important;border-color:#cbd5e1!important}
html[data-mw-theme="dark"]{color-scheme:dark}
`;
  document.head.appendChild(style);
}
function installButton(){
  if(document.getElementById('employeeThemeToggle'))return;
  const actions=document.querySelector('.top-actions');if(!actions)return;
  const btn=document.createElement('button');btn.type='button';btn.id='employeeThemeToggle';btn.setAttribute('aria-label','تبديل الوضع المضيء والداكن');btn.onclick=toggleTheme;
  actions.insertBefore(btn,actions.firstChild);
}
window.toggleEmployeeTheme=toggleTheme;
installStyles();applyTheme(preferredTheme());
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{installButton();applyTheme(root.dataset.mwTheme||preferredTheme())},{once:true});else{installButton();applyTheme(root.dataset.mwTheme||preferredTheme())}
})();
