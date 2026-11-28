/* KINTO customer payment instruction formatter — pure, isolated, NO network.
 * Takes an already-approved invoice quote. Never computes a sale price or changes status.
 */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.KintoManualPaymentMessageV1=api;})(typeof globalThis!=='undefined'?globalThis:null,function(){
'use strict';
const MODES=Object.freeze(['card_full','goods_now_shipping_cod','full_cod']);
const reassurance='تسوّق بثقة مع KINTO 💚\n\nعزيزي العميل، حرصاً على راحتك وأمانك، نوفر لك بيانات التحويل المعتمدة من إدارة KINTO مباشرة.\n\nيرجى إتمام التحويل بعد مطابقة اسم ورقم الحساب عند التحويل.\n\nلن نطلب منك مطلقاً كلمة المرور أو الرقم السري أو رمز التحقق الخاص بحسابك المصرفي.\n\nبعد إتمام التحويل، أرسل إشعار العملية، وسيتولى فريقنا مراجعة وصول المبلغ وتأكيد تسديد طلبك.\n\nKINTO — راحتك وثقتك أولويتنا.';
function money(amount,currency){
 if(!Number.isSafeInteger(amount)||amount<0||!['IQD','USD'].includes(currency))throw Error('INVALID_APPROVED_INVOICE_AMOUNT');
 return new Intl.NumberFormat('en-US',{minimumFractionDigits:currency==='USD'?2:0,maximumFractionDigits:currency==='USD'?2:0}).format(amount/(currency==='USD'?100:1))+' '+currency;
}
function compose(input){
 const mode=String(input?.mode||'');if(!MODES.includes(mode))throw Error('INVALID_PAYMENT_MODE');
 const orderCode=String(input?.approvedInvoice?.orderCode||'').trim();
 if(!/^(?:KN|MW)-[0-9]{4,12}$/.test(orderCode))throw Error('INVALID_ORDER_CODE');
 const currency=input.approvedInvoice.currency;
 const full=input.approvedInvoice.prepaidMinor;
 const goods=input.approvedInvoice.goodsMinor;
 const shipping=input.approvedInvoice.deliveryDueMinor;
 // Amounts are read from the approved invoice supplied by server authorization.
 // Never derive an amount from cart state, product prices or the pricing calculator.
 if(![full,goods,shipping].every(Number.isSafeInteger)||[full,goods,shipping].some(n=>n<0))throw Error('MISSING_APPROVED_INVOICE_BREAKDOWN');
 const transfer=mode!=='full_cod';
 const chosen=transfer?(mode==='card_full'?full:goods):0;
 if(transfer&&chosen<=0)throw Error('ZERO_TRANSFER_AMOUNT');
 const card=input.card;
 if(transfer&&(!card||!card.id||!card.account_reference||!card.recipient_name))throw Error('APPROVED_CARD_REQUIRED');
 const title='KINTO | تسديد الطلب '+orderCode;
 if(!transfer){
  return Object.freeze({title,mode,requiresCard:false,amountMinor:0,currency,
   text:'مرحباً من KINTO، تمت الموافقة على طلبكم '+orderCode+'.\nتم اختيار الدفع الكامل عند الباب. يرجى مراجعة المبلغ الواجب تحصيله مع الفاتورة المعتمدة عند التسليم.\nKINTO — راحتك وثقتك أولويتنا.'});
 }
 let text='مرحباً من KINTO، تمت الموافقة على طلبكم '+orderCode+'.\n';
 text+='طريقة الدفع: '+(mode==='card_full'?'تحويل إلى البطاقة المصرفية.':'دفع المنتجات الآن والشحن عند الباب.')+'\n';
 text+='المبلغ المطلوب تحويله الآن: '+money(chosen,currency)+'.\n';
 if(mode==='goods_now_shipping_cod')text+='الشحن المستحق عند الباب: '+money(shipping,currency)+'.\n';
 text+='البطاقة المعتمدة: '+String(card.label||'بطاقة التحويل')+'.\n';
 text+='اسم الحساب: '+String(card.recipient_name)+'.\n';
 text+='رقم التحويل: '+String(card.account_reference)+'.\n\n'+reassurance;
 return Object.freeze({title,mode,requiresCard:true,amountMinor:chosen,currency,cardId:String(card.id),text});
}
return Object.freeze({compose,money,reassurance,MODES});
});
