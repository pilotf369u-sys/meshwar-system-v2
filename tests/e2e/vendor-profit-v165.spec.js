const {test,expect}=require('@playwright/test');
const path=require('node:path');
test('V165 mobile: five rows per page, search and on-demand multi-product profit details',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/__v165_fixture__');
 await page.setContent('<main><nav class="vendor-main-tabs"></nav><section class="vendor-tab-panel active"></section></main>');
 await page.evaluate(()=>{
  window.calls=[];
  const financial={gross_amount:123000,commission_amount:12300,other_deductions:0,net_amount:110700};
  const rows=Array.from({length:13},(_,i)=>({segment_id:'seg-'+i,order_code:'KN-'+String(i+100).padStart(6,'0'),created_at:'2026-10-10T00:00:00Z',currency:'IQD',financial,cost_frozen:i>0,total_cost_local:i>0?87500:null,expense_total:0,product_count:3}));
  const client=window.MeshwarVendorRuntime={sb:{rpc:async(name,args)=>{
   window.calls.push({name,args});
   if(name==='vendor_profit_list_v165'){
    const filtered=rows.filter(x=>x.order_code.includes(args.p_query)),pages=Math.max(1,Math.ceil(filtered.length/5)),pg=Math.min(args.p_page,pages);
    return {data:{rows:structuredClone(filtered.slice((pg-1)*5,pg*5)),total:filtered.length,page:pg,pages,summary:[{currency:'IQD',orders:filtered.length,incomplete_orders:filtered.filter(x=>!x.cost_frozen).length,sales:123000*filtered.length,commission:12300*filtered.length,net:110700*filtered.length,cost:87500*filtered.filter(x=>x.cost_frozen).length,expenses:rows.reduce((n,x)=>n+x.expense_total,0),profit:filtered.reduce((n,x)=>n+(x.cost_frozen?110700-x.total_cost_local-x.expense_total:0),0)}]}};
   }
   const r=rows.find(x=>x.segment_id===args.p_segment_id);
   if(name==='vendor_profit_capture_cost_v165'){r.cost_frozen=true;r.total_cost_local=87500}
   if(name==='vendor_profit_add_expense_v165')r.expense_total+=args.p_amount;
   return {data:{order:{...structuredClone(r),cost_ready:true,statement_no:'KINTO-STL-TEST',cost_lines:[{product_name:'المنتج الأول',quantity:1,unit_cost_usd:25,exchange_rate:1750,cost_local:43750},{product_name:'المنتج الثاني',quantity:1,unit_cost_usd:25,exchange_rate:1750,cost_local:43750}]},expense_total:r.expense_total,expenses:[]}};
  }}};
  sessionStorage.setItem('meshwar_vendor_session_v95',JSON.stringify({token:'test'}));
 });
 await page.addScriptTag({path:path.resolve('js/vendor-profit-report-v165.js')});
 await page.evaluate(()=>window.KintoVendorProfitV164.install(window));
 await page.locator('#vendorTabBtn-pl').click();
 await expect(page.locator('#profitRowsV165 tr')).toHaveCount(5);
 await expect(page.locator('#profitPagerV165')).toContainText('صفحة 1 من 3');
 await page.locator('[data-profit-page="1"]').click();
 await expect(page.locator('#profitPagerV165')).toContainText('صفحة 2 من 3');
 await expect(page.locator('#profitRowsV165')).toContainText('KN-000105');
 await page.locator('[data-profit-page="1"]').click();
 await expect(page.locator('#profitRowsV165 tr')).toHaveCount(3);
 await expect(page.locator('[data-profit-page="1"]')).toBeDisabled();
 await page.locator('#profitQueryV165').fill('KN-000100');await page.locator('#profitApplyV165').click();
 await expect(page.locator('#profitRowsV165 tr')).toHaveCount(1);
 await expect(page.locator('#profitPagerV165')).toContainText('صفحة 1 من 1');
 await expect(page.locator('#profitRowsV165')).toContainText('غير مكتمل');
 await expect(page.locator('#profitRowsV165')).not.toContainText('المنتج الأول');
 await page.locator('[data-profit-detail]').click();
 const dialog=page.locator('#kintoProfitDialogV165');await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('المنتج الأول');await expect(dialog).toContainText('المنتج الثاني');
 page.on('dialog',d=>d.accept());await dialog.locator('[data-profit-capture]').click();
 await expect(dialog).toContainText('23,200 IQD');
 await expect(page.locator('#profitRowsV165')).toContainText('23,200 IQD');
 await dialog.locator('summary').click();
 await page.locator('#profitExpenseAmountV165').fill('100');await page.locator('#profitExpenseCategoryV165').fill('تغليف');
 await dialog.locator('[data-profit-add-expense]').click();
 await expect(dialog).toContainText('23,100 IQD');
 await expect(page.locator('#profitRowsV165')).toContainText('23,100 IQD');
 await dialog.locator('[data-profit-close]').click();await expect(dialog).not.toBeVisible();
 const calls=await page.evaluate(()=>window.calls);
 expect(calls.filter(x=>x.name==='vendor_profit_add_expense_v165')[0].args.p_segment_id).toBe('seg-0');
 expect(calls.filter(x=>x.name==='vendor_profit_capture_cost_v165')).toHaveLength(1);
});

test('profit reloads automatically when secure login completes on the restored tab',async({page})=>{
 await page.goto('/__v165_fixture__');
 await page.setContent('<main><nav class="vendor-main-tabs"></nav></main>');
 await page.evaluate(()=>{sessionStorage.removeItem('meshwar_vendor_session_v95');window.MeshwarVendorRuntime={sb:{rpc:async()=>({data:{rows:[],summary:[],page:1,pages:1,total:0}})}}});
 await page.addScriptTag({path:path.resolve('js/vendor-profit-report-v165.js')});
 await page.evaluate(()=>window.KintoVendorProfitV164.install(window));
 await page.locator('#vendorTabBtn-pl').click();
 await expect(page.locator('#profitStatusV165')).toContainText('أعد تسجيل الدخول');
 await page.evaluate(()=>{sessionStorage.setItem('meshwar_vendor_session_v95',JSON.stringify({token:'fresh'}));window.dispatchEvent(new Event('meshwar:vendor-session-ready'))});
 await expect(page.locator('#profitStatusV165')).toHaveText('');
 await expect(page.locator('#profitRowsV165')).toContainText('لا توجد طلبات مسلّمة');
});
test('merchant archive refreshes on return and visible timer without a page reload',async({page})=>{
 await page.goto('/__v163_live_fixture__');
 await page.setContent('<section id="vendorTab-finance" class="active"></section><button id="vendorTabBtn-finance">finance</button>');
 await page.evaluate(()=>{
  sessionStorage.setItem('meshwar_vendor_session_v95',JSON.stringify({token:'fresh'}));window.archiveCalls=0;window.archiveRecords=[];
  const nativeTimer=window.setInterval;window.setInterval=(fn,ms)=>{if(ms===30000){window.archiveTick=fn;return 12345}return nativeTimer(fn,ms)};
  window.MeshwarVendorRuntime={sb:{rpc:async()=>{window.archiveCalls++;return {data:structuredClone(window.archiveRecords)}}}};
 });
 await page.addScriptTag({path:path.resolve('js/vendor-settlement-archive-v163.js')});
 await page.evaluate(()=>window.dispatchEvent(new Event('kinto-vendor-runtime-ready')));
 await expect(page.locator('#vendorArchiveResultsV163')).toContainText('لا توجد كشوف');
 await page.evaluate(()=>{window.archiveRecords=[{id:'a',statement_no:'KINTO-STL-NEW',created_at:'2026-10-10T00:00:00Z',net_amount:183600,currency:'IQD',order_count:1}];window.dispatchEvent(new Event('focus'))});
 await expect(page.locator('#vendorArchiveResultsV163')).toContainText('KINTO-STL-NEW');
 await page.evaluate(()=>{window.archiveRecords.push({id:'b',statement_no:'KINTO-STL-NEXT',created_at:'2026-10-10T00:00:00Z',net_amount:110700,currency:'IQD',order_count:1});window.archiveTick()});
 await expect(page.locator('#vendorArchiveResultsV163')).toContainText('KINTO-STL-NEXT');
 const before=await page.evaluate(()=>{document.getElementById('vendorTab-finance').classList.remove('active');return window.archiveCalls});
 await page.evaluate(()=>window.archiveTick());expect(await page.evaluate(()=>window.archiveCalls)).toBe(before);
 await page.evaluate(()=>{document.getElementById('vendorTab-finance').classList.add('active');sessionStorage.removeItem('meshwar_vendor_session_v95')});
 await page.evaluate(()=>window.archiveTick());expect(await page.evaluate(()=>window.archiveCalls)).toBe(before);
});
