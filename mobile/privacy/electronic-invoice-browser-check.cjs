// Actual invoice renderer, intercepted network only. No production access or writes.
const {chromium}=require('@playwright/test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
(async()=>{const browser=await chromium.launch({headless:true});try{
 const context=await browser.newContext({viewport:{width:1000,height:900}}),page=await context.newPage();
 const requests=[];await context.route('**/*',async route=>{requests.push({method:route.request().method(),url:route.request().url()});await route.fulfill({status:200,contentType:'application/json',body:'[]'})});
 await page.setContent('<!doctype html><html><head></head><body></body></html>');
 await page.evaluate(()=>{window.JsBarcode=()=>{};window.directoryCalls=0;window.KintoCustomerDirectoryV1={from(){window.directoryCalls++;return{eq:()=>({maybeSingle:async()=>({data:{name:'TEST LIVE WRONG NAME',phone:'TEST LIVE WRONG PHONE'},error:null})})}}}});
 await page.addScriptTag({path:'js/kinto-bundle-ui-v93.js'});
 const result=await page.evaluate(async()=>{
  const saved={name:'TEST SAVED CUSTOMER',code:'TEST-C001',phone:'TEST-0700',secondary_phone:'',country:'TEST COUNTRY',province:'TEST PROVINCE',address:'TEST SAVED ADDRESS'};
  const order={id:'00000000-0000-4000-8000-000000000001',order_code:'KN-TEST-001',customer_id:'00000000-0000-4000-8000-000000000002',total_price:12000,currency:'IQD',status:'TEST PAID',delivery_payment_type:'product_paid_delivery_cod',created_at:'2026-10-26T00:00:00Z',details:{source:'local_store',customer:saved,store_id:'TEST-STORE',items:[{product_id:'TEST-P',store_id:'TEST-STORE',product_name:'TEST PRODUCT',quantity:1,unit_price_local:12000,line_total_local:12000,currency:'IQD'}]},_kintoCustomer:{name:'TEST LIVE WRONG NAME',phone:'TEST LIVE WRONG PHONE'}};
  const print=async()=>{const w=window.open('about:blank');await KintoBundleV93.printInvoice(order,{canonicalOnly:true,invoiceWindow:w});return {error:w._invoiceErrorV58,text:w.document.body.textContent,identity:KintoBundleV93.customerData(order)}};
  const before=await print();delete order._kintoCustomer;const after=await print();return {before,after,directoryCalls:window.directoryCalls,total:order.total_price,status:order.status};
 });
 assert.equal(result.before.error,false);assert.equal(result.after.error,false);assert.deepEqual(result.before.identity,result.after.identity);assert.match(result.before.text,/TEST SAVED CUSTOMER/);assert.match(result.after.text,/TEST SAVED ADDRESS/);assert.doesNotMatch(result.after.text,/TEST LIVE WRONG/);assert.match(result.after.text,/12,000/);assert.equal(result.total,12000);assert.equal(result.status,'TEST PAID');assert.equal(result.directoryCalls,0);assert(requests.every(r=>r.method==='GET'),'no write method in invoice renderer test');
 const shots=path.join(process.env.RUNNER_TEMP||'/tmp','kinto-privacy-shots');fs.mkdirSync(shots,{recursive:true});const popup=context.pages().at(-1);await popup.screenshot({path:path.join(shots,'electronic-invoice-without-profile.png'),fullPage:true});
 console.log('PASS_ELECTRONIC_INVOICE_BROWSER: real printed invoice keeps persisted identity before/after profile removal; amount/status unchanged; no directory lookup or write request.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
