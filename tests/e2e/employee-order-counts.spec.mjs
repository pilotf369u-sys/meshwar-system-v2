import {test,expect} from '@playwright/test';
import fs from 'node:fs';
const html=fs.readFileSync('employee-dashboard.html','utf8');
const begin=html.indexOf('// Counts use the same session-bound orders client');
const counts=html.slice(begin,html.indexOf('\nrenderPipelineTabs();',begin));
const loader=html.split('\n').find(line=>line.startsWith('async function loadPipelineOrders('));
test('employee order list and counters survive unavailable loyalty directory',async({page})=>{
 await page.setContent('<span id="count-all">0</span><span id="count-paid">0</span><span id="count-rewards">0</span><table><tbody id="pipelineOrdersBody"></tbody></table>');
 await page.evaluate(()=>{
  const rows=[{id:'order-1',order_code:'KN-TEST-1',status:'تم التسديد'},{id:'order-2',order_code:'KN-TEST-2',status:'انتظار رد الموظف'}];
  const sb={from(table){if(table!=='orders')throw Error('unexpected table');return {select(){return this},limit(){return Promise.resolve({data:rows,error:null})}}}};
  Object.assign(window,{PIPELINES:{all:{all:true},paid:{statuses:['تم التسديد']},rewards:{rewards:true}},activePipeline:'all',globalPipelineCounts:{},pipelineRequestId:0,pipelinePage:1,pipelinePageSize:20,cloudOrders:[],pipelineTotal:0,cloudId:v=>String(v||''),escapeHtml:String,ensureEmployeeSupabase:async()=>sb,
   KintoCustomerDirectoryV1:{from(){return {select(){return this},limit:async()=>({error:{message:'directory unavailable'}})}}},
   buildPipelineQuery(){return {order(){return this},range:async()=>({data:rows,count:rows.length,error:null})}},normalizeOrderMetrics:x=>x,enrichCustomerCodes:async()=>{},refreshEmployeeStockWarningsV54:async()=>{},renderPagination(){},renderBarcodes:async()=>{},orderRowHtml:o=>'<tr><td>'+o.order_code+'</td></tr>'});
 });
 await page.addScriptTag({content:counts+'\n'+loader});
 await page.evaluate(async()=>{await Promise.all([refreshPipelineCounts(),loadPipelineOrders()])});
 await expect(page.locator('#count-all')).toHaveText('2');await expect(page.locator('#count-paid')).toHaveText('1');
 await expect(page.locator('#count-rewards')).toHaveText('—');
 await expect(page.locator('#pipelineOrdersBody tr')).toHaveCount(2);
 await expect(page.locator('#pipelineOrdersBody')).toContainText('KN-TEST-1');
});
