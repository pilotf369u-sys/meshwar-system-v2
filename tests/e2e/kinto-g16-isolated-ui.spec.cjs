const {test,expect}=require('@playwright/test');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const ORDER='11111111-2222-3333-4444-555555555555';
const CARD='22222222-3333-4444-5555-666666666666';
let server,port;
test.beforeAll(async()=>{
 server=http.createServer((req,res)=>{
  const pathname=String(new URL(req.url||'/', 'http://localhost').pathname);
  if(pathname.startsWith('/js/kinto-g16-')&&pathname.endsWith('.js')){
   const source=path.join(root,pathname.slice(1));
   if(!source.startsWith(path.join(root,'js')+path.sep)){res.writeHead(403);res.end();return}
   try{res.writeHead(200,{'content-type':'application/javascript'});
    res.end(fs.readFileSync(source))}catch{res.writeHead(404);res.end()}
   return;
  }
  if(pathname==='/employee-dashboard.html'){
   res.writeHead(200,{'content-type':'text/html; charset=utf-8'});
   res.end(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"></head><body>
<script>
let cloudOrders=[{id:'${ORDER}',order_code:'KN-000160',
 status:'تمت الموافقة - بانتظار الدفع',delivery_payment_type:'paid_prepaid'}];
window.__g16Test={changed:false,invocations:[],clipboard:[]};
function employeeChatTokenV61(){return 'x'.repeat(40)}
async function ensureEmployeeSupabase(){return {functions:{invoke:async(name,request)=>{
 const b=request.body;window.__g16Test.invocations.push({name,action:b.action});
 if(name==='kinto-g16-employee-manual-cards-read-v1')return {data:{ok:true,cards:[{
  id:'${CARD}',label:'بطاقة معتمدة للتجربة',provider:'مصرف تجريبي',
  recipient_name:'مستفيد تجريبي',account_reference:'TEST-12345',method_type:'manual',
  is_enabled:true,destination_verified_at:'2026-11-27T10:00:00Z'
 }]},error:null};
 if(name==='kinto-g16-employee-instructions-read-v1'){
  const amount=window.__g16Test.changed?240000:233000;
  const account=window.__g16Test.changed?'ALTERED-ACCOUNT':'TEST-12345';
  return {data:{ok:true,orderCode:'KN-000160',mode:b.mode,
   message:'KINTO | تسديد الطلب KN-000160\\nالمبلغ المعتمد '+amount+' IQD\\nالحساب '+account,
   card:{id:'${CARD}',method_type:'manual',is_enabled:true,provider:'مصرف تجريبي',
    label:'بطاقة معتمدة للتجربة',recipient_name:'مستفيد تجريبي',account_reference:account,
    destination_verified_at:'2026-11-27T10:00:00Z'},
   invoice:{orderCode:'KN-000160',version:'2026-11-27T10:00:00Z',
    currency:'IQD',amountMinor:amount,prepaidMinor:amount,goodsMinor:218000,
    deliveryDueMinor:15000,source:'server_readonly_v94_parity',serverVerified:true,
    orderEligible:true,amountIncluded:true,mode:b.mode},
   amountMinor:amount,currency:'IQD',amountIncluded:true,requiresEmployeeSend:true,
   paymentConfirmed:false,changesOrder:false},error:null}
 }
 return {error:{message:'UNKNOWN_ENDPOINT'},data:null}
 }}}
}
</script><script src="/js/kinto-g16-employee-panel-v1.js"></script></body></html>`);
   return;
  }
  res.writeHead(404);res.end();
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 port=server.address().port;
});
test.afterAll(async()=>{if(server)await new Promise(r=>server.close(r))});
test('off by default, never inserts controls or invokes Supabase',async({page})=>{
 await page.goto(`http://127.0.0.1:${port}/employee-dashboard.html`);
 await expect(page.getByText('تعليمات الدفع — اختبار')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__g16Test.invocations)).toEqual([]);
});
test('opens staff instruction panel, reads verified G16 card and approved invoice quote',async({page})=>{
 await page.goto(`http://127.0.0.1:${port}/employee-dashboard.html?kintoG16Preview=1`);
 await page.getByRole('button',{name:'تعليمات الدفع — اختبار'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByRole('button',{name:'تجهيز التعليمات'})).toBeEnabled();
 await page.getByRole('button',{name:'تجهيز التعليمات'}).click();
 await expect(page.locator('textarea')).toHaveValue(/233000 IQD/);
 await expect(page.locator('textarea')).toHaveValue(/TEST-12345/);
 const trace=await page.evaluate(()=>window.__g16Test.invocations);
 expect(trace.map(x=>x.name)).toEqual([
  'kinto-g16-employee-manual-cards-read-v1','kinto-g16-employee-instructions-read-v1']);
});
test('freshness gate refuses old bank instructions if amount or account changed before copy',async({page})=>{
 await page.goto(`http://127.0.0.1:${port}/employee-dashboard.html?kintoG16Preview=1`);
 await page.getByRole('button',{name:'تعليمات الدفع — اختبار'}).click();
 await page.getByRole('button',{name:'تجهيز التعليمات'}).click();
 await page.evaluate(()=>{window.__g16Test.changed=true});
 await page.getByRole('button',{name:'نسخ التعليمات'}).click();
 await expect(page.getByText(/INSTRUCTIONS_STALE_PREPARE_AGAIN/)).toBeVisible();
 await expect(page.getByRole('button',{name:'نسخ التعليمات'})).toBeDisabled();
});
test('exports WebP image only after employee click, without upload or order mutation',async({page})=>{
 await page.goto(`http://127.0.0.1:${port}/employee-dashboard.html?kintoG16Preview=1`);
 await page.getByRole('button',{name:'تعليمات الدفع — اختبار'}).click();
 await page.getByRole('button',{name:'تجهيز التعليمات'}).click();
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'حفظ صورة البطاقة'}).click();
 const download=await downloadPromise;
 expect(download.suggestedFilename()).toMatch(/^kinto-card-.*\.webp$/);
 const trace=await page.evaluate(()=>window.__g16Test.invocations);
 expect(trace.every(x=>x.name.includes('employee-'))).toBeTruthy();
 expect(trace.filter(x=>x.name.includes('instructions')).length).toBe(2);
});
