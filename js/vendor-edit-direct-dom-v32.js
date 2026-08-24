/* MESHWAR_VENDOR_EDIT_DIRECT_DOM_V32 */
(function(){
  'use strict';
  const VERSION='20260824-v32-direct-dom1';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function parseObject(value){if(!value)return{};if(typeof value==='object'&&!Array.isArray(value))return value;try{const x=JSON.parse(value);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return{}}}
  function list(value){if(Array.isArray(value))return value.map(x=>String(x??'').trim()).filter(Boolean);if(typeof value==='string')return value.split(',').map(x=>x.trim()).filter(Boolean);return[]}
  function firstList(...values){for(const value of values){const x=list(value);if(x.length)return x}return[]}
  function storeId(win){try{return String(JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')?.id||'').trim()}catch{return''}}
  async function fetchProduct(win,id){const sid=storeId(win);if(!sid||!id)return null;const url=`${SB_URL}/rest/v1/local_products?select=*&id=eq.${encodeURIComponent(id)}&store_id=eq.${encodeURIComponent(sid)}&limit=1`;const r=await win.fetch(url,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,Accept:'application/json'}});if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);const rows=await r.json();return Array.isArray(rows)?rows[0]||null:null}
  function setValue(d,id,value){const el=d.getElementById(id);if(!el)return false;el.value=value==null?'':String(value);el.dispatchEvent(new Event('input',{bubbles:true}));return true}
  async function hydrate(win,productId){
    const id=String(productId||'').trim();if(!id)return false;
    const product=await fetchProduct(win,id);if(!product)return false;
    const options=parseObject(product.options),dimensions=parseObject(product.dimensions),nested=parseObject(options.dimensions);
    const detailed=String(product.detailed_description??options.detailed_description??nested.detailed_description??'');
    const colors=firstList(options.colors,product.colors,dimensions.colors,nested.colors);
    const sizes=firstList(options.sizes,product.sizes,product.size,dimensions.sizes,dimensions.size,nested.sizes,nested.size);
    const volumes=firstList(options.volumes,product.volumes,product.volume,dimensions.volumes,dimensions.volume,nested.volumes,nested.volume);
    for(let attempt=0;attempt<12;attempt++){
      try{win.MeshwarDetailedDescriptionV8?.ensureField?.()}catch{}
      const d=win.document;
      const modal=d.getElementById('productModal');
      if(modal&&!modal.classList.contains('hidden')){
        const okDetailed=setValue(d,'productDetailedDescription',detailed);
        const okColors=setValue(d,'productColors',colors.join(', '));
        const okSizes=setValue(d,'productSizes',sizes.join(', '));
        const okVolumes=setValue(d,'productVolumes',volumes.join(', '));
        if(okDetailed&&okColors&&okSizes&&okVolumes){win.__mwVendorDirectDomV32Last={id,detailed:detailed.length,colors:colors.length,sizes:sizes.length,volumes:volumes.length,attempt,at:Date.now()};return true}
      }
      await sleep(50);
    }
    console.warn('Vendor V32 direct DOM hydration could not resolve all edit fields',id);return false;
  }
  function install(win){
    if(!win||win.__mwVendorDirectDomV32Bound)return;
    win.document.addEventListener('click',event=>{
      const btn=event.target?.closest?.('button[onclick^="editProduct("]');if(!btn)return;
      const code=String(btn.getAttribute('onclick')||'');const match=code.match(/editProduct\(['\"]([^'\"]+)['\"]\)/);const id=match?.[1];if(!id)return;
      setTimeout(()=>hydrate(win,id).catch(err=>console.error('Vendor V32 direct DOM hydration failed',err)),0);
    },true);
    win.__mwVendorDirectDomV32Bound=true;
  }
  window.MeshwarVendorEditDirectDomV32={install,hydrate,VERSION};
})();
