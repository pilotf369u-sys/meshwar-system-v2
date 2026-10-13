const {test,expect}=require('@playwright/test');
const path=require('node:path');
test('single profit report: cost gate, snapshot, expenses and no legacy totals',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 // Establish a same-origin page without executing the production dashboard.
 await page.goto('/__v164_fixture__');
 await page.setContent('<main><nav class="vendor-main-tabs"></nav><section id="vendorTab-orders" class="vendor-tab-panel active"></section></main>');
 await page.evaluate(()=>{
  window.profitCalls=[];
  const report={order:{segment_id:'s',order_code:'KN-000100',currency:'IQD',statement_no:'KINTO-STL-TEST',financial:{gross_amount:123000,commission_amount:12300,other_deductions:0,net_amount:110700},cost_frozen:false,cost_ready:true,total_cost_local:null,cost_lines:[{product_name:'المنتج التجريبي',quantity:1,unit_cost_usd:50,exchange_rate:1750,cost_local:87500}]},expenses:[],expense_total:0};
  window.sessionStorage.setItem('meshwar_vendor_session_v95',JSON.stringify({token:'test'}));
  window.MeshwarVendorRuntime={sb:{rpc:async(name,args)=>{
   window.profitCalls.push(name);
   if(name==='vendor_profit_capture_cost_v164'){report.order.cost_frozen=true;report.order.total_cost_local=87500;report.order.cost_captured_at='2026-10-10T08:00:00Z'}
   if(name==='vendor_profit_add_expense_v164'){report.expenses.push({amount:args.p_amount,category:args.p_category,note:args.p_note});report.expense_total+=args.p_amount}
   return {data:structuredClone(report)};
  }}};
 });
 await page.addScriptTag({path:path.resolve('js/vendor-profit-report-v164.js')});
 await page.evaluate(()=>window.KintoVendorProfitV164.install(window));
 await page.locator('#vendorTabBtn-pl').click();
 const panel=page.locator('#vendorTab-pl');
 await expect(panel).toContainText('123,000 IQD');await expect(panel).toContainText('غير مكتمل');
 await expect(panel).not.toContainText('707,000');
 page.on('dialog',dialog=>dialog.accept());
 await page.locator('[data-profit-capture]').click();
 await expect(panel).toContainText('23,200 IQD');await expect(panel).toContainText('87,500 IQD');await expect(page.locator('[data-profit-capture]')).toHaveCount(0);
 await panel.locator('summary').click();
 await page.locator('#kintoProfitExpenseAmountV164').fill('100');await page.locator('#kintoProfitExpenseCategoryV164').fill('تغليف');
 await page.locator('[data-profit-add-expense]').click();await expect(panel).toContainText('23,100 IQD');await expect(panel).toContainText('110,700 IQD');
 expect(await page.evaluate(()=>window.profitCalls)).toEqual(['vendor_profit_report_v164','vendor_profit_capture_cost_v164','vendor_profit_add_expense_v164']);
});
