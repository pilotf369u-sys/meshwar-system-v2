import {test,expect} from '@playwright/test';
const cid='00000000-0000-4000-8000-000000000001',sid='00000000-0000-4000-8000-000000000002',pid='00000000-0000-4000-8000-000000000003';
const store={id:sid,store_name:'Cart Test Store',status:'active',is_active:true,commission_rate:0,exchange_rate:1,default_currency:'IQD'};
const product={id:pid,store_id:sid,product_name:'Cart test product',base_price:100,currency:'IQD',stock_quantity:10,is_out_of_stock:false,options:{colors:[],sizes:[],volumes:[]},description:'test'};
for(const legacy of ['missing','viewing','stale','canonical'])test(`saved-session cart recovers ${legacy} legacy identity through full store modal`,async({page})=>{
 const errors=[],requests=[];let items=[],revision=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='warning'||m.type()==='error')errors.push(m.text())});page.on('dialog',async d=>{errors.push('DIALOG: '+d.message());await d.accept()});
 await page.addInitScript(({cid,legacy})=>{if(legacy==='viewing')localStorage.setItem('viewingCustomerId',cid);if(legacy==='canonical')localStorage.setItem('meshwar_customer_id',cid);if(legacy==='stale')localStorage.setItem('meshwar_customer_id','00000000-0000-4000-8000-000000000099');const s=JSON.stringify({token:'cart-test-session',expiresAt:'2099-01-01'});sessionStorage.setItem('kinto_customer_review_session_v132',s);localStorage.setItem('kinto_customer_session_v150',s)},{cid,legacy});
 await page.route('**/*',async route=>{
  const url=route.request().url();if(url.startsWith('http://127.0.0.1:4173'))return route.continue();
  if(url.includes('@supabase/supabase-js@2/+esm'))return route.fulfill({contentType:'text/javascript',body:`export function createClient(){class Q{constructor(t){this.t=t}select(){return this}eq(){return this}in(){return this}order(){return this}limit(){return this}range(){return this}maybeSingle(){this.single=true;return this}single(){this.one=true;return this}then(a,b){let rows=this.t==='kinto_local_stores_public_v1'?[${JSON.stringify(store)}]:this.t==='local_products'?[${JSON.stringify(product)}]:[];return Promise.resolve({data:this.single||this.one?rows[0]||null:rows,count:rows.length,error:null}).then(a,b)}}return {from:t=>new Q(t),rpc:async()=>({data:{}}),auth:{getSession:async()=>({data:{session:null}})},channel:()=>({on(){return this},subscribe(){return this}})}}`});
  if(url.startsWith('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/')){
   const path=new URL(url).pathname.split('/').pop();requests.push(path);let data=[];
   if(path.startsWith('customer_cart_')){const args=route.request().postDataJSON();expect(args.p_customer_id).toBe(cid);expect(args.p_session_token).toBe('cart-test-session');}
   if(path==='customer_session_identity_v150')data={ok:true,customer:{id:cid,name:'Cart customer'}};
   else if(path==='customer_cart_get_v189')data={items,revision};
   else if(path==='customer_cart_put_v189'){const b=route.request().postDataJSON();expect(b.p_expected_revision).toBe(revision);items=b.p_items;revision++;data={items,revision};}
   else if(path==='kinto_local_stores_public_v1')data=[store];else if(path==='local_products')data=[product];
   else if(path==='kinto_customer_directory_session_v1')data={rows:[{id:cid,name:'Cart customer'}],count:1};
   else if(path==='customer_favorites_get_v146')data={lists:[]};
   return route.fulfill({json:data});
  }
  return route.abort();
 });
 await page.goto('/store.html?storeId='+sid);
 await page.waitForFunction(()=>window.KintoLocalCartV93);
 await expect(page.locator('#kintoLocalCartCheckout')).toHaveText('إنشاء الطلبات المستقلة');
 await page.locator('.local-v3-name').first().click();
 await expect(page.locator('#kintoProductModalV145')).toHaveClass(/open/);
 await page.locator('.kinto-detail-add').click();
 await expect.poll(()=>items.length).toBe(1);
 expect(requests).toContain('customer_session_identity_v150');expect(errors.filter(x=>x.startsWith('DIALOG:'))).toEqual([]);
 expect(await page.evaluate(()=>KintoLocalCartV93.getScope().userId)).toBe(cid);
 await page.locator('[data-cart-action=plus]').click();await expect.poll(()=>items[0]?.quantity).toBe(2);
 await page.reload();await expect(page.locator('#kintoLocalCartBody')).toContainText('Cart test product');
 await page.locator('#kintoLocalCartTrigger').click();await page.locator('[data-cart-action=remove]').click();await expect.poll(()=>items.length).toBe(0);
});

for(const session of ['missing','expired','invalid'])test(`cart keeps ${session} sessions blocked with a useful message`,async({page})=>{
 const dialogs=[],requests=[],warnings=[];
 page.on('dialog',async d=>{dialogs.push(d.message());await d.accept()});page.on('console',m=>warnings.push(m.text()));
 await page.addInitScript(({cid,session})=>{localStorage.setItem('meshwar_customer_id',cid);if(session!=='missing')sessionStorage.setItem('kinto_customer_review_session_v132',JSON.stringify({token:'invalid-session',expiresAt:session==='expired'?'2000-01-01':'2099-01-01'}))},{cid,session});
 await page.route('**/cart-auth-fixture',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><body><script src="/js/customer-session-v150.js"></script><script src="/js/local-cart-v93.js"></script></body>'}));
 await page.route('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/**',r=>{requests.push(new URL(r.request().url()).pathname.split('/').pop());return r.fulfill({status:403,json:{message:'CUSTOMER_SESSION_INVALID'}})});
 await page.goto('/cart-auth-fixture');await page.waitForFunction(()=>window.KintoLocalCartV93);
 if(session==='invalid')await expect.poll(()=>warnings.some(x=>x.includes('cart identity initialization failed'))).toBe(true);
 await page.evaluate(({sid,pid,product})=>KintoLocalCartV93.add({store_id:sid,product_id:pid,product_name:'Blocked product',quantity:1,unit_price_local:100,stock_product:product}),{sid,pid,product});
 expect(dialogs.join(' ')).toContain('جلسة');expect(requests).not.toContain('customer_cart_put_v189');expect(requests).not.toContain('customer_cart_get_v189');expect(await page.evaluate(()=>KintoLocalCartV93.getCount())).toBe(0);
});
