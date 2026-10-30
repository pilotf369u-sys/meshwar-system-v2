import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.KINTO_PLAYWRIGHT_MODULE||'@playwright/test');
const expected='انتهت جلسة الدخول. يرجى تسجيل الدخول مرة أخرى';

test('Chromium: password session errors stay private and never change the session',async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.KINTO_CHROMIUM_PATH?{executablePath:process.env.KINTO_CHROMIUM_PATH}:{})});
 try{
  const page=await browser.newPage();
  const logs=[];page.on('console',message=>logs.push(message.text()));
  await page.route('**/*',route=>route.abort());
  // Use dashboard markup; unrelated app scripts are deliberately disabled.
  await page.setContent(fs.readFileSync('dashboard.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  await page.evaluate(()=>{
   document.documentElement.classList.remove('customer-auth-pending');
   window.fixture={token:'synthetic-session-only',calls:[],reply:null,sessionWrites:0};
   window.KintoCustomerSessionV150={read:()=>({token:fixture.token}),clear:()=>{fixture.sessionWrites++},write:()=>{fixture.sessionWrites++}};
   window.ensureCustomerPortalSupabase=async()=>({auth:{signOut:()=>{fixture.sessionWrites++}},rpc:async(name,args)=>{fixture.calls.push({name,args});if(fixture.throwError)throw fixture.reply;return fixture.reply;}});
  });
  await page.addScriptTag({content:fs.readFileSync('js/kinto-customer-password-v1.js','utf8')});
  await page.evaluate(()=>window.KintoCustomerPasswordV1.open());
  const status=page.locator('#kintoPasswordStatus');
  async function submit(reply,throwError=false){
   await page.evaluate(({reply,throwError})=>{fixture.reply=reply;fixture.throwError=throwError},{reply,throwError});
   await page.locator('[name=current]').fill('synthetic-old-password');
   await page.locator('[name=next]').fill('synthetic-new-password');
   await page.locator('[name=confirm]').fill('synthetic-new-password');
   await page.locator('#kintoPasswordForm [type=submit]').click();
   await page.waitForFunction(()=>!document.querySelector('#kintoPasswordForm [type=submit]').disabled);
  }
  // Actual guard exceptions become PostgREST error.message, with SQLSTATE P0001.
  for(const message of ['REVIEW_SESSION_INVALID','REVIEW_SESSION_REQUIRED']){
   await submit({data:null,error:{code:'P0001',message,details:null,hint:null}});
   assert.equal(await status.textContent(),expected);
  }
  for(const code of ['SESSION_INVALID','SESSION_EXPIRED','SESSION_REQUIRED']){
   for(const reply of [{data:null,error:{code:'P0001',message:code}},{data:null,error:{code}},{data:{ok:false,error:code},error:null}]){
    await submit(reply);assert.equal(await status.textContent(),expected);
   }
  }
  await submit({code:'P0001',message:'REVIEW_SESSION_INVALID'},true);assert.equal(await status.textContent(),expected);
  const before=await page.evaluate(()=>fixture.calls.length);
  await page.evaluate(()=>fixture.token=null);await submit({data:{ok:true}});
  assert.equal(await status.textContent(),expected);assert.equal(await page.evaluate(()=>fixture.calls.length),before);
  await page.evaluate(()=>fixture.token='synthetic-session-only');
  for(const reply of [{data:null,error:{code:'08006',message:'synthetic-session-only synthetic-old-password SESSION_INVALID'}},{data:{ok:false,error:'PASSWORD_INVALID'}}]){
   await submit(reply);assert.notEqual(await status.textContent(),expected);
   assert(!/synthetic-/.test(await status.textContent()));
  }
  await submit({data:{ok:false,error:'PASSWORD_CHANGE_TEMPORARILY_LOCKED'}});assert.match(await status.textContent(),/15/);
  await submit({data:{ok:true},error:null});assert.match(await status.textContent(),/بنجاح/);
  assert.equal(await page.locator('[name=current]').inputValue(),'');
  assert.equal(await page.evaluate(()=>fixture.sessionWrites),0);
  assert.equal(await page.evaluate(()=>fixture.token),'synthetic-session-only');
  assert.equal(await page.locator('#kintoPasswordDialog').count(),1);
  assert(!logs.some(value=>/synthetic-(?:session|old-password|new-password)/.test(value)));
  assert.equal(await page.evaluate(()=>fixture.calls.every(call=>call.name==='customer_change_password_session_v1')),true);
 }finally{await browser.close();}
});
