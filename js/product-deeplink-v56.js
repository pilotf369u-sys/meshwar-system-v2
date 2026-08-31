/* KINTO V57 — deterministic product deep-link navigation + visible gold pulse */
(function(){
  const params=new URLSearchParams(location.search);
  const productId=['productId','product_id','product','pid'].map(k=>params.get(k)).find(v=>String(v||'').trim());
  if(!productId)return;

  const pid=String(productId).trim();
  const storeId=String(params.get('storeId')||params.get('store_id')||'').trim();
  const style=document.createElement('style');
  style.id='mwV57DeepLinkStyle';
  style.textContent=`
    @keyframes mwV57GoldPulse{
      0%,100%{outline-color:rgba(255,208,74,.95);box-shadow:0 0 0 3px rgba(255,208,74,.88),0 0 18px rgba(255,190,35,.42),0 18px 44px rgba(0,0,0,.20);transform:scale(1)}
      50%{outline-color:#ffe48b;box-shadow:0 0 0 10px rgba(255,205,63,.36),0 0 42px rgba(255,190,35,.88),0 24px 58px rgba(0,0,0,.28);transform:scale(1.025)}
    }
    #localStoreProductsGrid .local-v3-card.mw-v57-deeplink-highlight{
      border-color:#ffd34f!important;outline:4px solid #ffd34f!important;outline-offset:4px!important;
      animation:mwV57GoldPulse .78s ease-in-out 8!important;position:relative!important;z-index:30!important;
      scroll-margin-top:130px!important;will-change:transform,box-shadow!important
    }
    @media(prefers-reduced-motion:reduce){#localStoreProductsGrid .local-v3-card.mw-v57-deeplink-highlight{animation:none!important;box-shadow:0 0 0 8px rgba(255,211,79,.55),0 0 34px rgba(255,190,35,.65)!important}}
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

  function allProductCards(){
    return [...document.querySelectorAll('#localStoreProductsGrid .local-v3-card')];
  }
  function cardProductId(card){
    return String(card?.dataset?.productCard||card?.dataset?.pid||card?.dataset?.productId||card?.getAttribute('data-product-id')||'').trim();
  }
  function findCard(){return allProductCards().find(card=>cardProductId(card)===pid)||null}

  let activeCard=null;
  let pulseToken=0;
  function pulseCard(card){
    if(!card)return false;
    showLocalProductSurface();
    if(activeCard&&activeCard!==card)activeCard.classList.remove('mw-v56-deeplink-highlight','mw-v57-deeplink-highlight');
    activeCard=card;
    card.id='product-'+pid;
    card.setAttribute('data-direct-product-focus','true');
    card.setAttribute('data-deeplink-active','true');
    card.classList.remove('mw-v56-deeplink-highlight','mw-v57-deeplink-highlight');
    void card.offsetWidth;
    card.classList.add('mw-v57-deeplink-highlight');
    const token=++pulseToken;
    requestAnimationFrame(()=>card.scrollIntoView({behavior:'auto',block:'center',inline:'nearest'}));
    setTimeout(()=>{if(token===pulseToken&&card.isConnected)card.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'})},180);
    return true;
  }

  let storeOpenPromise=null;
  function openLinkedStore(){
    if(!storeId||typeof window.openStore!=='function')return Promise.resolve();
    if(storeOpenPromise)return storeOpenPromise;
    storeOpenPromise=Promise.resolve(window.openStore('',storeId)).catch(err=>{console.warn('V57 deep-link store open failed',err);storeOpenPromise=null});
    return storeOpenPromise;
  }

  function start(){
    showLocalProductSurface();
    openLinkedStore().finally(()=>{const card=findCard();if(card)pulseCard(card)});

    const root=document.getElementById('localStoreProductsGrid')||document.body;
    const observer=new MutationObserver(()=>{
      showLocalProductSurface();
      const card=findCard();
      if(card&&card!==activeCard)pulseCard(card);
    });
    observer.observe(root,{childList:true,subtree:true});

    const started=Date.now();
    const timer=setInterval(()=>{
      showLocalProductSurface();
      openLinkedStore();
      const card=findCard();
      if(card&&card!==activeCard)pulseCard(card);
      if(Date.now()-started>30000){clearInterval(timer);observer.disconnect()}
    },150);

    window.addEventListener('load',()=>setTimeout(()=>{showLocalProductSurface();openLinkedStore().finally(()=>{const card=findCard();if(card)pulseCard(card)})},220),{once:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
