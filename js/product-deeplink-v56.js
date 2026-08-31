/* KINTO V56 — deep-link compatibility guard; preserves existing loaders/routes */
(function(){
  const params=new URLSearchParams(location.search);
  const productId=['productId','product_id','product','pid'].map(k=>params.get(k)).find(v=>String(v||'').trim());
  if(!productId)return;
  const pid=String(productId).trim();
  const style=document.createElement('style');
  style.textContent='@keyframes mwV56DeepPulse{0%,100%{box-shadow:0 0 0 0 rgba(242,202,99,.08),0 18px 44px rgba(0,0,0,.18)}35%{box-shadow:0 0 0 7px rgba(242,202,99,.34),0 24px 58px rgba(0,0,0,.25)}70%{box-shadow:0 0 0 14px rgba(53,212,186,.05),0 20px 50px rgba(0,0,0,.22)}}#localStoreProductsGrid .local-v3-card.mw-v56-deeplink-highlight{border-color:#f2ca63!important;outline:2px solid rgba(242,202,99,.72)!important;outline-offset:3px!important;animation:mwV56DeepPulse 1.15s ease-in-out 3!important;position:relative!important;z-index:8!important}@media(prefers-reduced-motion:reduce){#localStoreProductsGrid .local-v3-card.mw-v56-deeplink-highlight{animation:none!important;box-shadow:0 0 0 5px rgba(242,202,99,.24)!important}}';
  document.head.appendChild(style);
  function keepLocalVisible(){
    const local=document.getElementById('localStoresPublic');
    if(local){local.classList.remove('mw-v55-section-hidden');local.classList.add('mw-v55-active');document.body.classList.add('mw-v55-browse-mode')}
  }
  function findCard(){
    const controls=[...document.querySelectorAll('#localStoreProductsGrid [data-pid]')];
    const control=controls.find(el=>String(el.dataset.pid||'')===pid);
    return control?.closest('.local-v3-card')||null;
  }
  let done=false;
  function focusProduct(){
    if(done)return true;keepLocalVisible();const card=findCard();if(!card)return false;
    done=true;card.classList.add('mw-v56-deeplink-highlight');card.setAttribute('data-deeplink-active','true');
    requestAnimationFrame(()=>card.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'}));
    setTimeout(()=>card.classList.remove('mw-v56-deeplink-highlight'),4200);return true;
  }
  function start(){
    keepLocalVisible();if(focusProduct())return;
    const root=document.getElementById('localStoreProductsGrid')||document.body;
    const mo=new MutationObserver(()=>{if(focusProduct())mo.disconnect()});mo.observe(root,{childList:true,subtree:true});
    let attempts=0;const timer=setInterval(()=>{attempts++;if(focusProduct()||attempts>=80){clearInterval(timer);if(done)mo.disconnect()}},125);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
