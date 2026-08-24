/* MESHWAR_VENDOR_UX_REALTIME_V28 */
(function(){
  'use strict';

  const VERSION='20260824-v28-ux-realtime1';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const ACTIVE_TAB_KEY='meshwar_vendor_active_tab';
  const STORE_KEY='meshwar_vendor_store';
  let realtimeClient=null,realtimeChannel=null,realtimeRetryTimer=null,realtimeRefreshTimer=null;

  function currentStore(win){
    try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}
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
    win.saveProduct=async function(...args){
      const activeId=win.document.querySelector('.vendor-main-tab.active')?.id||'';
      const shouldKeepProducts=activeId==='vendorTabBtn-products'||Boolean(win.document.getElementById('productModal')?.classList.contains('flex'));
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
    realtimeChannel=null;
  }

  async function startRealtime(win){
    const store=currentStore(win);
    if(!store?.id)return;
    await stopRealtime();
    try{
      const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      realtimeClient=realtimeClient||mod.createClient(SB_URL,SB_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const storeId=String(store.id);
      realtimeChannel=realtimeClient.channel('vendor-orders-v28-'+storeId)
        .on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>scheduleOrdersRefresh(win))
        .subscribe(status=>{
          if(status==='SUBSCRIBED')return;
          if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
            console.warn('Vendor V28 realtime status:',status);
            clearTimeout(realtimeRetryTimer);
            realtimeRetryTimer=setTimeout(()=>startRealtime(win).catch(err=>console.warn('Vendor V28 realtime retry failed',err)),1500);
          }
        });
    }catch(err){
      console.error('Vendor V28 realtime bootstrap failed',err);
      clearTimeout(realtimeRetryTimer);
      realtimeRetryTimer=setTimeout(()=>startRealtime(win).catch(()=>{}),2500);
    }
  }

  function install(frame){
    if(!frame?.contentWindow)return;
    const win=frame.contentWindow;
    try{installSaveTabGuard(win)}catch(err){console.error('Vendor V28 save-tab guard failed',err)}
    showFrame(frame);
    startRealtime(win).catch(err=>console.error('Vendor V28 realtime install failed',err));
    win.addEventListener('focus',()=>scheduleOrdersRefresh(win));
    win.document.addEventListener('visibilitychange',()=>{if(win.document.visibilityState==='visible')scheduleOrdersRefresh(win)});
  }

  window.addEventListener('beforeunload',()=>{stopRealtime().catch(()=>{})});
  window.MeshwarVendorUxRealtimeV28={install,VERSION};
})();
