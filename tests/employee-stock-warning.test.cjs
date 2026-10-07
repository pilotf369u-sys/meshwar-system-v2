const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../employee-dashboard.html'),'utf8');
for(const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))if(match[1].trim())new vm.Script(match[1]);
const declarations=source.slice(source.indexOf('function employeeStockIconV53('),source.indexOf("document.addEventListener('click',e=>{const b=e.target.closest?.('[data-stock-order-id]')"));
const slots=[{dataset:{stockIconSlot:'ok'},innerHTML:''},{dataset:{stockIconSlot:'bad'},innerHTML:''}];
const context={console:{warn(){}},cloudOrders:[{id:'ok',_stockShortagesV53:[{}]},{id:'bad'}],escapeHtml:String,document:{querySelectorAll(selector){assert.equal(selector,'[data-stock-icon-slot]');return slots}},window:{KintoBundleV93:{async refreshStockWarnings(orders){if(orders.some(o=>o.id==='bad')){orders.forEach(o=>delete o._stockShortagesV53);throw Error('legacy malformed product')}orders.forEach(o=>o._stockShortagesV53=[{}])}}}};
vm.createContext(context);vm.runInContext(declarations,context);
(async()=>{
 // One broken historical order does not erase the warning on a valid order.
 await context.refreshEmployeeStockWarningsV54(context.cloudOrders);assert.equal(context.cloudOrders[0]._stockShortagesV53.length,1);
 // Indicators use a dedicated slot even without a barcode element.
 context.updateEmployeeStockIconsV53();assert(slots[0].innerHTML.includes('data-stock-order-id="ok"'));assert.equal(slots[1].innerHTML,'');
 const previous=slots[0].innerHTML;context.updateEmployeeStockIconsV53();assert.equal(slots[0].innerHTML,previous);
 context.cloudOrders[0]._stockShortagesV53=[];context.updateEmployeeStockIconsV53();assert.equal(slots[0].innerHTML,'');
 // Exercise the actual realtime update path: inspect before rendering, preserve invoice target.
 const realtime=source.slice(source.indexOf('async function employeeRealtimeApply('),source.indexOf('async function employeeRealtimeFlush('));
 Object.assign(context,{cloudId:String,employeeRealtimeFindRow(){return row},normalizeOrderMetrics:o=>o,enrichCustomerCodes:async()=>{},employeeRealtimeViewMatch:()=>true,orderRowHtml:o=>context.employeeStockIconV53(o),renderPagination(){}});const row={outerHTML:''};vm.runInContext(realtime,context);
 await context.employeeRealtimeApply({eventType:'UPDATE',new:{id:'ok',status:'بانتظار موافقة العميل'}});assert(row.outerHTML.includes('data-stock-order-id="ok"'));
 console.log('PASS: batch isolation, barcode-independent slot, duplicate prevention, restock clearing, realtime warning; inline scripts parse');
})().catch(e=>{console.error(e);process.exit(1)});
