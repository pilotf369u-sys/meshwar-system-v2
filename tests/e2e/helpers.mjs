export const STORE={id:'store-e2e-1',store_name:'MeshWar E2E Store',specialty:'Testing',governorate:'Baghdad',commission_rate:10,exchange_rate:1,exchange_target_currency:'USD',default_currency:'USD',profit_margin_percent:25,logo_url:''};

export function fixtureDb(){
  const products=Array.from({length:23},(_,i)=>({id:`p-${i+1}`,store_id:STORE.id,product_name:`Test Product ${String(i+1).padStart(2,'0')}`,description:`E2E product ${i+1}`,base_price:10+i,discount_price:null,currency:'USD',stock_quantity:20+i,low_stock_threshold:3,is_out_of_stock:false,barcode:`900000${String(i+1).padStart(2,'0')}`,category_id:i<12?'sub-a':'sub-b',subcategory_id:i<12?'sub-a':'sub-b',options:{colors:[],sizes:[],volumes:[]},created_at:new Date(Date.UTC(2026,7,22,12,0,i)).toISOString(),updated_at:new Date().toISOString()}));
  const categories=[
    {id:'cat-a',store_id:STORE.id,parent_id:null,name:'Main A',slug:'main-a',sort_order:1,is_visible:true},
    {id:'sub-a',store_id:STORE.id,parent_id:'cat-a',name:'Sub A',slug:'sub-a',sort_order:1,is_visible:true},
    {id:'cat-b',store_id:STORE.id,parent_id:null,name:'Main B',slug:'main-b',sort_order:2,is_visible:true},
    {id:'sub-b',store_id:STORE.id,parent_id:'cat-b',name:'Sub B',slug:'sub-b',sort_order:1,is_visible:true},
    ...Array.from({length:19},(_,i)=>({id:`cat-${i+3}`,store_id:STORE.id,parent_id:null,name:`Main ${i+3}`,slug:`main-${i+3}`,sort_order:i+3,is_visible:true}))
  ];
  const mk=(id,code,status,total,details)=>({id,order_code:code,status,total_price:total,currency:'USD',created_at:new Date().toISOString(),details:{source:'local_store',store_id:STORE.id,product_name:'Test Product 01',quantity:2,parcels_count:1,city:'Baghdad',...details}});
  const orders=[
    mk('o-pending','MW-5664','بانتظار الموافقة',120,{commission_rate:10,vendor_payment_status:'pending'}),
    mk('o-delivery','MW-5665','قيد التوصيل',80,{commission_rate:10,vendor_payment_status:'pending'}),
    mk('o-paid','MW-5666','تم التسليم',100,{commission_rate:10,vendor_other_deductions:5,vendor_payment_status:'paid'}),
    mk('o-unpaid','MW-5667','تم التسليم',200,{commission_rate:15,vendor_other_deductions:10,vendor_payment_status:'pending'}),
    mk('o-return','MW-5668','مرتجع',75,{commission_rate:10,vendor_payment_status:'pending'}),
    mk('o-cancel','MW-5669','ملغي من قبل العميل',55,{commission_rate:10,vendor_payment_status:'pending'})
  ];
  for(let i=0;i<9;i++)orders.push(mk(`o-extra-${i}`,`MW-${5700+i}`,'بانتظار الموافقة',25+i,{commission_rate:10,vendor_payment_status:'pending',product_name:`Extra Product ${i+1}`}));
  return{local_products:products,orders,store_categories:categories,vendor_operating_expenses:[]};
}

const mockSupabaseModule=String.raw`
export function createClient(){
  const db=globalThis.__MESH_E2E_DB;
  const matches=(row,filters)=>filters.every(([k,v])=>String(row?.[k]??'')===String(v));
  class Query{
    constructor(table){this.table=table;this.filters=[];this.mode='select';this.payload=null;this.max=null;this.orderBy=null;}
    select(){return this} eq(k,v){this.filters.push([k,v]);return this} order(k,{ascending=true}={}){this.orderBy=[k,ascending];return this} limit(n){this.max=Number(n);return this}
    insert(rows){this.mode='insert';this.payload=Array.isArray(rows)?rows:[rows];return this} update(payload){this.mode='update';this.payload=payload;return this} delete(){this.mode='delete';return this}
    async exec(){
      const rows=db[this.table]||(db[this.table]=[]);
      if(this.mode==='insert'){const now=new Date().toISOString();const added=this.payload.map((r,i)=>({...r,id:r.id||'e2e-'+Date.now()+'-'+i,created_at:r.created_at||now,updated_at:r.updated_at||now}));rows.push(...added);return{data:added,error:null};}
      const selected=rows.filter(r=>matches(r,this.filters));
      if(this.mode==='update'){selected.forEach(r=>Object.assign(r,this.payload));return{data:selected,error:null};}
      if(this.mode==='delete'){for(let i=rows.length-1;i>=0;i--)if(matches(rows[i],this.filters))rows.splice(i,1);return{data:selected,error:null};}
      let out=[...selected];if(this.orderBy){const[k,asc]=this.orderBy;out.sort((a,b)=>String(a?.[k]??'').localeCompare(String(b?.[k]??''))*(asc?1:-1));}if(Number.isFinite(this.max))out=out.slice(0,this.max);return{data:out,error:null};
    }
    then(resolve,reject){return this.exec().then(resolve,reject)}
  }
  return{from:table=>new Query(table),rpc:async(name,args)=>name==='vendor_login'?{data:globalThis.__MESH_E2E_STORE,error:null}:{data:{ok:true,args},error:null},storage:{from:()=>({upload:async()=>({error:null}),getPublicUrl:()=>({data:{publicUrl:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='}})})},channel:()=>({on(){return this},subscribe(){return this}}),removeChannel:async()=>{}};
}
`;

function initBrowserFixture({db,store}){
  const root=window.top||window;
  if(!root.__MESH_E2E_SHARED_DB)root.__MESH_E2E_SHARED_DB=JSON.parse(JSON.stringify(db));
  if(!root.__MESH_E2E_SHARED_STORE)root.__MESH_E2E_SHARED_STORE=JSON.parse(JSON.stringify(store));
  window.__MESH_E2E_DB=root.__MESH_E2E_SHARED_DB;
  window.__MESH_E2E_STORE=root.__MESH_E2E_SHARED_STORE;
  try{sessionStorage.setItem('meshwar_vendor_store',JSON.stringify(window.__MESH_E2E_STORE))}catch{}
  const nativeFetch=window.fetch.bind(window),SB='https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/';
  const applyFilters=(rows,sp)=>{
    let out=[...rows];
    for(const[k,v]of sp.entries()){
      if(['select','order','limit'].includes(k))continue;
      if(v.startsWith('eq.'))out=out.filter(r=>String(r?.[k]??'')===decodeURIComponent(v.slice(3)));
      else if(v.startsWith('ilike.')){const needle=decodeURIComponent(v.slice(6)).replaceAll('%','').toLowerCase();out=out.filter(r=>String(r?.[k]??'').toLowerCase().includes(needle));}
    }
    const order=sp.get('order');if(order){const[k,dir]=order.split('.');out.sort((a,b)=>String(a?.[k]??'').localeCompare(String(b?.[k]??''))*(dir==='desc'?-1:1));}
    const lim=Number(sp.get('limit'));if(Number.isFinite(lim)&&lim>0)out=out.slice(0,lim);return out;
  };
  window.fetch=async(input,init={})=>{
    const url=typeof input==='string'?input:String(input?.url||'');if(!url.startsWith(SB))return nativeFetch(input,init);
    const u=new URL(url),table=u.pathname.split('/').pop(),method=String(init.method||'GET').toUpperCase();
    if(table==='vendor_get_profit_margin'&&method==='POST')return new Response(JSON.stringify(window.__MESH_E2E_STORE.profit_margin_percent??null),{status:200,headers:{'content-type':'application/json'}});
    if(table==='vendor_set_profit_margin'&&method==='POST'){
      const body=JSON.parse(init.body||'{}'),margin=Number(body.p_margin);window.__MESH_E2E_STORE.profit_margin_percent=margin;
      try{sessionStorage.setItem('meshwar_vendor_store',JSON.stringify(window.__MESH_E2E_STORE))}catch{}
      return new Response(JSON.stringify(margin),{status:200,headers:{'content-type':'application/json'}});
    }
    if(table==='vendor_get_operating_expenses'&&method==='POST'){
      const body=JSON.parse(init.body||'{}'),sid=String(body.p_store_id||'').trim();
      const expenses=(window.__MESH_E2E_DB.vendor_operating_expenses||[]).filter(x=>String(x.store_id)===sid).sort((a,b)=>String(b.expense_date||'').localeCompare(String(a.expense_date||''))||String(b.created_at||'').localeCompare(String(a.created_at||'')));
      return new Response(JSON.stringify(expenses),{status:200,headers:{'content-type':'application/json'}});
    }
    if(table==='vendor_add_operating_expense'&&method==='POST'){
      const body=JSON.parse(init.body||'{}'),rows=window.__MESH_E2E_DB.vendor_operating_expenses||(window.__MESH_E2E_DB.vendor_operating_expenses=[]),now=new Date().toISOString();
      const row={id:'rpc-'+Date.now(),store_id:String(body.p_store_id||''),amount:Number(body.p_amount),currency:body.p_currency||null,category:body.p_category||'تشغيلي',note:body.p_note||null,expense_date:body.p_expense_date||now.slice(0,10),created_at:now,updated_at:now};rows.push(row);
      return new Response(JSON.stringify(row),{status:200,headers:{'content-type':'application/json'}});
    }
    const rows=window.__MESH_E2E_DB[table]||(window.__MESH_E2E_DB[table]=[]);let selected=applyFilters(rows,u.searchParams);
    if(method==='PATCH'){const body=JSON.parse(init.body||'{}');selected.forEach(r=>Object.assign(r,body));return new Response(JSON.stringify(selected),{status:200,headers:{'content-type':'application/json'}})}
    if(method==='POST'){let body=JSON.parse(init.body||'[]');body=Array.isArray(body)?body:[body];const now=new Date().toISOString();body=body.map((r,i)=>({...r,id:r.id||'rest-'+Date.now()+'-'+i,created_at:r.created_at||now,updated_at:r.updated_at||now}));rows.push(...body);return new Response(JSON.stringify(body),{status:201,headers:{'content-type':'application/json'}})}
    if(method==='DELETE'){for(let i=rows.length-1;i>=0;i--)if(selected.includes(rows[i]))rows.splice(i,1);return new Response('[]',{status:200,headers:{'content-type':'application/json'}})}
    const select=u.searchParams.get('select');if(select&&select!=='*'){const keys=select.split(',');selected=selected.map(r=>Object.fromEntries(keys.map(k=>[k,r?.[k]])))}
    return new Response(JSON.stringify(selected),{status:200,headers:{'content-type':'application/json'}});
  };
}

export async function installMocks(page){
  const db=fixtureDb();await page.context().addInitScript(initBrowserFixture,{db,store:STORE});
  await page.context().route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',r=>r.fulfill({status:200,contentType:'text/javascript',body:mockSupabaseModule}));
  await page.context().route('https://cdn.tailwindcss.com/**',r=>r.fulfill({status:200,contentType:'text/javascript',body:"window.tailwind={config:{}};document.head.insertAdjacentHTML('beforeend','<style>.hidden{display:none!important}.flex{display:flex!important}</style>');"}));
  await page.context().route('https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:"window.Html5Qrcode=class{constructor(id){this.id=id}async start(camera,config,ok){window.__E2E_CAMERA_START={camera,config};window.__E2E_CAMERA_OK=ok}async stop(){}async clear(){}};"}));
  await page.context().route('https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',r=>r.fulfill({status:200,contentType:'text/javascript',body:"window.JsBarcode=function(){return true};window.print=function(){};"}));return db;
}

export async function openVendor(page){
  await page.goto('/vendor-dashboard.html');
  const frame=page.frameLocator('#vendorFrame');
  await frame.locator('#dashboardView').waitFor({state:'visible'});
  await frame.locator('#vendorOrderSmartSearch').waitFor();
  await frame.locator('#vendorTabBtn-categories').waitFor();
  for(let i=0;i<120;i++){
    const ready=await frameWindow(page,()=>Boolean(
      window.MeshwarVendorBarcodeMarginV22&&
      document.getElementById('vendorSmartProductSearch')?.__mwV22Search&&
      window.__mwV22BarcodeSaveGuard&&
      window.__mwFinanceCostSaveGuardV21&&
      window.MeshwarTaxonomyPersistenceV10&&
      window.saveProduct?.__mwTaxonomyV10&&
      window.saveProduct?.__mwFinanceV21
    )).catch(()=>false);
    if(ready)return frame;
    await page.waitForTimeout(50);
  }
  throw new Error('Vendor catalog layers did not become ready for E2E');
}

export async function frameWindow(page,fn,arg){
  let last;
  for(let i=0;i<30;i++){
    const frame=page.frames().find(f=>f.url().includes('vendor-dashboard-v2.html'));
    if(frame)try{return await frame.evaluate(fn,arg)}catch(e){last=e;if(!/Execution context was destroyed|Frame was detached|Target page, context or browser has been closed/i.test(String(e)))throw e}
    await page.waitForTimeout(100);
  }
  throw last||new Error('vendor iframe not found');
}
