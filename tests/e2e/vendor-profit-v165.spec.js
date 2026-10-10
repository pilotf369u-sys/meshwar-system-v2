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
