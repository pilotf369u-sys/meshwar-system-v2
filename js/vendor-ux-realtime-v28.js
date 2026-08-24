/* MESHWAR_VENDOR_UX_REALTIME_V28 */
(function(){
  'use strict';

  const VERSION='20260824-v28-ux-realtime2';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const ACTIVE_TAB_KEY='meshwar_vendor_active_tab';
  const STORE_KEY='meshwar_vendor_store';
  let realtimeClient=null,realtimeChannel=null,realtimeRetryTimer=null,realtimeRefreshTimer=null,realtimeStoreId='';

  function currentStore(win){
    try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}
  }

  function isHidden(el){return !el||el.classList.contains('hidden')||getComputedStyle(el).display==='none'}

  async function waitForResolvedView(frame){
    const win=frame.contentWindow;
    for(let i=0;i<120;i++){
      const d=win?.document,login=d?.getElementById('loginView'),dashboard=d?.getElementById('dashboardView');
      if(login&&dashboard){
        const store=currentStore(win);
        const resolved=store?(!isHidden(dashboard)&&isHidden(login)):(!isHidden(login)&&isHidden(dashboard));
        if(resolved)return true;
      }
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    console.warn('Vendor V28 auth view resolution timed out; revealing current UI safely.');
    return false;
  }

  function showFrame(frame){
    const loader=document.getElementById('vendorBootLoader');
    frame.style.visibility='visible';
    frame.setAttribute('aria-busy','false');
    if(loader){loader.classList.add('vendor-loader-hidden');setTimeout(()=>loader.remove(),220)}
  }

  function preserveProductTab(win){
    try{win.localStorage.setItem(ACTIVE_TAB_KEY,'vendorTabBtn-products')}catch{}
    try{win.setVendorTab?.('products')}catch(err){console.warn('Vendor V28 product tab restore failed',err)}
  }

  function installSaveTabGuard(win){
    if(!win||win.__mwVendorSaveTabGuardV28)return;
    const original=win.saveProduct;
    if(typeof original!=='function')return;
    win.document.addEventListener('click',e=>{
      const save=e.target?.closest?.('button[onclick*="saveProduct"]');
      if(save)preserveProductTab(win);
    },true);
    win.saveProduct=async function(...args){
      const activeId=win.document.querySelector('.vendor-main-tab.active')?.id||'';
      const shouldKeepProducts=activeId==='vendorTabBtn-products'||Boolean(win.document.getElementById('productModal')?.classList.contains('flex'));
      if(shouldKeepProducts)preserveProductTab(win);
      try{return await original.apply(this,args)}
      finally{if(shouldKeepProducts)preserveProductTab(win)}
    };
    win.__mwVendorSaveTabGuardV28=true;
  }

  function scheduleOrdersRefresh(win){
    clearTimeout(realtimeRefreshTimer);
    realtimeRefreshTimer=setTimeout(()=>{
      try{Promise.resolve(win.loadOrders?.()).catch(err=>console.warn('Vendor V28 realtime refresh failed',err))}
      catch(err){console.warn('Vendor V28 realtime refresh failed',err)}
    },120);
  }

  async function stopRealtime(){
    clearTimeout(realtimeRetryTimer);clearTimeout(realtimeRefreshTimer);
    if(realtimeClient&&realtimeChannel){try{await realtimeClient.removeChannel(realtimeChannel)}catch{}}
    realtimeChannel=null;realtimeStoreId='';
  }

  async function startRealtime(win){
    const store=currentStore(win),storeId=String(store?.id||'').trim();
    if(!storeId){await stopRealtime();return}
    if(realtimeChannel&&realtimeStoreId===storeId)return;
    await stopRealtime();
    try{
      const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      realtimeClient=realtimeClient||mod.createClient(SB_URL,SB_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      realtimeStoreId=storeId;
      realtimeChannel=realtimeClient.channel('vendor-orders-v28-'+storeId)
        .on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>scheduleOrdersRefresh(win))
        .subscribe(status=>{
          if(status==='SUBSCRIBED')return;
          if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
            console.warn('Vendor V28 realtime status:',status);
            clearTimeout(realtimeRetryTimer);
            realtimeRetryTimer=setTimeout(()=>{realtimeChannel=null;realtimeStoreId='';startRealtime(win).catch(err=>console.warn('Vendor V28 realtime retry failed',err))},1500);
          }
        });
    }catch(err){
      console.error('Vendor V28 realtime bootstrap failed',err);
      realtimeChannel=null;realtimeStoreId='';
      clearTimeout(realtimeRetryTimer);
      realtimeRetryTimer=setTimeout(()=>startRealtime(win).catch(()=>{}),2500);
    }
  }

  function watchSessionLifecycle(win){
    const dashboard=win.document.getElementById('dashboardView');
    if(!dashboard||win.__mwVendorSessionWatchV28)return;
    let lastStoreId=String(currentStore(win)?.id||'');
    const sync=()=>{
      const storeId=String(currentStore(win)?.id||'');
      if(storeId!==lastStoreId||(!isHidden(dashboard)&&storeId&&(!realtimeChannel||realtimeStoreId!==storeId))){
        lastStoreId=storeId;
        startRealtime(win).catch(err=>console.warn('Vendor V28 session realtime sync failed',err));
      }
    };
    new MutationObserver(sync).observe(dashboard,{attributes:true,attributeFilter:['class']});
    win.addEventListener('focus',()=>{sync();if(currentStore(win)?.id)scheduleOrdersRefresh(win)});
    win.document.addEventListener('visibilitychange',()=>{if(win.document.visibilityState==='visible'){sync();if(currentStore(win)?.id)scheduleOrdersRefresh(win)}});
    win.__mwVendorSessionWatchV28=true;
  }

  async function install(frame){
    if(!frame?.contentWindow)return;
    const win=frame.contentWindow;
    try{installSaveTabGuard(win)}catch(err){console.error('Vendor V28 save-tab guard failed',err)}
    try{watchSessionLifecycle(win)}catch(err){console.error('Vendor V28 session watcher failed',err)}
    await waitForResolvedView(frame);
    showFrame(frame);
    startRealtime(win).catch(err=>console.error('Vendor V28 realtime install failed',err));
  }

  window.addEventListener('beforeunload',()=>{stopRealtime().catch(()=>{})});
  window.MeshwarVendorUxRealtimeV28={install,VERSION};
})();
