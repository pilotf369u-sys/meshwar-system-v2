import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {controllerSource} from './order-save-controller-harness.mjs';
test('all original and external-shipping staff save handlers use sessions and price concurrency',()=>{
 for(const role of ['admin','employee'])for(const native of [false,true]){
  const s=controllerSource(role,native);
  assert(s.includes("rpc('kinto_save_staff_order_session_v1'"));
  assert(s.includes('p_expected_price:o.total_price'));assert(s.includes('p_expected_currency:o.currency'));
  assert(!/from\('orders'\)\.update\((?:payload|orderPatch)\)/.test(s));
  assert(s.includes("rpc('kinto_approve_paid_order_v1'"));
 }
 assert(fs.readFileSync('external-shipping-shell.html','utf8').includes('external-shipping-native-order-render-v1.js?v=20261124-native-staff-paid-v2'));
});
test('price guard is staged separately from additive SQL, and rollback preserves existing guards',()=>{
 const additive=fs.readFileSync('sql/kinto-order-save-session-v1.sql','utf8');
 assert(!/CREATE TRIGGER/i.test(additive));
 const lockdown=fs.readFileSync('sql/kinto-order-price-lockdown-v1.sql','utf8');
 assert(lockdown.includes('BEFORE UPDATE OF total_price,currency'));
 const rollback=fs.readFileSync('sql/kinto-order-price-rollback-v1.sql','utf8');
 assert(!/UPDATE public|DELETE FROM|REVOKE|DROP FUNCTION/i.test(rollback));
});

test('employee status save does not submit unrelated order details',()=>{
 const src=controllerSource('employee',false);
 assert(src.includes('if(parcelsCount!==orderParcelsCount(o))'),'details patch is conditional on parcel-count change');
 assert(!src.includes('payload.details=JSON.stringify(nextDetails);try{'),'no unconditional details overwrite');
 assert(src.includes('payload.details=JSON.stringify(nextDetails)'),'actual parcel-count edits remain supported');
 const guard=fs.readFileSync('sql/kinto-order-save-session-v1.sql','utf8');
 assert(guard.includes("RAISE EXCEPTION 'ORDER_SAVE_DETAILS_DENIED'"),'database denies changes outside parcel count');
 assert(guard.includes("old_details-'parcels_count'"),'server protects all unrelated details');
});

test('employee unified status aliases are mapped to original server-allowed labels only',()=>{
 const src=controllerSource('employee',false);
 const allowed=fs.readFileSync('sql/kinto-order-save-session-v1.sql','utf8');
 const mapping={"بانتظار رد الموظف":"انتظار رد الموظف","بانتظار تأكيد الدفع":"تمت الموافقة - بانتظار الدفع","مخزن الشركة":"مخزن شركة"};
 for(const [label,canonical] of Object.entries(mapping)){
   assert(src.includes("'"+label+"':'"+canonical+"'"),'missing alias '+label);
   assert(allowed.includes("'"+canonical+"'"),'server lacks canonical status '+canonical);
 }
 assert(src.indexOf('status=canonicalStatus[status]||status') < src.indexOf('payload={status,'),'normalize before patch');
 for(const forbidden of ['محولة إلى الفرع','مستحق مكافأة','رفض التسليم','ملغية من قبل العميل']){
   assert(!src.includes("'"+forbidden+"':"),'special workflow must not be remapped in generic save: '+forbidden);
 }
 const admin=controllerSource('admin',false);
 for(const [label,canonical] of Object.entries(mapping))assert(admin.includes("'"+label+"':'"+canonical+"'"),'admin missing alias '+label);
 assert(admin.indexOf('status=canonicalStatus[status]||status') < admin.indexOf('payload={reference_order_no:'),'normalize admin before patch');
 assert(src.includes("rpc('kinto_save_staff_order_session_v1'"),'trusted RPC unchanged');
 assert(src.includes("rpc('kinto_approve_paid_order_v1'"),'paid approval RPC unchanged');
});

test('obsolete staff reward status removed only from unified order dropdowns',()=>{
 for(const role of ['employee','admin']){
  const source=fs.readFileSync(role+'-dashboard.html','utf8');
  const block=source.split('/* UNIFIED_ORDER_STATUS_DROPDOWN_V1 */')[1]?.split('/* UNIFIED_ORDER_STATUS_DROPDOWN_V1_')[0]||'';
  assert(block.includes("'محولة إلى الفرع'"),'branch transfer option remains in '+role);
  assert(block.includes("'مندوب'"),'courier option remains in '+role);
  assert(!block.includes("'مستحق مكافأة'"),'obsolete reward option removed from '+role);
 }
});

test('admin branch transfer preflight uses the rendered row identifiers',()=>{
 const page=fs.readFileSync('admin-dashboard.html','utf8');
 const wrapper=page.split('/* UNIFIED_ORDER_STATUS_DROPDOWN_V1_ADMIN */')[1]?.split('</script>')[0]||'';
 assert(page.includes('id="adminStatus-'), 'admin status control exists');
 assert(page.includes('id="adminBranch-'), 'admin branch selector exists');
 assert(wrapper.includes("document.getElementById('adminStatus-'+encodedId)"),'reads real status control');
 assert(wrapper.includes("document.getElementById('adminBranch-'+encodedId)"),'reads real branch selector');
 assert(!wrapper.includes("document.getElementById('admin-status-'+encodedId)"),'no incorrect old ID');
 assert(!wrapper.includes("document.getElementById('admin-branch-'+encodedId)"),'no incorrect old ID');
 assert(wrapper.includes("if(statusEl?.value==='محولة إلى الفرع')"),'branch precondition exists');
});
test('branch and courier SQL guard changes are reversible and narrow',()=>{
 const apply=fs.readFileSync('docs/KINTO_STAFF_BRANCH_COURIER_GUARDED_SQL_REVIEW_ONLY_20261123.sql','utf8');
 const restore=fs.readFileSync('docs/KINTO_STAFF_BRANCH_COURIER_REVERSE_SQL_REVIEW_ONLY_20261123.sql','utf8');
 const schema=fs.readFileSync('sql/kinto-order-save-session-v1.sql','utf8');
 assert(apply.includes("'886b9817c86af7e067d756e9d9f3414c'"),'live body hash gate');
 assert(apply.includes("typed.status='محولة إلى الفرع'"),'branch requires selected branch');
 assert(apply.includes("typed.status='مندوب'"),'courier requires selected courier');
 assert(apply.includes('ORDER_SAVE_BRANCH_REQUIRED'));
 assert(apply.includes('ORDER_SAVE_COURIER_REQUIRED'));
 assert(apply.includes('SELECT 1 FROM public.branches'),'branch lookup');
 assert(apply.includes('SELECT 1 FROM public.couriers'),'courier lookup');
 assert(apply.includes('coalesce(c.is_active,true)'),'courier active check');
 assert(apply.includes('EXECUTE definition'),'updates actual live definition');
 assert(!/\\b(?:ALTER|CREATE|DROP)\\s+TABLE\\b/i.test(apply),'no table DDL');
 assert(!/\\b(?:UPDATE|DELETE|INSERT)\\s+public\\.orders\\b/i.test(apply),'no orders mutations');
 assert(restore.includes("KINTO_BRANCH_RESTORE_ORIGINAL_HASH_MISMATCH"),'restore guarded');
 assert(schema.includes('ORDER_SAVE_STATUS_DENIED'),'preserves whitelist');
});

test('native shell actually ships the corrected paid-order controller for both roles',()=>{
 const src=controllerSource('employee',true);
 for(const [handler,until] of [['window.saveOrderRow=async function(encodedId){','function installAdmin(){'],['window.saveAdminOrderRow=async function(encodedId){',"if(screen==='employee')installEmployee()"]]){
  const portion=src.split(handler)[1]?.split(until)[0]||'';
  assert(portion.includes("sb.rpc('kinto_approve_paid_order_v1'"),handler+' must use protected payment');
  assert(portion.includes("sb.rpc('kinto_save_staff_order_session_v1'"),handler+' must use staff RPC');
  assert(portion.includes("'بانتظار تأكيد الدفع':'تمت الموافقة - بانتظار الدفع'"),handler+' correct legacy paid approval');
  assert(portion.includes("status==='محولة إلى الفرع'&&!branchId"),handler+' require branch');
  assert(portion.includes("payload.courier_id=String(courier.id)"),handler+' preserve courier assignment id');
 }
 const employee=src.split('window.saveOrderRow=async function(encodedId){')[1].split('function installAdmin(){')[0];
 assert(employee.includes('if(parcelsCount!==orderParcelsCount(o))'),'native details must be omitted for status-only save');
 assert(!employee.includes('parcelsCount});\n    try{'),'must not send full order details on every save');
 assert(employee.includes('payload.details=JSON.stringify'),'parcel count change remains allowed');
 const shell=fs.readFileSync('external-shipping-shell.html','utf8');
 assert(shell.includes('external-shipping-native-order-render-v1.js?v=20261124-native-staff-paid-v2'),'new JS cache key delivered');
});

test('native staff paid-save invokes secure RPC without unchanged details (actual handler execution)',async()=>{
 const full=fs.readFileSync('js/external-shipping-native-order-render-v1.js','utf8');
 for(const role of ['employee','admin']){
  const isAdmin=role==='admin',handlerName=isAdmin?'saveAdminOrderRow':'saveOrderRow';
  const marker='window.'+handlerName+'=async function(encodedId){';
  const start=full.indexOf(marker),end=full.indexOf('\n  setTimeout(',start);
  assert(start>=0&&end>start,role+' native handler found');
  const calls=[],alerts=[],id='00000000-0000-4000-8000-000000000123';
  const row={id,status:'تمت الموافقة - بانتظار الدفع',total_price:1500,currency:'IQD',delivery_fee:0,delivery_payment_type:'cod_full',branch_id:null,branch_name:null,details:'{"items":[{"product_id":"unchanged"}]}',external_shipping_fee:0,external_shipping_currency:'IQD'};
  const values=isAdmin?{
   ['adminStatus-'+id]:'تم التسديد',['adminBranch-'+id]:'',['adminPrice-'+id]:'1500',
   ['adminCurrency-'+id]:'IQD',['adminPay-'+id]:'cod_full',['adminRef-'+id]:'',
   ['adminCourier-'+id]:'',['adminExternalFee-'+id]:'0',['adminExternalCurrency-'+id]:'IQD',
   ['adminReject-'+id]:''
  }:{
   ['status-'+id]:'تم التسديد',['branch-'+id]:'',['price-'+id]:'1500',
   ['currency-'+id]:'IQD',['pay-'+id]:'cod_full',['ref-'+id]:'',
   ['courier-'+id]:'',['externalFee-'+id]:'0',['externalCurrency-'+id]:'IQD',
   ['parcels-'+id]:'1'
  };
  const sb={async rpc(name,args){calls.push({name,args});return {data:null,error:null}}};
  const g={console,alert:msg=>alerts.push(msg),document:{getElementById:sel=>Object.prototype.hasOwnProperty.call(values,sel)?{value:values[sel]}:null},
   cloudId:x=>String(x??''),cloudOrders:[row],adminOrdersCloud:[row],cloudBranches:[],adminBranches:[],cloudCouriers:[],adminCouriersForOrders:[],
   paymentType:x=>x,payType:x=>x,parseDetails:x=>JSON.parse(x||'{}'),orderParcelsCount:()=>1,
   isCloudUuid:()=>false,isAdminUuid:()=>false,can:()=>true,
   checkEmployeePaymentStockV53:async()=>{},ensureEmployeeSupabase:async()=>sb,ensureCustomerSupabase:async()=>sb,
   loadPipelineOrders:async()=>{},refreshPipelineCounts:async()=>{},loadAdminOrders:async()=>{},refreshAdminPipelineCounts:async()=>{},
   KintoEmployeeSessionV143:{read:()=>({token:'employee-session'})},
   KintoAdminSessionV147:{read:()=>({token:'admin-session'})}};
  g.window=g;vm.createContext(g);vm.runInContext(full.slice(start,end),g);
  await g[handlerName](id);
  assert.deepEqual(alerts,[],role+' paid save must not alert');
  assert.equal(calls.length,1,role+' exactly one protected payment request');
  assert.equal(calls[0].name,'kinto_approve_paid_order_v1');
  const p=calls[0].args.p_patch;
  assert.equal(p.status,'تم التسديد');assert.equal(p.total_price,1500);assert.equal(p.currency,'IQD');
  assert.equal(Object.prototype.hasOwnProperty.call(p,'details'),false,role+' unchanged order details never sent');
  assert.equal(Object.prototype.hasOwnProperty.call(p,'external_shipping_fee'),false,role+' external fee excluded from approval');
 }
});
