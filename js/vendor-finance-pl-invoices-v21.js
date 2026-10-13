/* MESHWAR_VENDOR_FINANCE_PL_INVOICES_V21 */
(function(){
  'use strict';
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co';
  const SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const STORE_KEY='meshwar_vendor_store';
  const VERSION='20260822-2316';

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
  const money=(v,c='')=>`${num(v).toLocaleString('en-US',{maximumFractionDigits:2})} ${c||''}`.trim();
  const q=v=>encodeURIComponent(String(v??''));
  function store(win){try{return JSON.parse(win.sessionStorage.getItem(STORE_KEY)||'null')}catch{return null}}
  function orderStoreId(o){return String(o?.details?.store_id||o?.store_id||'').trim()}
  function productName(o){return String(o?.details?.product_name||o?.product_name||'').trim()}
  function quantity(o){return Math.max(1,num(o?.details?.quantity||o?.quantity||1))}
  function isDelivered(o){const s=String(o?.status||'').trim().toLowerCase();return s==='تم التسليم'||s==='delivered'||s==='delivered_to_customer'}

  async function rest(win,path,{method='GET',body=null,prefer='return=representation'}={}){
    const r=await win.fetch(`${SB_URL}/rest/v1/${path}`,{
      method,cache:'no-store',
      headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`,'Content-Type':'application/json',Accept:'application/json',...(method!=='GET'?{Prefer:prefer}:{})},
      body:body==null?null:JSON.stringify(body)
    });
    const t=await r.text();if(!r.ok)throw new Error(t||`HTTP ${r.status}`);return t?JSON.parse(t):null;
  }

  function injectStyles(win){
    if(win.document.getElementById('mwFinanceV21Styles'))return;
    const s=win.document.createElement('style');s.id='mwFinanceV21Styles';s.textContent=`
      #vendorTab-pl .mw-pl-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.75rem;margin:1rem 0}
      #vendorTab-pl .mw-pl-card{border:1px solid rgba(212,175,55,.22);border-radius:1rem;padding:1rem;background:rgba(15,23,42,.5)}
      .light #vendorTab-pl .mw-pl-card{background:#f3f4f6;border-color:#d1d5db;color:#0f172a}
      #vendorTab-pl .mw-pl-label{font-size:.72rem;color:#94a3b8;font-weight:800} .light #vendorTab-pl .mw-pl-label{color:#475569}
      #vendorTab-pl .mw-pl-value{margin-top:.35rem;font-size:1.08rem;font-weight:900}
      #vendorTab-pl .mw-pl-warning{border:1px solid rgba(245,158,11,.28);background:rgba(245,158,11,.10);color:#fbbf24;border-radius:.8rem;padding:.65rem .8rem;font-size:.75rem;font-weight:800}
      .light #vendorTab-pl .mw-pl-warning{color:#92400e;background:#fef3c7;border-color:#f59e0b}
      #mwProductCostPrice{direction:ltr;text-align:left}
      .mw-pl-table{width:100%;border-collapse:collapse}.mw-pl-table th,.mw-pl-table td{padding:.65rem;border-bottom:1px solid rgba(148,163,184,.16);text-align:center;font-size:.78rem}
      .mw-pl-action{border:1px solid rgba(212,175,55,.45);background:rgba(212,175,55,.14);color:#f8d66d;border-radius:.7rem;padding:.42rem .65rem;font-weight:900;cursor:pointer}
      .light .mw-pl-action{background:#d4af37;color:#111827;border-color:#9a7b17}
      @media(max-width:950px){#vendorTab-pl .mw-pl-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.mw-pl-table{display:block;overflow:auto;white-space:nowrap}}
    `;win.document.head.appendChild(s);
  }

  function injectCostField(win){
    const d=win.document;if(d.getElementById('mwProductCostPrice'))return;
    const base=d.getElementById('productBasePrice');if(!base)return;
    const input=d.createElement('input');input.id='mwProductCostPrice';input.className='field';input.type='number';input.min='0';input.step='0.01';input.placeholder='سعر التكلفة (اختياري)';input.setAttribute('aria-label','سعر التكلفة');
    base.insertAdjacentElement('afterend',input);
  }

  async function resolveProductId(win,{id,name,storeId}){
    if(id)return id;if(!name||!storeId)return'';
    const rows=await rest(win,`local_products?select=id&store_id=eq.${q(storeId)}&product_name=eq.${q(name)}&order=created_at.desc&limit=1`);
    return String((Array.isArray(rows)?rows[0]:null)?.id||'').trim();
  }
  async function persistCost(win,{id,name,storeId,cost}){
    const productId=await resolveProductId(win,{id,name,storeId});if(!productId)return;
    await rest(win,`local_products?id=eq.${q(productId)}&store_id=eq.${q(storeId)}`,{method:'PATCH',body:{cost_price:cost}});
  }
  async function hydrateCost(win,id){
    const st=store(win);if(!st?.id||!id)return;
    try{const rows=await rest(win,`local_products?select=id,cost_price&id=eq.${q(id)}&store_id=eq.${q(st.id)}&limit=1`);const p=Array.isArray(rows)?rows[0]:null;const el=win.document.getElementById('mwProductCostPrice');if(el)el.value=p?.cost_price==null?'':String(p.cost_price)}catch(e){console.warn('V21 cost hydrate failed',e)}
  }

  function wrapProductFunctions(win){
    injectCostField(win);
    const open=win.openProductModal;
    if(typeof open==='function'&&!open.__mwFinanceV21){
      const wrapped=function(){const r=open.apply(this,arguments);setTimeout(()=>{const el=win.document.getElementById('mwProductCostPrice');if(el&&!win.document.getElementById('productId')?.value)el.value=''},0);return r};
      wrapped.__mwFinanceV21=true;wrapped.__mwTaxonomyV10=open.__mwTaxonomyV10;wrapped.__mwBarcode=open.__mwBarcode;win.openProductModal=wrapped;
    }
    const edit=win.editProduct;
    if(typeof edit==='function'&&!edit.__mwFinanceV21){
      const wrapped=function(id){const r=edit.apply(this,arguments);setTimeout(()=>hydrateCost(win,id),0);setTimeout(()=>hydrateCost(win,id),180);return r};
      wrapped.__mwFinanceV21=true;wrapped.__mwTaxonomyV10=edit.__mwTaxonomyV10;wrapped.__mwBarcode=edit.__mwBarcode;win.editProduct=wrapped;
    }
    const save=win.saveProduct;
    if(typeof save==='function'&&!save.__mwFinanceV21){
      const wrapped=async function(){
        const st=store(win),id=String(win.document.getElementById('productId')?.value||'').trim(),name=String(win.document.getElementById('productName')?.value||'').trim();
        const raw=String(win.document.getElementById('mwProductCostPrice')?.value||'').trim();const cost=raw===''?null:Math.max(0,num(raw));
        const r=await save.apply(this,arguments);
        if(st?.id&&name){try{await persistCost(win,{id,name,storeId:String(st.id),cost});scheduleRefresh(win)}catch(e){console.error('V21 cost persistence failed',e);win.alert?.('تم حفظ المنتج، لكن تعذر حفظ سعر التكلفة: '+(e?.message||e))}}
        return r;
      };
      wrapped.__mwFinanceV21=true;wrapped.__mwTaxonomyV10=save.__mwTaxonomyV10;win.saveProduct=wrapped;
    }
  }


  // Product cost editing remains independent from profit reporting.
  function scheduleRefresh(win){const api=window.KintoVendorProfitV164;if(win.document.getElementById('vendorTab-pl')?.classList.contains('active'))api?.refresh(win)}
  function install(win){
    if(!win||win.__mwFinanceV21Installed)return;
    const boot=()=>{
      injectCostField(win);wrapProductFunctions(win);
      if(!win.__mwFinanceV21WrapTimer)win.__mwFinanceV21WrapTimer=setInterval(()=>{injectCostField(win);wrapProductFunctions(win)},120);
      win.__mwFinanceV21Installed=true;
    };
    if(win.document.readyState==='loading')win.document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
  }
  window.MeshwarVendorFinanceV21={install,refresh:win=>window.KintoVendorProfitV164?.refresh(win),version:'20261010-cost-editor-only'};
})();
