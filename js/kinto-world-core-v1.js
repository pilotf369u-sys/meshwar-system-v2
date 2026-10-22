'use strict';
const policy='إرسال الطلب لا يعني شراء المنتج أو حجزه. يُنفّذ الشراء بعد تأكيد سداد المبلغ، وبحسب توفر المنتج وخياراته وسعره وقت التنفيذ. تخضع إمكانية الشحن وتكلفته لمراجعة الموظف.';
const states={review:'قيد المراجعة',quoted:'بانتظار موافقتك والدفع',transfer_pending:'التحويل قيد التحقق',paid:'تم تأكيد التسديد — بانتظار الشراء',purchased:'تم الشراء',shipping:'قيد الشحن',delivered:'تم التسليم',rejected:'تعذر قبول الطلب',cancelled:'ملغي',refund_pending:'بانتظار الاسترداد',refunded:'تم تسجيل الاسترداد'};
if(typeof module!=='undefined')module.exports={policy,states};
if(typeof window!=='undefined')window.KintoWorldCore={policy,states};
