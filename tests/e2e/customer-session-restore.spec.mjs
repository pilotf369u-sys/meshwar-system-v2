import {test,expect} from '@playwright/test';

const P='kinto_customer_session_v150';
async function setup(context,{invalid=false,offline=false}={}){
 const calls=[];
 await context.exposeFunction('sessionTestCall',name=>calls.push(name));
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='127.0.0.1')return route.continue();
  if(url.href==='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm')return route.fulfill({contentType:'text/javascript',body:`
   export function createClient(){
    function query(){return new Proxy({}, {get:(_,key)=>key==='then'?(ok,bad)=>Promise.resolve({data:[],count:0,error:null}).then(ok,bad):()=>query()})}
    return {from:()=>query(),auth:{signOut:async()=>({})},channel:()=>({on(){return this},subscribe(){return this}}),rpc:async(name)=>{
     await window.sessionTestCall(name);
     if(name==='customer_session_identity_v150')return ${offline?"{error:{message:'Failed to fetch'}}":invalid?"{error:{message:'REVIEW_SESSION_INVALID'}}":"{data:{ok:true,customer:{id:'customer-test-A',name:'Verified Customer',code:'TEST',country:'Iraq'}}}"};
     return {data:{rows:[],items:[],count:0},error:null};
    }}
   }`});
  return route.fulfill({contentType:'text/javascript',body:''});
 });
 const page=await context.newPage();await page.goto('/offline.html');
 await page.evaluate(key=>{localStorage.setItem(key,JSON.stringify({token:'synthetic-only',expiresAt:'2099-01-01'}));localStorage.setItem('meshwar_customer_id','old-unverified-user')},P);
 await page.close();return calls;
}
test('new page with persistent token restores via actual dashboard verification, then manual logout stays logged out',async({context})=>{
 const calls=await setup(context);const page=await context.newPage();
 await page.goto('/login.html');await expect(page).toHaveURL(/dashboard\.html/);
 await expect(page.locator('#userName')).toHaveText('Verified Customer');
 expect(calls.filter(n=>n==='customer_session_identity_v150')).toHaveLength(1);
 expect(calls).not.toContain('customer_review_login_v132');
 await page.evaluate(()=>logoutCustomer());await expect(page).toHaveURL(/login\.html/);
 await page.reload();await expect(page).toHaveURL(/login\.html/);
 expect(await page.evaluate(key=>localStorage.getItem(key),P)).toBeNull();
 expect(calls.filter(n=>n==='customer_review_logout_v132')).toHaveLength(1);
});
for(const mode of ['invalid','offline'])test(`${mode} response returns to login without automatic retry loop`,async({context})=>{
 const calls=await setup(context,{[mode]:true});const page=await context.newPage();
 let dashboardVisits=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame()&&frame.url().includes('/dashboard.html'))dashboardVisits++});
 await page.goto('/login.html');await expect.poll(()=>calls.filter(n=>n==='customer_session_identity_v150').length).toBe(2);
 await expect(page).toHaveURL(/login\.html/);await page.reload();
 await expect(page).toHaveURL(/login\.html/);expect(dashboardVisits).toBe(1);
 expect(calls.filter(n=>n==='customer_session_identity_v150')).toHaveLength(2);
 const persisted=await page.evaluate(key=>localStorage.getItem(key),P);
 expect(Boolean(persisted)).toBe(mode==='offline');
});
