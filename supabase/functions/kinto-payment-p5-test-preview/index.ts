import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const page = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>KINTO Payment-P5 isolated test</title><style>
*{box-sizing:border-box}body{margin:0;background:#f4f6f3;color:#19382d;font:15px system-ui,Arial}.wrap{max-width:850px;margin:24px auto;padding:16px}.card{background:#fff;border:1px solid #d8e1d8;border-radius:18px;padding:18px;margin:14px 0;box-shadow:0 8px 24px #0a2f2312}header{background:#0a2f23;color:#f5de8b;border-radius:16px;padding:18px}.warning{background:#fff6d8;color:#594a14;border:1px solid #e2c965;padding:12px;border-radius:12px;line-height:1.6}label{display:block;font-weight:800;margin:14px 0 6px}input,textarea,select{width:100%;padding:10px;border:1px solid #bdcbbf;border-radius:9px;font:inherit}textarea{min-height:95px;direction:ltr;text-align:left}button{background:#0a2f23;color:#f5de8b;border:0;border-radius:9px;padding:11px 14px;font-weight:800;margin:5px;cursor:pointer}button.secondary{background:#edf2ed;color:#183b2d;border:1px solid #ced8ce}.buttons{display:flex;flex-wrap:wrap;gap:5px}.result{white-space:pre-wrap;direction:ltr;text-align:left;background:#101c18;color:#e4f3e9;padding:14px;border-radius:12px;max-height:440px;overflow:auto;font:12px ui-monospace,monospace}.small{color:#64756b;font-size:12px}
</style><body><main class="wrap"><header><strong>KINTO • Payment-P5</strong><h1>معاينة اختبار معزولة</h1></header><section class="card warning">هذه الصفحة مخصصة لمشروع KINTO-Payment-Test فقط. المحاكي لا يرسل طلبات إلى شركة دفع ولا يجمع أموالاً. لا تستخدم بيانات عميل حقيقية. لا تغلق حالة «جارٍ التحقق» حتى يحسمها الخادم.</section>
<section class="card"><label for="session">رمز جلسة عميل الاختبار</label><input id="session" autocomplete="off" spellcheck="false"><label for="kind">مسار الاختبار</label><select id="kind"><option value="cart">السلة</option><option value="campaign">عرض مباشر (يتطلب معرّف حملة اختبار)</option></select><label for="campaign">معرّف حملة مباشر</label><input id="campaign" placeholder="UUID من حملة الاختبار"><label for="items">عناصر المنتجات (JSON خاضع للتحقق الخادمي)</label><textarea id="items">[{"store_id":"22222222-2222-4222-8222-222222222222","product_id":"33333333-3333-4333-8333-333333333332","quantity":1,"selected_options":{"color":"red","size":"large"}}]</textarea><label for="coupons">قسائم لكل متجر كنقاط (العروض المباشرة ترفضها خادمياً)</label><textarea id="coupons">{}</textarea><div class="buttons"><button data-action="mode">قراءة وضع الدفع</button><button data-action="quote">مراجعة وتسعير السلة</button><button data-action="reserve">حجز وبدء المحاولة</button></div></section>
<section class="card"><label for="attempt">معرّف المحاولة (يُملأ بعد الحجز)</label><input id="attempt"><label for="scenario">نتيجة المحاكي</label><select id="scenario"><option value="success">نجاح تجريبي</option><option value="failure">رفض</option><option value="cancel">إلغاء</option><option value="disconnect">انقطاع / مجهول</option></select><div class="buttons"><button data-action="simulate">إرسال النتيجة للمحاكي الخادمي</button><button class="secondary" data-action="status">استعلام الحالة</button><button class="secondary" data-action="list">مدفوعاتي · صفحة 1</button><button class="secondary" data-action="prev">الدفعة السابقة</button><button class="secondary" data-action="next">الدفعة التالية</button></div></section><section class="card"><h2>استجابة الخادم</h2><pre class="result" id="out">جاهز</pre></section></main>
<script>
const url='https://udtegahgxgqvflodjkjt.supabase.co',key='sb_publishable_KOdceuz9V-tRoIoxD3FjUA_4FoXbBNT';let idempotency=crypto.randomUUID(),paymentsPage=1;
const $=s=>document.querySelector(s),out=v=>$('#out').textContent=JSON.stringify(v,null,2),session=()=>$('#session').value.trim();
async function call(action,extra={}){if(!session())throw Error('أدخل جلسة عميل الاختبار');const r=await fetch(url+'/functions/v1/kinto-payment-p5',{method:'POST',headers:{'Content-Type':'application/json',apikey:key,Authorization:'Bearer '+key},body:JSON.stringify({action,session_token:session(),...extra})});const j=await r.json();if(!r.ok||!j.ok)throw Error(JSON.stringify(j));return j.data}
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{let result;const items=JSON.parse($('#items').value),coupon_points=JSON.parse($('#coupons').value),attempt_id=$('#attempt').value.trim(),campaign=$('#campaign').value.trim();switch(b.dataset.action){case'mode':result=await call('mode');break;case'quote':result=await call('quote',{items,coupon_points});break;case'reserve':result=await call($('#kind').value==='campaign'?'campaign_reserve':'reserve',{items,coupon_points,campaign_id:campaign,idempotency_key:idempotency});$('#attempt').value=result.attempt_id;result.started=await call('start',{attempt_id:result.attempt_id});break;case'simulate':result=await call('simulate',{attempt_id,scenario:$('#scenario').value,shipping:{}});break;case'status':result=await call('status',{attempt_id});break;case'prev':paymentsPage=Math.max(1,paymentsPage-1);result=await call('list',{page:paymentsPage});break;case'next':paymentsPage++;result=await call('list',{page:paymentsPage});break;case'list':paymentsPage=1;result=await call('list',{page:paymentsPage});break}out(result)}catch(e){out({error:String(e.message||e)})}finally{b.disabled=false}});
</script></body></html>`;

Deno.serve((request: Request) => {
  if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
  return publishAndServePage();
});

async function publishAndServePage() {
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey)return new Response("Test preview is unavailable",{status:503});
  const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const bucket="kinto-payment-p5-preview";
  const created=await db.storage.createBucket(bucket,{public:true,fileSizeLimit:262144,allowedMimeTypes:["text/html"]});
  if(created.error&&!/already exists|duplicate/i.test(created.error.message))return new Response("Test preview setup failed",{status:503});
  const storage=db.storage.from(bucket),listed=await storage.list("",{limit:10,search:"preview.html"});
  if(listed.error)return new Response("Test preview lookup failed",{status:503});
  if(!listed.data?.some(file=>file.name==="preview.html")){
    const uploaded=await storage.upload("preview.html",page,{contentType:"text/html",upsert:false,cacheControl:"60"});
    if(uploaded.error)return new Response("Test preview publish failed",{status:503});
  }
  // Serve the page from the test Edge Function itself. The Storage CDN can
  // override the object's MIME type to text/plain in some environments.
  return new Response(page,{status:200,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex, nofollow","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https://udtegahgxgqvflodjkjt.supabase.co; img-src data: https:; base-uri 'none'; form-action 'none'"}});
}
