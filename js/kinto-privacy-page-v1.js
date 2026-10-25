(function(){'use strict';function start(){
 const client=window.KintoPrivacyV1,root=document.getElementById('secureDeletion');if(!client||!root)return;
 const state=root.querySelector('[role=status]'),list=root.querySelector('[data-requests]'),check=root.querySelector('[type=checkbox]'),send=root.querySelector('[data-request]');
 const update=document.createElement('button');update.type='button';update.textContent='تحديث حالة طلب الحذف';update.setAttribute('data-refresh-deletion','');list.before(update);
 const labels={pending:'بانتظار التحقق',verified:'تم التحقق — بانتظار المعالجة',manual_review:'تحتاج مراجعة البيانات المرتبطة',cancelled:'أُلغي الطلب',deleted:'تحتاج مراجعة تأكيد اكتمال الحذف'};
 let loading=false,active=false;
 function buttons(){send.disabled=loading||active;check.disabled=loading||active;send.hidden=active;const label=check.closest('label');if(label)label.hidden=active;update.disabled=loading;}
 function describe(x){if(x.account_deleted===true&&x.stage==='completed')return'اكتمل حذف الحساب';if(x.processing_started===true)return'بدأت معالجة طلب الحذف — لم يكتمل حذف الحساب بعد';return labels[x.status]||'قيد المراجعة';}
 async function refresh(){if(loading)return;loading=true;buttons();try{
  const rows=await client.rpc('kinto_deletion_progress_v1',{});active=rows.some(x=>['pending','verified','manual_review'].includes(x.status));list.replaceChildren();
  for(const x of rows){const item=document.createElement('article'),title=document.createElement('p');title.textContent='طلب '+x.id.slice(0,8)+' — '+describe(x);item.append(title);
   if(x.retention_review_required){const p=document.createElement('p');p.textContent='بعض البيانات تحتاج مراجعة قرار الاحتفاظ. هذا ليس تأكيداً لاكتمال الحذف أو موعداً للحذف التلقائي.';item.append(p)}
   if(x.cancellation_allowed===true){const cancel=document.createElement('button');cancel.type='button';cancel.textContent='إلغاء طلب الحذف';cancel.onclick=async()=>{if(loading)return;loading=true;buttons();cancel.disabled=true;try{await client.rpc('kinto_deletion_request_v1',{p_action:'cancel'});loading=false;await refresh()}catch(e){state.textContent=e.message;loading=false;await refresh()}finally{loading=false;buttons();cancel.disabled=false}};item.append(cancel)}
   else if(['pending','verified','manual_review'].includes(x.status)){const p=document.createElement('p');p.textContent='بدأت المعالجة؛ تواصل مع الدعم لمتابعة الطلب. لا يمكن إلغاء بيانات حُذفت بالفعل.';item.append(p)}list.append(item);
  }
 }catch(e){state.textContent=e.message}finally{loading=false;buttons()}}
 send.onclick=async()=>{if(loading||active)return;if(!check.checked){state.textContent='أكّد رغبتك في طلب حذف الحساب أولاً.';return}loading=true;buttons();try{const x=await client.rpc('kinto_deletion_request_v1',{p_action:'request',p_confirm:true});state.textContent='استُلم طلبك '+x.id.slice(0,8)+'. هذا تأكيد استلام الطلب وليس تأكيد إتمام الحذف.';loading=false;await refresh()}catch(e){state.textContent=e.message}finally{loading=false;buttons()}};
 update.onclick=refresh;root.hidden=!client.loggedIn();if(!root.hidden)void refresh();
}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();})();
