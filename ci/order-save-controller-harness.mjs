import fs from 'node:fs';
export function controllerSource(role,native){
 if(native)return fs.readFileSync('js/external-shipping-native-order-render-v1.js','utf8');
 const name=role==='employee'?'saveOrderRow':'saveAdminOrderRow';
 const source=fs.readFileSync(role+'-dashboard.html','utf8').split('\n').find(x=>x.startsWith('async function '+name+'('));
 if(!source)throw Error('Actual inline save controller not found');
 return source+'\nwindow.'+name+'='+name+';';
}
// Shared synthetic input controls; production controller code is never copied here.
export function controllerInputs(role,id,branch){
 const p=role==='employee'?'':'admin';
 return {[p?'adminStatus-'+id:'status-'+id]:'انتظار رد الموظف',
 [p?'adminPrice-'+id:'price-'+id]:'125',[p?'adminCurrency-'+id:'currency-'+id]:'USD',
 [p?'adminPay-'+id:'pay-'+id]:'cod_full',[p?'adminBranch-'+id:'branch-'+id]:branch,
 [p?'adminRef-'+id:'ref-'+id]:'REF-CONTROLLER',[p?'adminCourier-'+id:'courier-'+id]:'',
 [p?'adminExternalFee-'+id:'externalFee-'+id]:'0',[p?'adminExternalCurrency-'+id:'externalCurrency-'+id]:'USD',
 ['adminDeliveryFee-'+id]:'5',['adminReject-'+id]:'',['parcels-'+id]:'2'};
}
