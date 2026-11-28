const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),
 path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const js=fs.readFileSync(path.join(root,'js/kinto-g16-employee-panel-v1.js'),'utf8');
const html=fs.readFileSync(path.join(root,'employee-dashboard.html'),'utf8');
test('panel script is syntactically valid and does nothing without opt-in URL flag',()=>{
 assert.doesNotThrow(()=>new vm.Script(js,{filename:'g16-panel.js'}));
 let touched=0;
 vm.runInNewContext(js,{window:{},URLSearchParams,location:{search:''},
  document:{createElement(){touched++;throw Error('Should not create DOM')},
   addEventListener(){touched++;throw Error('Should not bind handlers')}}});
 assert.equal(touched,0);
});
test('opt-in script adds a single standalone loader and never overrides existing functions',()=>{
 const tag='js/kinto-g16-employee-panel-v1.js?v=20261127-opt-in';
 assert.equal(html.split(tag).length-1,1);
 for(const name of ['saveOrderRow','openOrderDetailsById','sendChatMessage','setOrderStatus','customer_checkout']){
  assert.equal(js.includes(name+'='),false,'Must not override '+name);
 }
});
test('employee panel sends no messages and updates no orders',()=>{
 for(const pattern of ['employee_chat_send_v61','.update(','.insert(','.upsert(','.delete(',
  'fetch(','window.open(','location.replace('])
  assert.equal(js.includes(pattern),false,'Forbidden '+pattern);
 assert.match(js,/kintoG16Preview/);
 assert.match(js,/navigator[.]clipboard/);
 assert.match(js,/requiresEmployeeSend|KintoG16EmployeeInstructionsReadV1/);
});
