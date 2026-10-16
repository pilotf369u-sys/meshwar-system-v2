import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const core=fs.readFileSync('js/admin-featured-campaigns-v1-core-v15.js','utf8');
const requests=fs.readFileSync('js/admin-featured-requests-v2.js','utf8');
async function setup(page){
 await page.setContent('<div class="cms-grid"></div>');
 await page.evaluate(()=>{
  window.rpcCalls=[];window.failRpc=false;window.holdRpc=false;
  window.verifyAdmin=async()=>({id:'admin'});window.adminId=()=> 'admin';
  window.KintoAdminSessionV147={read:()=>({token:'test-session'})};
  window.getSb=async()=>({rpc:async(name,args)=>{window.rpcCalls.push({name,args});if(window.holdRpc)await new Promise(resolve=>window.releaseRpc=resolve);return window.failRpc?{error:{message:'test backend unavailable'}}:{data:[]}}});
 });
}
test('request panel waits for delayed campaign mount and boots once',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await setup(page);
 await page.addScriptTag({content:requests});
 await page.waitForTimeout(150);
 await expect.poll(()=>page.evaluate(()=>rpcCalls.length)).toBe(0);
 await page.addScriptTag({content:core});
 await expect(page.locator('#phase2Status')).toContainText('Phase 2 جاهزة');
 await expect(page.locator('#phase2Reload')).toBeVisible();
 const count=await page.evaluate(()=>rpcCalls.filter(x=>x.name==='admin_list_featured_requests_session_v1').length);
 await page.evaluate(()=>window.dispatchEvent(new Event('kinto:featured-campaigns-ready')));
 expect(await page.evaluate(()=>rpcCalls.filter(x=>x.name==='admin_list_featured_requests_session_v1').length)).toBe(count);
 await page.locator('#phase2Reload').click();
 await expect.poll(()=>page.evaluate(()=>rpcCalls.filter(x=>x.name==='admin_list_featured_requests_session_v1').length)).toBe(count+1);
 expect(errors).toEqual([]);
});
test('refresh gives local feedback, reloads data, and recovers from RPC failure',async({page})=>{
 await setup(page);await page.addScriptTag({content:core});await expect(page.locator('#featuredCampaignStatus')).toContainText('جاهزة');
 await page.evaluate(()=>holdRpc=true);await page.locator('#featuredReloadBtn').click();
 await expect(page.locator('#featuredReloadBtn')).toBeDisabled();await expect(page.locator('#featuredReloadStatus')).toContainText('جاري تحميل');
 await page.evaluate(()=>{holdRpc=false;releaseRpc()});await expect(page.locator('#featuredReloadStatus')).toContainText('تم التحديث');await expect(page.locator('#featuredReloadBtn')).toBeEnabled();
 await page.evaluate(()=>failRpc=true);await page.locator('#featuredReloadBtn').click();await expect(page.locator('#featuredReloadStatus')).toContainText('تعذر التحديث');await expect(page.locator('#featuredReloadBtn')).toBeEnabled();
 await page.evaluate(()=>failRpc=false);await page.locator('#featuredReloadBtn').click();await expect(page.locator('#featuredReloadStatus')).toContainText('تم التحديث');
});
test('requests also mount when the core was loaded first',async({page})=>{await setup(page);await page.addScriptTag({content:core});await page.addScriptTag({content:requests});await expect(page.locator('#phase2Status')).toContainText('Phase 2 جاهزة')});
