/* KINTO G16 opt-in employee panel, isolated from operational workflows.
 * OFF by default: available only via ?kintoG16Preview=1 on employee dashboard.
 * NEVER changes invoice, order status, prices, chat attachments or stock.
 * No auto-send. Actual bank details require server release switches.
 */
(function(root){
 'use strict';
 if(typeof location==='undefined'||new URLSearchParams(location.search).get('kintoG16Preview')!=='1')return;
 if(typeof document==='undefined')return;
 function el(tag,text,props={}){
  const node=document.createElement(tag);
  if(text!=null)node.textContent=text;
  for(const [k,v] of Object.entries(props))node[k]=v;
  return node;
 }
 function addCss(){
  const style=el('style');
  style.textContent='.g16float{position:fixed;right:18px;bottom:24px;z-index:7000;background:#0a2f23;color:#f4d684;border:1px solid #d9b862;border-radius:16px;padding:12px 16px;font-weight:900;cursor:pointer}.g16shade{position:fixed;inset:0;z-index:7001;background:#00150dba;display:grid;place-items:center;padding:12px}.g16panel{direction:rtl;background:#0a2f23;color:#fff;border:1px solid #cbb170;border-radius:20px;max-width:600px;max-height:92vh;overflow:auto;width:100%;padding:18px;font:15px/1.7 Tahoma,sans-serif}.g16panel select,.g16panel textarea,.g16panel button{font:inherit}.g16panel select,.g16panel textarea{width:100%;margin:6px 0 12px;padding:9px;background:#09261c;color:#fff;border:1px solid #71957e;border-radius:10px}.g16panel button{padding:9px 14px;background:#e6c677;color:#082c20;border:0;border-radius:10px;margin:5px;cursor:pointer;font-weight:bold}.g16panel button:disabled{opacity:.5}.g16panel label{display:block;font-weight:bold}.g16panel .g16note{color:#eed691;font-size:13px}';
  document.head.append(style);
 }
 function scripts(){
  const paths=['js/kinto-g16-verified-manual-cards-read-v1.js',
   'js/kinto-g16-employee-instructions-read-v1.js',
   'js/kinto-g16-destination-card-artwork-v1.js'];
  return paths.reduce((prior,src)=>prior.then(()=>new Promise((resolve,reject)=>{
   const script=el('script');script.src=src;script.onload=resolve;
   script.onerror=()=>reject(Error('DEPENDENCY_UNAVAILABLE'));document.head.append(script);
  })),Promise.resolve());
 }
 function currentOrders(){
  const all=typeof cloudOrders!=='undefined'&&Array.isArray(cloudOrders)?cloudOrders:[];
  return all.filter(o=>['تمت الموافقة - بانتظار الدفع','تمت الموافقة'].includes(String(o?.status||'').trim())&&
   ['paid_prepaid','product_paid_delivery_cod','cod_full'].includes(String(o?.delivery_payment_type||''))&&
   /^[a-f0-9-]{36}$/i.test(String(o?.id||'')));
 }
 function modeFor(paymentType){
  return ({paid_prepaid:'card_full',product_paid_delivery_cod:'goods_now_shipping_cod',cod_full:'full_cod'})[paymentType]||'';
 }
 async function open(){
  const shade=el('div',null,{className:'g16shade'}),panel=el('section',null,{className:'g16panel'});
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');
  const header=el('h3','KINTO | تجهيز تعليمات التسديد');
  const note=el('p','معاينة مستقلة — لا تتغير حالة الطلب ولا تُنفّذ حوالة. المبلغ النهائي يُراجع في الفاتورة؛ لا تجرِ التحويل قبل التحقق.',{className:'g16note'});
  const close=el('button','إغلاق');close.type='button';close.onclick=()=>shade.remove();
  const status=el('p','جارٍ التحقق من وسيلة الدفع...', {className:'g16note'});
  const orderLabel=el('label','الطلب الموافق عليه');
  const orderSelect=el('select');orderSelect.setAttribute('aria-label','اختر الطلب');
  const cardLabel=el('label','البطاقة المعتمدة');
  const cardSelect=el('select');cardSelect.setAttribute('aria-label','اختر البطاقة');
  const prepare=el('button','تجهيز التعليمات');prepare.disabled=true;
  const copy=el('button','نسخ التعليمات');copy.disabled=true;
  const artwork=el('button','حفظ صورة البطاقة');artwork.disabled=true;
  const message=el('textarea');message.rows=10;message.readOnly=true;
  panel.append(header,note,close,orderLabel,orderSelect,cardLabel,cardSelect,
   prepare,copy,artwork,message,status);shade.append(panel);document.body.append(shade);
  shade.addEventListener('click',e=>{if(e.target===shade)shade.remove()});
  let verifiedCards=[],last=null;
  const clear=()=>{last=null;message.value='';copy.disabled=true;artwork.disabled=true};
  const orders=currentOrders();
  for(const o of orders){
   const opt=el('option',String(o.order_code||o.id)+' — '+String(o.status));
   opt.value=String(o.id);orderSelect.append(opt);
  }
  function refresh(){
   clear();
   const order=orders.find(x=>String(x.id)===orderSelect.value);
   const mode=order?modeFor(order.delivery_payment_type):'';
   const isCod=mode==='full_cod';
   cardLabel.hidden=isCod;cardSelect.hidden=isCod;
   prepare.disabled=!order||(!isCod&&!verifiedCards.length);
   status.textContent=!order?'لا توجد طلبات موافق عليها في الصفحة الحالية.':isCod?
    'الدفع الكامل عند الباب — لا بطاقة مصرفية.':
    verifiedCards.length?'البطاقات المتحقق منها جاهزة للمعاينة.':'لا توجد بطاقة معتمدة متاحة.';
  }
  orderSelect.addEventListener('change',refresh);
  cardSelect.addEventListener('change',clear);
  prepare.addEventListener('click',async()=>{
   clear();prepare.disabled=true;
   try{
    const order=orders.find(x=>String(x.id)===orderSelect.value);
    if(!order)throw Error('ORDER_MISSING');
    const sb=await ensureEmployeeSupabase();
    const token=employeeChatTokenV61();
    const mode=modeFor(order.delivery_payment_type);
    const result=await root.KintoG16EmployeeInstructionsReadV1.prepare({
     invoke:sb.functions.invoke.bind(sb.functions),employeeSessionToken:token,
     orderId:String(order.id),mode,cardId:mode==='full_cod'?null:cardSelect.value
    });
    last=result;message.value=result.message;copy.disabled=false;
    artwork.disabled=mode==='full_cod';
    status.textContent='تم تجهيز التعليمات من الخادم فقط. الرجاء مراجعتها ثم نسخها. لا يوجد إرسال تلقائي.';
   }catch(e){status.textContent='تعذر التجهيز: '+String(e.message||e)}
   finally{refreshButtons()}
  });
  function refreshButtons(){prepare.disabled=!orders.length||(!verifiedCards.length&&modeFor(orders.find(x=>String(x.id)===orderSelect.value)?.delivery_payment_type)!=='full_cod')}
  copy.addEventListener('click',async()=>{
   if(!last)return;
   try{
    await root.KintoG16EmployeeInstructionsReadV1.copy(last,navigator.clipboard);
    status.textContent='تم النسخ فقط. الصق النص في المحادثة الداخلية أو واتساب بعد مراجعته.';
   }catch(e){status.textContent='تعذر النسخ: '+String(e.message||e)}
  });
  artwork.addEventListener('click',async()=>{
   if(!last?.card)return;
   try{
    const info=await root.KintoG16DestinationCardArtworkV1.create(last.card,{document});
    const local=URL.createObjectURL(info.blob);
    try{const a=el('a');a.download=info.filename;a.href=local;
     document.body.append(a);a.click();a.remove();
    }finally{URL.revokeObjectURL(local)}
    status.textContent='تم حفظ صورة محلية للبطاقة، لم تُرسل للعميل.';
   }catch(e){status.textContent='تعذر حفظ الصورة: '+String(e.message||e)}
  });
  try{
   const sb=await ensureEmployeeSupabase();
   const token=employeeChatTokenV61();
   verifiedCards=await root.KintoG16VerifiedManualCardsReadV1.list({
    invoke:sb.functions.invoke.bind(sb.functions),employeeSessionToken:token});
   for(const card of verifiedCards){const opt=el('option',card.label+' — '+card.provider);
    opt.value=card.id;cardSelect.append(opt)}
   refresh();
  }catch(e){status.textContent='قراءة البطاقات غير متاحة: '+String(e.message||e);
   refreshButtons()}
 }
 function init(){
  addCss();
  const button=el('button','تعليمات الدفع — اختبار',{className:'g16float'});
  button.type='button';button.addEventListener('click',()=>open());
  document.body.append(button);
 }
 const begin=()=>scripts().then(init).catch(()=>{});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',begin,{once:true});
 else begin();
})(typeof window!=='undefined'?window:null);
