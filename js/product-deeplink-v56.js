/* KINTO V56 — durable product deep-link navigation + highlight */
(function(){
  const params=new URLSearchParams(location.search);
  const productId=['productId','product_id','product','pid'].map(k=>params.get(k)).find(v=>String(v||'').trim());
  if(!productId)return;

  const pid=String(productId).trim();
  const storeId=String(params.get('storeId')||params.get('store_id')||'').trim();
  const style=document.createElement('style');
  style.id='mwV56DurableDeepLinkStyle';
  style.textContent='@keyframes mwV56DeepPulse{0%,100%{box-shadow:0 0 0 2px rgba(242,202,99,.32),0 18px 44px rgba(0,0,0,.18);transform:scale(1)}35%{box-shadow:0 0 0 8px rgba(242,202,99,.42),0 24px 58px rgba(0,0,0,.25);transform:scale(1.018)}70%{box-shadow:0 0 0 14px rgba(53,212,186,.08),0 20px 50px rgba(0,0,0,.22);transform:scale(.995)}}#localStoreProductsGrid .local-v3-card.mw-v56-deeplink-highlight{border-color:#f2ca63!important;outline:3px solid rgba(242,202,99,.78)!important;outline-offset:3px!important;animation:mwV56DeepPulse 1.05s ease-in-out 6!important;position:relative!important;z-index:20!important;scroll-margin-top:120px!important}@media(prefers-reduced-motion:reduce){#localStoreProductsGrid .local-v3-card.mw-v56-deeplink-highlight{animation:none!important;box-shadow:0 0 0 6px rgba(242,202,99,.32)!important}}';
  if(!document.getElementById(style.id))document.head.appendChild(style);

  function keepProductSurfaceVisible(){
    const local=document.getElementById('localStoresPublic');
    const panel=document.getElementById('localStoreProductsPanel');
    const storesGrid=document.getElementById('localStoresPublicGrid');
    const filters=document.getElementById('localSpecialtyFilters');
    if(local){
      local.classList.remove('mw-v55-section-hidden');
      local.classList.add('mw-v55-active');
    }
    if(panel)panel.style.display='block';
    if(storesGrid)storesGrid.style.display='none';
    if(filters)filters.style.display='none';
    document.body.classList.add('mw-v55-browse-mode');
    try{window.showStoresTab?.('local')}catch{}
    if(local){local.classList.remove('mw-v55-section-hidden');local.classList.add('mw-v55-active')}
  }

  function findCard(){
    return [...document.querySelectorAll('#localStoreProductsGrid .local-v3-card[data-product-card]')]
      .find(card=>String(card.dataset.productCard||'')===pid)||null;
  }

  let lastCard=null;
  let lastFocusAt=0;
  function focusProduct(force){
    keepProductSurfaceVisible();
    const card=findCard();
    if(!card)return false;
    const now=Date.now();
    if(!force&&card===lastCard&&now-lastFocusAt<900)return true;
    lastCard=card;lastFocusAt=now;
    card.id='product-'+pid;
    card.setAttribute('data-direct-product-focus','true');
    card.setAttribute('data-deeplink-active','true');
    card.classList.remove('mw-v56-deeplink-highlight');
    void card.offsetWidth;
    card.classList.add('mw-v56-deeplink-highlight');
    requestAnimationFrame(()=>card.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'}));
    setTimeout(()=>{if(card.isConnected)card.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'})},140);
    return true;
  }

  let openedStore=false;
  async function ensureStoreOpened(){
    keepProductSurfaceVisible();
    if(!storeId||openedStore)return;
    if(typeof window.openStore!=='function')return;
    openedStore=true;
    try{await window.openStore('',storeId)}catch(err){openedStore=false;console.warn('V56 deep-link store open failed',err)}
    focusProduct(true);
  }

  function start(){
    keepProductSurfaceVisible();
    ensureStoreOpened();
    focusProduct(true);

    const root=document.getElementById('localStoreProductsGrid')||document.body;
    const observer=new MutationObserver(()=>{
      keepProductSurfaceVisible();
      ensureStoreOpened();
      const current=findCard();
      if(current&&current!==lastCard)focusProduct(true);
    });
    observer.observe(root,{childList:true,subtree:true});

    let attempts=0;
    const timer=setInterval(()=>{
      attempts++;
      keepProductSurfaceVisible();
      ensureStoreOpened();
      focusProduct(attempts%8===0);
      if(attempts>=160){clearInterval(timer);observer.disconnect();focusProduct(true)}
    },125);

    window.addEventListener('load',()=>setTimeout(()=>{ensureStoreOpened();focusProduct(true)},180),{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();