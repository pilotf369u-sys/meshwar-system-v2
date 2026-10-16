import {test,expect} from '@playwright/test';
import {controllerSource,controllerInputs} from '../../ci/order-save-controller-harness.mjs';
const oid='00000000-0000-0000-0000-000000000120',bid='00000000-0000-0000-0000-000000000030';
for(const role of ['admin','employee'])for(const native of [false,true])test(`${role} ${native?'external shipping':'original'} save button uses session pricing and surfaces refusal`,async({page})=>{
 await page.setContent('<button id="save">حفظ</button><output id="feedback"></output><div id="inputs"></div>');
 const inputs=controllerInputs(role,oid,bid);
 await page.evaluate(({inputs,role,oid,bid})=>{
  for(const [id,value]of Object.entries(inputs)){const el=document.createElement('input');el.id=id;el.value=value;document.querySelector('#inputs').append(el)}
  const row={id:oid,status:'انتظار رد الموظف',total_price:100,currency:'USD',branch_id:bid,details:'{}',delivery_fee:5,delivery_payment_type:'cod_full',external_shipping_fee:0,external_shipping_currency:'USD'};
  const t=window.__priceTest={calls:[],fail:false,direct:0,refresh:0};
  const sb={from(){t.direct++;throw Error('DIRECT_ORDER_UPDATE_FORBIDDEN')},async rpc(name,args){t.calls.push({name,args});return t.fail?{error:{message:'ORDER_SAVE_CHANGED_RELOAD'}}:{data:null}}};
  Object.assign(window,{cloudId:x=>String(x??''),cloudOrders:[row],adminOrdersCloud:[row],cloudBranches:[{id:bid,name:'Branch A'}],adminBranches:[{id:bid,name:'Branch A'}],cloudCouriers:[],adminCouriersForOrders:[],can:()=>true,paymentType:x=>x,payType:x=>x,parseDetails:x=>JSON.parse(x||'{}'),orderParcelsCount:()=>1,isCloudUuid:()=>false,isAdminUuid:()=>false,checkEmployeePaymentStockV53:async()=>{},ensureEmployeeSupabase:async()=>sb,ensureCustomerSupabase:async()=>sb,loadPipelineOrders:async()=>{t.refresh++},refreshPipelineCounts:async()=>{},loadAdminOrders:async()=>{t.refresh++},refreshAdminPipelineCounts:async()=>{},KintoEmployeeSessionV143:{read:()=>({token:'employee-browser-session'})},KintoAdminSessionV147:{read:()=>({token:'admin-browser-session'})},alert:message=>document.querySelector('#feedback').textContent=message});
  document.querySelector('#save').onclick=()=>window[role==='employee'?'saveOrderRow':'saveAdminOrderRow'](oid);
 },{inputs,role,oid,bid});
 await page.evaluate(({source,role,native})=>{const el=document.createElement('script');if(native)el.dataset.meshwarScreen=role;el.textContent=source;document.head.append(el)},{source:controllerSource(role,native),role,native});
 await page.locator('#save').click();
 await expect.poll(()=>page.evaluate(()=>__priceTest.calls.length)).toBe(1);
 const state=await page.evaluate(()=>__priceTest);expect(state.direct).toBe(0);
 expect(state.calls[0].name).toBe('kinto_save_staff_order_session_v1');
 expect(state.calls[0].args).toMatchObject({p_role:role,p_session_token:role+'-browser-session',p_order_id:oid,p_expected_price:100,p_expected_currency:'USD',p_patch:{total_price:125}});
 expect(state.refresh).toBeGreaterThan(0);
 await page.evaluate(()=>__priceTest.fail=true);await page.locator('#save').click();
 await expect(page.locator('#feedback')).toContainText('ORDER_SAVE_CHANGED_RELOAD');
 expect(await page.evaluate(()=>__priceTest.direct)).toBe(0);
});
