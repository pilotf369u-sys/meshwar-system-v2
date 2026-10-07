const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');const root=path.resolve(__dirname,'..');
const employee=fs.readFileSync(root+'/employee-dashboard.html','utf8'),native=fs.readFileSync(root+'/js/external-shipping-native-order-render-v1.js','utf8'),shell=fs.readFileSync(root+'/external-shipping-shell.html','utf8');
const ctx={document:{currentScript:{dataset:{meshwarScreen:'employee'}},getElementById(){return null},createElement(){return{}},head:{appendChild(){}},querySelector(){return null}},queueMicrotask(){},setTimeout(){},cloudId:String,escapeHtml:String,orderQuantity:o=>o.quantity||1,orderRowClass:()=>'',can:()=>true,paymentOptions:()=>'',branchOptions:()=>'',statusOptions:()=>'',courierOptionsForOrder:()=>'',orderParcelsCount:()=>1,orderCustomerCode:()=>'',employeeSecondaryContact:()=>''};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(employee.match(/function employeeStockIconV53\(o\)\{[^\n]+/)[0],ctx);
const render=code=>{vm.runInContext(code,ctx);return ctx.orderRowHtml};
const order={id:'stock-test-id',order_code:'KN-000099',status:'بانتظار موافقة العميل',quantity:5,total_price:60000,currency:'IQD',_stockShortagesV53:[{}]};
const row=render(native)(order);assert(row.includes('data-stock-icon-slot="stock-test-id"'));assert(row.includes('data-stock-order-id="stock-test-id"'));assert(row.includes('60000.00'));assert(row.includes('onclick="saveOrderRow'));assert(row.includes('data-order-id="stock-test-id"'));
order._stockShortagesV53=[];assert(!ctx.orderRowHtml(order).includes('data-stock-order-id='));
// The deployed shell must request the updated renderer, not the old cached version.
assert(shell.includes('external-shipping-native-order-render-v1.js?v=20261007-v55-employee-stock-icon'));
new vm.Script(native);for(const m of shell.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))new vm.Script(m[1]);
console.log('PASS: actual shell renderer shows warning, preserves barcode/amount/save, clears warning on restock, updated asset URL; syntax valid');
