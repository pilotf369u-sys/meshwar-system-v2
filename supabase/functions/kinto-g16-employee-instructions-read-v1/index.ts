// KINTO G16 employee bank instructions — usable read-only service / REVIEW ONLY.
// Approved current order finance is projected server-side using the
// conservative read-only V94 invoice-parity adapter. Unsupported cases block.
// Employee manually copies/sends the verified text.
// DOES NOT send automatically, modify checkout, mark paid, or deduct inventory.
import {createClient} from 'npm:@supabase/supabase-js@2';
import {derive} from '../_shared/kinto-g16-invoice-quote-v1.mjs';
const origins=(Deno.env.get('KINTO_G16_INSTRUCTIONS_ALLOWED_ORIGINS')||'')
 .split(',').map(x=>x.trim()).filter(Boolean);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const code=/^(?:KN|MW)-[0-9]{4,12}$/;
const statusAllowed=new Set(['تمت الموافقة - بانتظار الدفع','تمت الموافقة']);
const modeTypes:Record<string,string>={
 card_full:'paid_prepaid',goods_now_shipping_cod:'product_paid_delivery_cod',full_cod:'cod_full'
};
const reassurance='تسوّق بثقة مع KINTO 💚\nعزيزي العميل، حرصاً على راحتك وأمانك، نوفر لك بيانات التحويل المعتمدة من إدارة KINTO مباشرة.\nيرجى مطابقة اسم ورقم الحساب قبل التحويل.\nلن نطلب مطلقاً كلمة المرور أو الرقم السري أو رمز التحقق الخاص بحسابك المصرفي.\nبعد إتمام التحويل، أرسل إشعار العملية وسيتولى فريقنا مراجعة وصول المبلغ وتأكيد تسديد طلبك.\nKINTO — راحتك وثقتك أولويتنا.';
function reply(status:number,payload:unknown,origin:string){
 const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store',
  'Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info',
  'Access-Control-Allow-Methods':'POST,OPTIONS'};
 if(origins.includes(origin))headers['Access-Control-Allow-Origin']=origin;
 return new Response(JSON.stringify(payload),{status,headers});
}
function formatted(amount:number,currency:string){
 return new Intl.NumberFormat('en-US',{
  minimumFractionDigits:currency==='USD'?2:0,
  maximumFractionDigits:currency==='USD'?2:0
 }).format(amount/(currency==='USD'?100:1))+' '+currency;
}
function clean(v:unknown,max:number){
 if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000-\u001f\u007f]/.test(v))throw Error('INVALID_ACCOUNT_DATA');
 return v.trim();
}
Deno.serve(async req=>{
 const origin=req.headers.get('origin')||'';
 if(Deno.env.get('KINTO_G16_INSTRUCTIONS_APPROVED')!=='true')
  return reply(503,{ok:false,error:'FEATURE_DISABLED'},origin);
 if(!origins.length||!origins.includes(origin))
  return reply(403,{ok:false,error:'ORIGIN_DENIED'},origin);
 if(req.method==='OPTIONS')return reply(204,{ok:true},origin);
 if(req.method!=='POST')return reply(405,{ok:false,error:'METHOD_DENIED'},origin);
 const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)return reply(503,{ok:false,error:'UNCONFIGURED'},origin);
 let body:Record<string,unknown>;
 try{
  const data=await req.text();
  if(data.length>2048)return reply(413,{ok:false,error:'BODY_TOO_LARGE'},origin);
  const value:unknown=JSON.parse(data);
  if(!value||Array.isArray(value)||typeof value!=='object')
   return reply(400,{ok:false,error:'BAD_BODY'},origin);
  body=value as Record<string,unknown>;
 }catch{return reply(400,{ok:false,error:'BAD_BODY'},origin)}
 if(body.action!=='prepare_manual_instructions')return reply(400,{ok:false,error:'BAD_ACTION'},origin);
 const session=body.session_token,orderId=body.order_id,mode=body.mode;
 if(typeof session!=='string'||session.length<20||session.length>512)
  return reply(401,{ok:false,error:'SESSION_REQUIRED'},origin);
 if(typeof orderId!=='string'||!uuid.test(orderId))
  return reply(400,{ok:false,error:'ORDER_ID_INVALID'},origin);
 if(typeof mode!=='string'||!Object.hasOwn(modeTypes,mode))
  return reply(400,{ok:false,error:'MODE_INVALID'},origin);
 const sb=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:actor,error:ae}=await sb.rpc('employee_session_identity_v143',{p_session_token:session});
  if(ae||actor?.ok!==true||!['employee','موظف'].includes(String(actor?.employee?.role||'').trim().toLowerCase()))
   return reply(403,{ok:false,error:'EMPLOYEE_DENIED'},origin);
  const {data:order,error:oe}=await sb.from('orders')
   .select('id,order_code,status,customer_id,currency,delivery_payment_type,created_at,details,total_price,external_shipping_fee,external_shipping_currency,delivery_fee,delivery_currency,shipping_snapshot,reward_discount_amount,reward_discount_currency,reward_discount_snapshot,kinto_campaign_discount_amount,kinto_campaign_discount_currency,kinto_campaign_discount_snapshot')
   .eq('id',orderId).maybeSingle();
  if(oe||!order)return reply(404,{ok:false,error:'ORDER_NOT_AVAILABLE'},origin);
  if(!statusAllowed.has(String(order.status||'').trim())||
   !uuid.test(String(order.customer_id||''))||!code.test(String(order.order_code||''))||
   !['USD','IQD'].includes(String(order.currency||'').trim().toUpperCase())||
   order.delivery_payment_type!==modeTypes[mode])
   return reply(409,{ok:false,error:'ORDER_NOT_ELIGIBLE'},origin);
  let quote;
  try{quote=derive(order,mode)}catch(e){
   const reason=String(e instanceof Error?e.message:'INVOICE_UNAVAILABLE');
   const safe=/^[A-Z_]{5,80}$/.test(reason)?reason:'INVOICE_UNAVAILABLE';
   return reply(422,{ok:false,error:'INVOICE_QUOTE_NOT_VERIFIED',reason:safe},origin);
  }
  if(mode==='full_cod'){
   if(body.card_id!=null&&body.card_id!=='')return reply(400,{ok:false,error:'CARD_NOT_ALLOWED'},origin);
   const msg='KINTO | تسديد الطلب '+order.order_code+'\nتم اختيار الدفع الكامل عند الباب.\nالمبلغ المعتمد عند الباب: '+formatted(quote.prepaidMinor,quote.currency)+'\nKINTO — راحتك وثقتك أولويتنا.';
   return reply(200,{ok:true,orderCode:order.order_code,mode,message:msg,
    invoice:quote,amountMinor:0,currency:quote.currency,amountIncluded:true,
    requiresEmployeeSend:true,paymentConfirmed:false,changesOrder:false});
  }
  const cardId=body.card_id;
  if(typeof cardId!=='string'||!uuid.test(cardId))
   return reply(400,{ok:false,error:'CARD_ID_INVALID'},origin);
  const {data:card,error:ce}=await sb.from('kinto_payment_methods_g16')
   .select('id,method_type,is_enabled,destination_verified_at,label,provider,recipient_name,account_reference')
   .eq('id',cardId).maybeSingle();
  if(ce||!card||card.method_type!=='manual'||card.is_enabled!==true||
   !card.destination_verified_at)
   return reply(403,{ok:false,error:'CARD_NOT_VERIFIED'},origin);
  const bank=clean(card.provider,80),label=clean(card.label,100);
  const recipient=clean(card.recipient_name,100),account=clean(card.account_reference,150);
  const subject=mode==='card_full'?'تحويل كامل إلى البطاقة المصرفية':'دفع المنتجات الآن والشحن عند الباب';
  const msg='KINTO | تسديد الطلب '+order.order_code+'\n'+
   'طريقة التسديد: '+subject+'\n'+
   'المبلغ المطلوب تحويله الآن: '+formatted(quote.amountMinor,quote.currency)+'\n'+
   (mode==='goods_now_shipping_cod'?'الشحن المستحق عند الباب: '+formatted(quote.deliveryDueMinor,quote.currency)+'\n':'')+
   'البطاقة المعتمدة: '+label+' — '+bank+'\n'+
   'اسم الحساب: '+recipient+'\nرقم التحويل: '+account+'\n\n'+reassurance;
  return reply(200,{ok:true,orderCode:order.order_code,mode,
   card:{id:card.id,label,provider:bank,recipient_name:recipient,account_reference:account,
    method_type:'manual',is_enabled:true,destination_verified_at:card.destination_verified_at},
   message:msg,invoice:quote,amountMinor:quote.amountMinor,currency:quote.currency,
   amountIncluded:true,requiresEmployeeSend:true,
   paymentConfirmed:false,changesOrder:false});
 }catch{return reply(503,{ok:false,error:'INSTRUCTIONS_UNAVAILABLE'},origin)}
});
