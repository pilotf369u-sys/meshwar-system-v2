/* KINTO V78 — deterministic deep-link pulse + isolated-store compatibility */
(function(){
  const params=new URLSearchParams(location.search);
  const productId=['productId','product_id','product','pid'].map(k=>params.get(k)).find(v=>String(v||'').trim());
  if(!productId)return;

  const pid=String(productId).trim();
  const storeId=String(params.get('storeId')||params.get('store_id')||'').trim();

  /* V78: legacy/customer/employee/admin product links still point at index.html.
     Since local storefronts now live on store.html, preserve the exact store/product
     identifiers and move the browser to the isolated storefront before any legacy
     homepage openStore/DOM behavior can intercept the deep link. */
  const onStorePage=/(?:^|\/)store\.html$/i.test(location.pathname);
  if(storeId&&!onStorePage){
    const target=new URL('store.html',location.href);
    target.search=location.search;
    target.searchParams.set('storeId',storeId);
    target.searchParams.set('productId',pid);
    target.hash=location.hash||'';
    location.replace(target.href);
    return;
  }

  const style=document.createElement('style');
  style.id='mwV59DeepLinkStyle';
  style.textContent=`
    @keyframes mwV59GoldPulse{
      0%,100%{
        outline-color:#f4bd2d;
        box-shadow:0 0 0 3px rgba(255,211,79,.96),0 0 16px rgba(255,190,35,.48),0 18px 44px rgba(0,0,0,.22);
        filter:brightness(1)
      }
      50%{
        outline-color:#fff0a8;
        box-shadow:0 0 0 12px rgba(255,211,79,.30),0 0 52px rgba(255,190,35,.98),0 22px 58px rgba(0,0,0,.28);
        filter:brightness(1.055)
      }
    }
    #localStoreProductsGrid .local-v3-card.mw-v59-deeplink-highlight{
      border-color:#ffd34f!important;
      outline:5px solid #ffd34f!important;
      outline-offset:4px!important;
      animation-name:mwV59GoldPulse!important;
      animation-duration:.92s!important;
      animation-timing-function:ease-in-out!important;
      animation-iteration-count:infinite!important;
      animation-fill-mode:both!important;
      position:relative!important;
      z-index:40!important;
      scroll-margin-top:130px!important;
      will-change:box-shadow,filter,outline-color!important
    }
  `;
  if(!document.getElementById(style.id))document.head.appendChild(style);

  function showLocalProductSurface(){
    const local=document.getElementById('localStoresPublic');
    const panel=document.getElementById('localStoreProductsPanel');
    const storesGrid=document.getElementById('localStoresPublicGrid');
    const filters=document.getElementById('localSpecialtyFilters');
    try{window.showStoresTab?.('local')}catch{}
    if(local){local.classList.remove('mw-v55-section-hidden');local.classList.add('mw-v55-active')}
    if(panel)panel.style.setProperty('display','block','important');
    if(storesGrid)storesGrid.style.setProperty('display','none','important');
    if(filters)filters.style.setProperty('display','none','important');
    document.body.classList.add('mw-v55-browse-mode');
  }

  function findCard(){
    return [...document.querySelectorAll('#localStoreProductsGrid .local-v3-card[data-product-card]')]
      .find(card=>String(card.dataset.productCard||'').trim()===pid)||null;
  }

  function removeLegacyInlineFocus(card){
    if(!card)return;
    for(const prop of ['outline','outline-offset','box-shadow','animation','animation-name','animation-duration','animation-timing-function','animation-iteration-count','filter'])card.style.removeProperty(prop);
  }

  let activeCard=null;
  let targetStyleObserver=null;
  let scrubbing=false;
  function guardAgainstLegacyV31(card){
    if(targetStyleObserver)targetStyleObserver.disconnect();
    targetStyleObserver=new MutationObserver(()=>{
      if(scrubbing||!card.isConnected)return;
      scrubbing=true;
      removeLegacyInlineFocus(card);
      scrubbing=false;
    });
    targetStyleObserver.observe(card,{attributes:true,attributeFilter:['style']});
  }

  function pulseCard(card){
    if(!card)return false;
    showLocalProductSurface();
    if(activeCard&&activeCard!==card)activeCard.classList.remove('mw-v56-deeplink-highlight','mw-v57-deeplink-highlight','mw-v58-deeplink-highlight','mw-v59-deeplink-highlight');
    activeCard=card;
    guardAgainstLegacyV31(card);
    removeLegacyInlineFocus(card);
    card.id='product-'+pid;
    card.setAttribute('data-direct-product-focus','true');
    card.setAttribute('data-deeplink-active','true');
    card.classList.remove('mw-v56-deeplink-highlight','mw-v57-deeplink-highlight','mw-v58-deeplink-highlight','mw-v59-deeplink-highlight');
    void card.offsetWidth;
    card.classList.add('mw-v59-deeplink-highlight');
    requestAnimationFrame(()=>card.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'}));
    setTimeout(()=>{if(card.isConnected)card.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'})},180);
    return true;
  }

  let storeOpenPromise=null;
  function openLinkedStore(){
    if(!storeId||typeof window.openStore!=='function')return Promise.resolve();
    if(storeOpenPromise)return storeOpenPromise;
    storeOpenPromise=Promise.resolve(window.openStore('',storeId)).catch(err=>{console.warn('V59 deep-link store open failed',err);storeOpenPromise=null});
    return storeOpenPromise;
  }

  function start(){
    showLocalProductSurface();
    openLinkedStore().finally(()=>{const card=findCard();if(card)pulseCard(card)});

    const root=document.getElementById('localStoreProductsGrid')||document.body;
    const renderObserver=new MutationObserver(()=>{
      showLocalProductSurface();
      const card=findCard();
      if(card&&card!==activeCard)pulseCard(card);
      else if(card)removeLegacyInlineFocus(card);
    });
    renderObserver.observe(root,{childList:true,subtree:true});

    const started=Date.now();
    const timer=setInterval(()=>{
      showLocalProductSurface();
      openLinkedStore();
      const card=findCard();
      if(card&&card!==activeCard)pulseCard(card);
      else if(card)removeLegacyInlineFocus(card);
      if(Date.now()-started>30000){clearInterval(timer);renderObserver.disconnect()}
    },120);

    window.addEventListener('load',()=>setTimeout(()=>{showLocalProductSurface();openLinkedStore().finally(()=>{const card=findCard();if(card)pulseCard(card)})},220),{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
