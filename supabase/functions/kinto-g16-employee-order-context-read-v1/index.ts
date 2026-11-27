// KINTO G16 — read-only employee-to-order/customer eligibility proof.
// REVIEW ONLY. No price arithmetic, no payment writes, no invoice mutation.
// This is NOT a final invoice quote; receiving this proof must NEVER enable
// transferring an amount until a separately trusted invoice provider exists.
import {createClient} from 'npm:@supabase/supabase-js@2';
const permittedOrigins=(Deno.env.get('KINTO_G16_ORDER_CONTEXT_ALLOWED_ORIGINS')||'')
 .split(',').map(x=>x.trim()).filter(Boolean);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowedStates=new Set(['تمت الموافقة - بانتظار الدفع','تمت الموافقة']);
const currencies=new Set(['IQD','USD']);
function output(status:number,data:unknown,origin:string){
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store',
  'Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(permittedOrigins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 return new Response(JSON.stringify(data),{status,headers});
}
Deno.serve(async request=>{
 const origin=request.headers.get('origin')||'';
 if(Deno.env.get('KINTO_G16_ORDER_CONTEXT_APPROVED')!=='true')
  return output(503,{ok:false,error:'FEATURE_DISABLED'},origin);
 if(!permittedOrigins.length||!permittedOrigins.includes(origin))
  return output(403,{ok:false,error:'ORIGIN_DENIED'},origin);
 if(request.method==='OPTIONS')return output(204,{ok:true},origin);
 if(request.method!=='POST')return output(405,{ok:false,error:'METHOD_DENIED'},origin);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return output(503,{ok:false,error:'SERVER_UNCONFIGURED'},origin);
 let body:Record<string,unknown>;
 try{
  const raw=await request.text();
  if(raw.length>2048)return output(413,{ok:false,error:'BODY_TOO_LARGE'},origin);
  const value:unknown=JSON.parse(raw);
  if(!value||Array.isArray(value)||typeof value!=='object')
   return output(400,{ok:false,error:'BAD_BODY'},origin);
  body=value as Record<string,unknown>;
 }catch{return output(400,{ok:false,error:'BAD_BODY'},origin)}
 if(body.action!=='read_approved_order_context')return output(400,{ok:false,error:'BAD_ACTION'},origin);
 const token=body.session_token,orderId=body.order_id;
 if(typeof token!=='string'||token.length<20||token.length>512)
  return output(401,{ok:false,error:'EMPLOYEE_SESSION_REQUIRED'},origin);
 if(typeof orderId!=='string'||!uuid.test(orderId))
  return output(400,{ok:false,error:'ORDER_ID_INVALID'},origin);
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:actor,error:authError}=await sb.rpc('employee_session_identity_v143',{p_session_token:token});
  const role=String(actor?.employee?.role||'').trim().toLowerCase();
  if(authError||actor?.ok!==true||!['employee','موظف'].includes(role))
   return output(403,{ok:false,error:'EMPLOYEE_DENIED'},origin);
  const {data:order,error:orderError}=await sb.from('orders')
   .select('id,order_code,customer_id,status,currency,delivery_payment_type')
   .eq('id',orderId).maybeSingle();
  if(orderError)return output(503,{ok:false,error:'ORDER_READ_UNAVAILABLE'},origin);
  if(!order)return output(404,{ok:false,error:'ORDER_NOT_FOUND'},origin);
  const status=String(order.status||'').trim(),currency=String(order.currency||'').trim().toUpperCase();
  if(!allowedStates.has(status)||!currencies.has(currency)||!uuid.test(String(order.customer_id||'')))
   return output(409,{ok:false,error:'ORDER_NOT_ELIGIBLE'},origin);
  if(!['cod_full','product_paid_delivery_cod','paid_prepaid'].includes(String(order.delivery_payment_type||'')))
   return output(409,{ok:false,error:'PAYMENT_TYPE_NOT_SUPPORTED'},origin);
  return output(200,{ok:true,order:{id:order.id,code:order.order_code,customer_id:order.customer_id,
   status,currency,delivery_payment_type:order.delivery_payment_type},
   invoiceAmountAuthorized:false,invoiceRevisionAuthorized:false,canSendInstructions:false});
 }catch{return output(503,{ok:false,error:'ORDER_CONTEXT_UNAVAILABLE'},origin)}
});
