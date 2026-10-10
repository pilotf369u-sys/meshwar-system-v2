const assert=require('node:assert/strict'),fs=require('node:fs');
const {JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM('<main><nav class="vendor-main-tabs"></nav><section id="vendorTab-orders" class="vendor-tab-panel active"></section></main>',{url:'https://example.test',runScripts:'outside-only'}),win=dom.window;
 const data={order:{segment_id:'s',order_code:'KN-000100',currency:'IQD',statement_no:'KINTO-STL-TEST',financial:{gross_amount:123000,commission_amount:12300,other_deductions:0,net_amount:110700},cost_frozen:false,cost_ready:true,total_cost_local:null,cost_lines:[{product_name:'<script>unsafe</script>',quantity:1,unit_cost_usd:50,exchange_rate:1750,cost_local:87500}]},expenses:[],expense_total:0};
 let calls=0;win.confirm=()=>true;win.alert=()=>{};
 win.sessionStorage.setItem('meshwar_vendor_session_v95','{"token":"a"}');
 win.MeshwarVendorRuntime={sb:{rpc:async(name,args)=>{calls++;if(name==='vendor_profit_capture_cost_v164'){assert.equal(args.p_expected_lines[0].unit_cost_usd,50);data.order.cost_frozen=true;data.order.total_cost_local=87500;data.order.cost_captured_at=new Date().toISOString()}if(name==='vendor_profit_add_expense_v164'){data.expense_total+=args.p_amount;data.expenses.push({amount:args.p_amount,category:args.p_category,note:args.p_note})}return {data:JSON.parse(JSON.stringify(data))}}}};
 win.eval(fs.readFileSync('js/vendor-profit-report-v164.js','utf8'));
 win.KintoVendorProfitV164.install(win);win.document.getElementById('vendorTabBtn-pl').click();
 const tick=()=>new Promise(r=>setTimeout(r,5));await tick();
 const panel=win.document.getElementById('vendorTab-pl');
 assert(panel.textContent.includes('غير مكتمل'));assert.equal(panel.querySelectorAll('script').length,0);
 panel.querySelector('[data-profit-capture]').click();await tick();assert(panel.textContent.includes('23,200 IQD'));assert.equal(panel.querySelectorAll('[data-profit-capture]').length,0);
 win.document.getElementById('kintoProfitExpenseAmountV164').value='100';win.document.getElementById('kintoProfitExpenseCategoryV164').value='تغليف';panel.querySelector('[data-profit-add-expense]').click();await tick();assert(panel.textContent.includes('23,100 IQD'));assert(panel.textContent.includes('110,700 IQD'));assert.equal(calls,3);
 await tick();assert.equal(calls,3);assert.equal(win.document.querySelectorAll('#vendorTab-pl').length,1);
 console.log('PASS: DOM mount, one writer/no refresh loop, escaped labels, cost confirmation, expense workflow, stable totals.');
 dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});
