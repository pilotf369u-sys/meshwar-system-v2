/* Branch collection display projection only; saved payment type and edit payloads stay intact. */
(()=>{
'use strict';
async function prepare(rows){
 if(!rows.length)return rows;
 try{
  const token=window.KintoBranchSessionV148?.read?.()?.token;
  if(!token)throw Error('BRANCH_SESSION_REQUIRED');
  const c=await getSb(),paid=new Set();
  for(let offset=0;offset<rows.length;offset+=100){
   const {data,error}=await c.rpc('branch_paid_collection_orders_v1',{
    p_session_token:String(token),p_order_ids:rows.slice(offset,offset+100).map(o=>o.id)});
   if(error)throw error;
   if(!Array.isArray(data))throw Error('BRANCH_PAYMENT_PROOF_INVALID');
   data.forEach(row=>paid.add(String(row.order_id)));
  }
  return rows.map(o=>({...o,_branchPaidGoodsV1:paid.has(String(o.id)),_branchCollectionUnknownV1:false}));
 }catch(error){
  console.warn('Branch collection verification unavailable',error);
  return rows.map(o=>({...o,_branchPaidGoodsV1:false,_branchCollectionUnknownV1:!['paid_prepaid','product_paid_delivery_cod'].includes(o.delivery_payment_type)}));
 }
}
function type(o){return o?.delivery_payment_type==='paid_prepaid'?'paid_prepaid':o?._branchPaidGoodsV1?'product_paid_delivery_cod':o?.delivery_payment_type||'cod_full'}
function status(o){
 if(o?._branchCollectionUnknownV1)return 'تعذر التحقق من الدفع — لا تحصّل المبلغ قبل التحقق';
 return ({cod_full:'غير مدفوع — حصّل المبلغ الموضح',product_paid_delivery_cod:'البضاعة مدفوعة إلكترونياً — حصّل أجرة التوصيل فقط',paid_prepaid:'مدفوع بالكامل — لا تحصّل أي مبلغ'})[type(o)]||'غير مدفوع — حصّل المبلغ الموضح';
}
window.KintoBranchCollectionV1=Object.freeze({prepare,type,status});
})();
