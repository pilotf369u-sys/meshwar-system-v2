'use strict';
const policy='إرسال الطلب لا يعني شراء المنتج أو حجزه. يُنفّذ الشراء بعد تأكيد سداد المبلغ، وبحسب توفر المنتج وخياراته وسعره وقت التنفيذ. تخضع إمكانية الشحن وتكلفته لمراجعة الموظف.';
const states={review:'قيد المراجعة',quoted:'بانتظار موافقتك والدفع',transfer_pending:'التحويل قيد التحقق',paid:'تم تأكيد التسديد — بانتظار الشراء',purchased:'تم الطلب من المتجر',shipping:'تم الشحن',delivered:'تم التسليم',rejected:'تعذر قبول الطلب',cancelled:'ملغي',refund_pending:'بانتظار الاسترداد',refunded:'تم تسجيل الاسترداد'};
// Parse decimal text exactly; PostgreSQL numeric can serialize harmless trailing zeros.
function moneyCents(value){const m=/^(\d{1,15})(?:\.(\d+))?$/.exec(String(value));if(!m)return null;const f=(m[2]||'').replace(/0+$/,'');if(f.length>2)return null;return BigInt(m[1])*100n+BigInt(f.padEnd(2,'0'));}
function centsText(cents){return (cents/100n).toString()+(cents%100n?'.'+(cents%100n).toString().padStart(2,'0'):'');}
function moneyText(value){const c=moneyCents(value);return c===null?'—':centsText(c);}
function quoteTotal(goods,shipping){const a=moneyCents(goods),b=moneyCents(shipping);return a===null||b===null?null:centsText(a+b);}
function stage(o){return o.state==='purchased'&&o.purchase?.shipping_requested_at?'preparing':o.state;}
function stateLabel(o){return stage(o)==='preparing'?'طلب تجهيز الشحن':states[o.state]||o.state;}
function quoteDefaults(o){try{const list=o.estimates||[];if(!list.length||new Set(list.map(x=>x.currency)).size!==1)return null;const currency=list[0].currency;let cents=0n;for(const x of list){const c=moneyCents(x.amount);if(c===null)return null;cents+=c;}const expiry=new Date(Date.now()+24*3600000);const local=new Date(expiry.getTime()-expiry.getTimezoneOffset()*60000).toISOString().slice(0,16);const goods=o.quote?.goods!==undefined?moneyText(o.quote.goods):centsText(cents);if(goods==='—')return null;return{goods,currency:o.quote?.currency||currency,expires:local};}catch{return null;}}
if(typeof module!=='undefined')module.exports={policy,states,quoteDefaults,moneyText,quoteTotal,stage,stateLabel};
if(typeof window!=='undefined')window.KintoWorldCore={policy,states,quoteDefaults,moneyText,quoteTotal,stage,stateLabel};
