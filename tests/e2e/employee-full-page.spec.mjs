import {test,expect} from '@playwright/test';
const eid='00000000-0000-4000-8000-000000000010';
for(const mobile of [false,true])test(`employee full shell loads orders (${mobile?'mobile':'desktop'})`,async({page})=>{
 if(mobile)await page.setViewportSize({width:393,height:851});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.addInitScript(({eid})=>{sessionStorage.setItem('kinto_employee_session_v143',JSON.stringify({token:'fullpage-test-token',expiresAt:'2099-01-01',employee:{id:eid}}))},{eid});
 await page.route('**/*',async route=>{
  const u=route.request().url();if(u.startsWith('http://127.0.0.1:4173'))return route.continue();
  if(u.includes('@supabase/supabase-js@2/+esm'))return route.fulfill({contentType:'text/javascript',body:`export function createClient(){
  const rows=[{id:'00000000-0000-4000-8000-000000000020',order_code:'KN-FULLPAGE',customer_id:'c1',customer_name:'Test customer',status:'انتظار رد الموظف',total_price:100,currency:'IQD',details:'{}',created_at:'2026-10-17'}];
  class Query{constructor(table){this.table=table}select(){return this}order(){return this}limit(){return this}in(){return this}eq(){return this}or(){return this}range(){return this}then(a,b){return Promise.resolve({data:this.table==='orders'?rows:[],count:this.table==='orders'?rows.length:0,error:null}).then(a,b)}}
  return {from:t=>new Query(t),rpc:async(name,args)=>{if(name==='employee_session_identity_v143')return {data:{ok:true,employee:{id:'${eid}',name:'Test employee',role:' موظف',permissions:{orders:true,branches:true,pricing:true,rewards:true}}}};if(name==='kinto_staff_directory_session_v1')return {data:[]};if(name==='kinto_customer_directory_session_v1')return {data:{rows:[{id:'c1',name:'Test customer',code:'C1'}],count:1}};if(name==='employee_chat_list_v61')return {data:{items:[]}};return {data:{}}},channel:()=>({on(){return this},subscribe(){return this}})}
 }`});
  if(u.includes('jsbarcode'))return route.fulfill({contentType:'text/javascript',body:'window.JsBarcode=()=>{}'});
  return route.abort();
 });
 await page.goto('/external-shipping-shell.html?screen=employee&employeeId='+eid);
 const frame=page.frameLocator('#app');
 await expect(frame.locator('#pipelineOrdersBody')).toContainText('KN-FULLPAGE',{timeout:12000});
 await expect(frame.locator('#count-all')).toHaveText('1');
 await expect(frame.locator('#employeeIdentity')).toContainText('Test employee');
 // Exercise navigation and reloading in the complete shipped iframe, with every late override loaded.
 await frame.locator('[data-pipeline="all"]').click();
 await expect(frame.locator('#pipelineOrdersBody')).toContainText('KN-FULLPAGE');
 await page.reload();
 await expect(frame.locator('#pipelineOrdersBody')).toContainText('KN-FULLPAGE');
 await expect(frame.locator('#count-all')).toHaveText('1');
 expect(errors.filter(x=>!x.includes('Failed to load resource'))).toEqual([]);
});
