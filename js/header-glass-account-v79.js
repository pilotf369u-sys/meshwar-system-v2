/* KINTO V79 — account label/icon polish only; preserves auth routes and theme behavior. */
(()=>{'use strict';
const LABEL='طلباتي وسجلي';
function polish(){
  const link=document.getElementById('authLink');
  const text=document.getElementById('authText');
  if(!link||!text)return false;
  text.textContent=LABEL;
  link.setAttribute('aria-label',LABEL);
  link.setAttribute('title','متابعة الطلبات والشحنات والسجل');
  let icon=link.querySelector('i');
  if(icon){icon.className='fa-solid fa-box-archive';icon.setAttribute('aria-hidden','true')}
  return true;
}
function boot(){
  polish();
  const host=document.getElementById('meshwarHeaderControls')||document.body;
  const mo=new MutationObserver(()=>polish());
  mo.observe(host,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['class','style']});
  window.addEventListener('load',()=>setTimeout(polish,120),{once:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
