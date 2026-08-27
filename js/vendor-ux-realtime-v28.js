/* MESHWAR_VENDOR_UX_REALTIME_V28 */
(function(){
  'use strict';

  const VERSION='20260827-v32-realtime-raceguard';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const ACTIVE_TAB_KEY='meshwar_vendor_active_tab';
  const STORE_KEY='meshwar_vendor_store';
  const SAVE_LOADER_ID='vendorSaveLoaderV29';
  let realtimeClient=null,realtimeChannel=null,realtimeRetryTimer=null,realtimeRefreshTimer=null,realtimeStoreId='',realtimeStartPromise=null,realtimeGeneration=0;

  function currentStore(win){try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  function isHidden(el){return !el||el.classList.contains('hidden')||getComputedStyle(el).display==='none'}

  async function waitForResolvedView(frame){
    const win=frame.contentWindow;
    for(let i=0;i<120;i++){
      const d=win?.document,login=d?.getElementById('loginView'),dashboard=d?.getElementById('dashboardView');
      if(login&&dashboard){const store=currentStore(win);const resolved=store?(!isHidden(dashboard)&&isHidden(login)):(!isHidden(login)&&isHidden(dashboard));if(resolved)return true}
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    console.warn('Vendor V32 auth view resolution timed out; revealing current UI safely.');return false;
  }

  function showFrame(frame){const loader=document.getElementById('vendorBootLoader');frame.style.visibility='visible';frame.setAttribute('aria-busy','false');if(loader){loader.classList.add('vendor-loader-hidden');setTimeout(()=>loader.remove(),220)}}

  function ensureSaveLoader(){
    let loader=document.getElementById(SAVE_LOADER_ID);if(loader)return loader;
    loader=document.createElement('div');loader.id=SAVE_LOADER_ID;loader.setAttribute('role','status');loader.setAttribute('aria-live','polite');loader.style.cssText='position:fixed;inset:0;z-index:10000;display:none;align-items:center;justify-content:center;background:rgba(2,6,23,.38);backdrop-filter:blur(1.5px);-webkit-backdrop-filter:blur(1.5px);color:#e2e8f0;font-family:Tahoma,Arial,sans-serif;';loader.innerHTML='<div style="display:flex;align-items:center;gap:12px;border:1px solid rgba(148,163,184,.2);background:rgba(15,23,42,.92);padding:13px 17px;border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.3)"><span style="width:20px;height:20px;border:2px solid rgba(148,163,184,.25);border-top-color:#38bdf8;border-radius:50%;animation:vendor-save-spin-v29 .7s linear infinite"></span><span style="font-size:13px;font-weight:800">جاري حفظ المنتج...</span></div>';
    const style=document.createElement('style');style.textContent='@keyframes vendor-save-spin-v29{to{transform:rotate(360deg)}}';document.head.appendChild(style);document.body.appendChild(loader);return loader;
  }
  function beginSaveTransition(frame){try{const loader=ensureSaveLoader();frame.setAttribute('aria-busy','true');frame.style.visibility='visible';loader.style.display='flex';loader.dataset.active='1'}catch(err){console.warn('Vendor V32 save transition start failed',err)}}
  function endSaveTransition(frame){try{const loader=document.getElementById(SAVE_LOADER_ID);frame.style.visibility='visible';frame.setAttribute('aria-busy','false');if(loader){loader.style.display='none';loader.dataset.active='0'}}catch(err){console.warn('Vendor V32 save transition end failed',err)}}
  function preserveProductTab(win){try{win.localStorage.setItem(ACTIVE_TAB_KEY,'vendorTabBtn-products')}catch{}try{win.setVendorTab?.('products')}catch(err){console.warn('Vendor V32 product tab restore failed',err)}}

  function installSaveTabGuard(frame,win){
    if(!win||win.__mwVendorSaveTabGuardV29)return;const original=win.saveProduct;if(typeof original!=='function')return;
    win.document.addEventListener('click',e=>{const save=e.target?.closest?.('button[onclick*="saveProduct"]');if(!save)return;preserveProductTab(win);beginSaveTransition(frame)},true);
    win.saveProduct=async function(...args){const activeId=win.document.querySelector('.vendor-main-tab.active')?.id||'';const shouldKeepProducts=activeId==='vendorTabBtn-products'||Boolean(win.document.getElementById('productModal')?.classList.contains('flex'));if(shouldKeepProducts){preserveProductTab(win);beginSaveTransition(frame)}try{return await original.apply(this,args)}finally{if(shouldKeepProducts)preserveProductTab(win);await waitForResolvedView(frame).catch(()=>false);if(shouldKeepProducts)preserveProductTab(frame.contentWindow);endSaveTransition(frame)}};win.__mwVendorSaveTabGuardV29=true;
  }

  function parseObject(value){if(!value)return{};if(typeof value==='object'&&!Array.isArray(value))return value;try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}}
  function asList(value){if(Array.isArray(value))return value.map(v=>String(v??'').trim()).filter(Boolean);if(value==null||value==='')return[];if(typeof value==='string')return value.split(',').map(v=>v.trim()).filter(Boolean);return[]}
  function firstList(...values){for(const value of values){const list=asList(value);if(list.length)return list}return[]}

  async function fetchProductForEdit(win,productId){const store=currentStore(win),storeId=String(store?.id||'').trim(),id=String(productId||'').trim();if(!storeId||!id)return null;const url=`${SB_URL}/rest/v1/local_products?select=*&id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(storeId)}&limit=1`;const response=await win.fetch(url,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});if(!response.ok)throw new Error(await response.text()||`HTTP ${response.status}`);const rows=await response.json();return Array.isArray(rows)?rows[0]||null:null}
  async function waitForEditFields(win){for(let i=0;i<40;i++){try{win.MeshwarDetailedDescriptionV8?.ensureField?.()}catch{}const d=win.document;if(d.getElementById('productSizes')&&d.getElementById('productVolumes')&&d.getElementById('productDetailedDescription'))return true;await new Promise(resolve=>setTimeout(resolve,50))}return false}
  async function populateEditReadFields(win,productId){const id=String(productId||'').trim();if(!id)return;try{const product=await fetchProductForEdit(win,id);if(!product)return;await waitForEditFields(win);const d=win.document,options=parseObject(product.options),dimensions=parseObject(product.dimensions),nestedDimensions=parseObject(options.dimensions);const detailed=String(product.detailed_description??options.detailed_description??nestedDimensions.detailed_description??'').trim();const colors=firstList(options.colors,dimensions.colors,nestedDimensions.colors);const sizes=firstList(options.sizes,dimensions.sizes,dimensions.size,nestedDimensions.sizes,nestedDimensions.size);const volumes=firstList(options.volumes,dimensions.volumes,dimensions.volume,nestedDimensions.volumes,nestedDimensions.volume);const area=d.getElementById('productDetailedDescription'),colorsField=d.getElementById('productColors'),sizesField=d.getElementById('productSizes'),volumesField=d.getElementById('productVolumes');if(area&&detailed)area.value=detailed;if(colorsField&&colors.length)colorsField.value=colors.join(', ');if(sizesField&&sizes.length)sizesField.value=sizes.join(', ');if(volumesField&&volumes.length)volumesField.value=volumes.join(', ');win.__mwVendorEditReadHydrationV31={id,detailed:Boolean(detailed),colors:colors.length,sizes:sizes.length,volumes:volumes.length,at:Date.now()}}catch(err){console.warn('Vendor V32 edit read hydration failed',err)}}
  function installEditReadHydration(win){if(!win||win.__mwVendorEditReadHydrationBoundV31)return;const bind=()=>{const original=win.editProduct;if(typeof original!=='function'||original.__mwEditReadHydrationV31)return false;const wrapped=function(productId,...args){const result=original.call(this,productId,...args);Promise.resolve(result).finally(()=>populateEditReadFields(win,productId));return result};wrapped.__mwEditReadHydrationV31=true;win.editProduct=wrapped;return true};if(!bind()){let tries=0;const timer=setInterval(()=>{if(bind()||++tries>=120)clearInterval(timer)},50)}win.__mwVendorEditReadHydrationBoundV31=true}

  function scheduleOrdersRefresh(win){clearTimeout(realtimeRefreshTimer);realtimeRefreshTimer=setTimeout(()=>{try{Promise.resolve(win.loadOrders?.()).catch(err=>console.warn('Vendor V32 realtime refresh failed',err))}catch(err){console.warn('Vendor V32 realtime refresh failed',err)}},120)}

  async function stopRealtime(){
    realtimeGeneration++;
    clearTimeout(realtimeRetryTimer);clearTimeout(realtimeRefreshTimer);
    const channel=realtimeChannel;realtimeChannel=null;realtimeStoreId='';
    if(realtimeClient&&channel){try{await realtimeClient.removeChannel(channel)}catch{}}
  }

  function queueRealtimeRetry(win,delay=1500){
    clearTimeout(realtimeRetryTimer);
    realtimeRetryTimer=setTimeout(()=>{realtimeChannel=null;realtimeStoreId='';startRealtime(win).catch(err=>console.warn('Vendor V32 realtime retry failed',err))},delay);
  }

  async function startRealtime(win){
    const store=currentStore(win),storeId=String(store?.id||'').trim();
    if(!storeId){await stopRealtime();return}
    if(realtimeChannel&&realtimeStoreId===storeId)return realtimeChannel;
    if(realtimeStartPromise)return realtimeStartPromise;

    realtimeStartPromise=(async()=>{
      const generation=++realtimeGeneration;
      await stopRealtime();
      const myGeneration=++realtimeGeneration;
      try{
        const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
        if(myGeneration!==realtimeGeneration)return null;
        realtimeClient=realtimeClient||mod.createClient(SB_URL,SB_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});

        const channel=realtimeClient.channel('vendor-orders-v32-'+storeId);
        channel.on('postgres_changes',{event:'*',schema:'public',table:'orders'},()=>scheduleOrdersRefresh(win));
        if(myGeneration!==realtimeGeneration){try{await realtimeClient.removeChannel(channel)}catch{}return null}

        realtimeStoreId=storeId;
        realtimeChannel=channel;
        channel.subscribe(status=>{
          if(myGeneration!==realtimeGeneration)return;
          if(status==='SUBSCRIBED')return;
          if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){
            console.warn('Vendor V32 realtime status:',status);
            if(realtimeChannel===channel){realtimeChannel=null;realtimeStoreId=''}
            queueRealtimeRetry(win,1500);
          }
        });
        return channel;
      }catch(err){
        if(myGeneration===realtimeGeneration){console.error('Vendor V32 realtime bootstrap failed',err);realtimeChannel=null;realtimeStoreId='';queueRealtimeRetry(win,2500)}
        return null;
      }
    })();

    try{return await realtimeStartPromise}
    finally{realtimeStartPromise=null}
  }

  function watchSessionLifecycle(win){const dashboard=win.document.getElementById('dashboardView');if(!dashboard||win.__mwVendorSessionWatchV29)return;let lastStoreId=String(currentStore(win)?.id||'');const sync=()=>{const storeId=String(currentStore(win)?.id||'');if(storeId!==lastStoreId||(!isHidden(dashboard)&&storeId&&(!realtimeChannel||realtimeStoreId!==storeId))){lastStoreId=storeId;startRealtime(win).catch(err=>console.warn('Vendor V32 session realtime sync failed',err))}};new MutationObserver(sync).observe(dashboard,{attributes:true,attributeFilter:['class']});win.addEventListener('focus',()=>{sync();if(currentStore(win)?.id)scheduleOrdersRefresh(win)});win.document.addEventListener('visibilitychange',()=>{if(win.document.visibilityState==='visible'){sync();if(currentStore(win)?.id)scheduleOrdersRefresh(win)}});win.__mwVendorSessionWatchV29=true}

  async function install(frame){if(!frame?.contentWindow)return;const win=frame.contentWindow;try{installSaveTabGuard(frame,win)}catch(err){console.error('Vendor V32 save-tab/flash guard failed',err)}try{installEditReadHydration(win)}catch(err){console.error('Vendor V32 edit read hydration install failed',err)}try{watchSessionLifecycle(win)}catch(err){console.error('Vendor V32 session watcher failed',err)}await waitForResolvedView(frame);showFrame(frame);if(document.getElementById(SAVE_LOADER_ID)?.dataset.active==='1'){try{preserveProductTab(win)}catch{}endSaveTransition(frame)}startRealtime(win).catch(err=>console.error('Vendor V32 realtime install failed',err))}

  window.addEventListener('beforeunload',()=>{stopRealtime().catch(()=>{})});
  window.MeshwarVendorUxRealtimeV28={install,VERSION,populateEditReadFields,startRealtime,stopRealtime};
})();
