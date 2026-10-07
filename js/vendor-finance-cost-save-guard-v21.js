/* MESHWAR_VENDOR_FINANCE_COST_SAVE_GUARD_V21 */
(function(){
  'use strict';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const q=v=>encodeURIComponent(String(v??''));
  function store(win){try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  async function rest(win,path,{method='GET',body=null}={}){
    const r=await win.fetch(`${SB_URL}/rest/v1/${path}`,{method,cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(method!=='GET'?{Prefer:'return=representation'}:{})},body:body==null?null:JSON.stringify(body)});
    const t=await r.text();if(!r.ok)throw new Error(t||`HTTP ${r.status}`);return t?JSON.parse(t):null;
  }
  function snapshot(win){
    const d=win.document,st=store(win),raw=String(d.getElementById('mwProductCostPrice')?.value||'').trim();
    return{storeId:String(st?.id||'').trim(),id:String(d.getElementById('productId')?.value||'').trim(),name:String(d.getElementById('productName')?.value||'').trim(),cost:raw===''?null:Math.max(0,Number(raw)||0)};
  }
  async function resolveId(win,s){
    if(s.id)return s.id;
    const rows=await rest(win,`local_products?select=id&store_id=eq.${q(s.storeId)}&product_name=eq.${q(s.name)}&order=created_at.desc&limit=1`);
    return String((Array.isArray(rows)?rows[0]:null)?.id||'').trim();
  }
  async function persistAfterSuccessfulSave(win,s){
    if(!s.storeId||!s.name)return;
    for(let i=0;i<24;i++){
      await sleep(i?125:180);
      const modal=win.document.getElementById('productModal');
      if(modal&&!modal.classList.contains('hidden'))continue;
      const id=await resolveId(win,s).catch(()=> '');
      if(!id)continue;
      try{
        await rest(win,`local_products?id=eq.${q(id)}&store_id=eq.${q(s.storeId)}`,{method:'PATCH',body:{cost_price:s.cost}});
        win.__mwFinanceCostGuardLast={id,cost:s.cost,at:Date.now()};
        try{win.MeshwarVendorFinanceV21?.refresh?.(win,true)}catch{}
        return;
      }catch(e){if(i===23)console.warn('V21 cost save guard failed',e)}
    }
  }
  function install(win){
    if(!win||win.__mwFinanceCostSaveGuardV21)return;
    win.document.addEventListener('click',e=>{
      const btn=e.target?.closest?.('button[onclick*="saveProduct"]');if(!btn)return;
      const s=snapshot(win);persistAfterSuccessfulSave(win,s).catch(err=>console.warn('V21 cost save guard skipped',err));
    },true);
    win.__mwFinanceCostSaveGuardV21=true;
  }
  window.MeshwarVendorFinanceCostSaveGuardV21={install};
})();
