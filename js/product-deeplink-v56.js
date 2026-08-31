/* KINTO V58 — deterministic deep-link pulse, resilient to legacy V31 inline focus */
(function(){
  const params=new URLSearchParams(location.search);
  const productId=['productId','product_id','product','pid'].map(k=>params.get(k)).find(v=>String(v||'').trim());
  if(!productId)return;

  const pid=String(productId).trim();
  const storeId=String(params.get('storeId')||params.get('store_id')||'').trim();
  const style=document.createElement('style');
  style.id='mwV58DeepLinkStyle';
  style.textContent=`
    @keyframes mwV58GoldPulse{
      0%,100%{box-shadow:0 0 0 3px rgba(255,211,79,.96),0 0 16px rgba(255,190,35,.48),0 18px 44px rgba(0,0,0,.22);transform:scale(1)}
      50%{box-shadow:0 0 0 11px rgba(255,211,79,.42),0 0 46px rgba(255,190,35,.98),0 24px 60px rgba(0,0,0,.30);transform:scale(1.028)}
    }
    #localStoreProductsGrid .local-v3-card.mw-v58-deeplink-highlight{
      border-color:#ffd34f!important;outline:5px solid #ffd34f!important;outline-offset:4px!important;
      animation:mwV58GoldPulse .72s ease-in-out 10!important;position:relative!important;z-index:40!important;
      scroll-margin-top:130px!important;will-change:transform,box-shadow!important
    }
    @media(prefers-reduced-motion:reduce){#localStoreProductsGrid .local-v3-card.mw-v58-deeplink-highlight{animation:none!important;box-shadow:0 0 0 9px rgba(255,211,79,.60),0 0 38px rgba(255,190,35,.82)!important}}
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
    for(const prop of ['outline','outline-offset','box-shadow','animation'])card.style.removeProperty(prop);
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
    if(activeCard&&activeCard!==card)activeCard.classList.remove('mw-v56-deeplink-highlight','mw-v57-deeplink-highlight','mw-v58-deeplink-highlight');
    activeCard=card;
    guardAgainstLegacyV31(card);
    removeLegacyInlineFocus(card);
    card.id='product-'+pid;
    card.setAttribute('data-direct-product-focus','true');
    card.setAttribute('data-deeplink-active','true');
    card.classList.remove('mw-v56-deeplink-highlight','mw-v57-deeplink-highlight','mw-v58-deeplink-highlight');
    void card.offsetWidth;
    card.classList.add('mw-v58-deeplink-highlight');
    requestAnimationFrame(()=>card.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'}));
    setTimeout(()=>{if(card.isConnected)card.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'})},180);
    return true;
  }

  let storeOpenPromise=null;
  function openLinkedStore(){
    if(!storeId||typeof window.openStore!=='function')return Promise.resolve();
    if(storeOpenPromise)return storeOpenPromise;
    storeOpenPromise=Promise.resolve(window.openStore('',storeId)).catch(err=>{console.warn('V58 deep-link store open failed',err);storeOpenPromise=null});
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
