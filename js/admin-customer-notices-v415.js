/* V415: isolated admin customer notice composer; never modifies existing notifications. */
(()=>{
'use strict';
const $=id=>document.getElementById(id), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let linkedStores=new Map(),storeRows=[],storePage=1,storeTotal=0,storeSerial=0;
let selected=new Map(),people=[],page=1,total=0,historyPage=1,searchSerial=0,busy=false;
const token=()=>window.KintoAdminSessionV147?.read()?.token||'';
const client=()=>window.ensureCustomerSupabase();
async function peopleLoad(p=1){
 const serial=++searchSerial;page=p;const box=$('acnPeople');box.textContent='جاري التحميل...';
 try{
 const sb=await client(),q=String($('acnSearch').value||'').trim().replace(/[,%()]/g,' ').slice(0,70);
 let req=sb.from('customers').select('id,name,code,phone',{count:'exact'});
 if(q){const term='%'+q+'%';req=req.or('name.ilike.'+term+',code.ilike.'+term+',phone.ilike.'+term)}
 const {data,error,count}=await req.order('id',{ascending:true}).range((p-1)*8,p*8-1);
 if(serial!==searchSerial)return;if(error)throw error;people=data||[];total=count||0;renderPeople();
 }catch(e){if(serial===searchSerial)box.textContent='تعذر تحميل العملاء: '+e.message}
}
function renderPeople(){
 $('acnPeople').innerHTML=people.map(c=>'<label style="display:flex;gap:8px;align-items:center;padding:7px;border-bottom:1px solid #52645c"><input type="checkbox" class="acn-person" value="'+esc(c.id)+'" '+(selected.has(String(c.id))?'checked':'')+'><span>'+esc(c.name||'عميل')+' — '+esc(c.code||c.id)+' — '+esc(c.phone||'')+'</span></label>').join('')||'لا توجد نتائج';
 $('acnSelected').textContent='المحددون: '+selected.size;
 $('acnPeoplePager').textContent='';
 const b=document.createElement('button');b.textContent='السابق';b.disabled=page<=1;b.onclick=()=>peopleLoad(page-1);
 const n=document.createElement('span');n.textContent=' '+page+' / '+Math.max(1,Math.ceil(total/8))+' ';
 const a=document.createElement('button');a.textContent='التالي';a.disabled=page*8>=total;a.onclick=()=>peopleLoad(page+1);
 $('acnPeoplePager').append(b,n,a);
}
async function storeLoad(p=1){
 const serial=++storeSerial;storePage=p;const box=$('acnStoresV420');if(!box)return;
 box.textContent='جاري التحميل...';
 try{
  const sb=await client(),q=String($('acnStoreSearchV420').value||'').trim().replace(/[,%()]/g,' ').slice(0,70);
  let req=sb.from('local_stores').select('id,name',{count:'exact'});
  if(q)req=req.ilike('name','%'+q+'%');
  const {data,error,count}=await req.order('id').range((p-1)*8,p*8-1);
  if(serial!==storeSerial)return;if(error)throw error;
  storeRows=data||[];storeTotal=count||0;
  box.innerHTML=storeRows.map(x=>'<label style="display:flex;gap:8px;padding:6px"><input class="acn-store-v420" type="checkbox" value="'+esc(x.id)+'" '+(linkedStores.has(String(x.id))?'checked':'')+'><span>'+esc(x.name||'متجر')+'</span></label>').join('')||'لا توجد متاجر';
  const nav=$('acnStorePagerV420');nav.textContent='';
  const prev=document.createElement('button');prev.textContent='السابق';prev.disabled=p<=1;prev.onclick=()=>storeLoad(p-1);
  const num=document.createElement('span');num.textContent=' '+p+' / '+Math.max(1,Math.ceil(storeTotal/8))+' ';
  const next=document.createElement('button');next.textContent='التالي';next.disabled=p*8>=storeTotal;next.onclick=()=>storeLoad(p+1);
  nav.append(prev,num,next);
 }catch(e){if(serial===storeSerial)box.textContent='تعذر تحميل المتاجر: '+e.message}
}
async function historyLoad(p=1){
 historyPage=p;try{
 const sb=await client(),{data,error}=await sb.rpc('admin_customer_notices_v415',{p_session_token:token(),p_page:p,p_page_size:8});if(error)throw error;
 $('acnHistory').innerHTML=(data.items||[]).map(n=>'<tr><td>'+esc(n.title)+'<div class="mini">'+esc(n.body)+'</div></td><td>'+esc(n.kind)+'</td><td>'+Number(n.recipients||0)+'</td><td>'+Number(n.read_count||0)+'</td><td>'+esc(new Date(n.created_at).toLocaleString('en-GB'))+'</td><td><button type="button" class="acn-delete" data-id="'+esc(n.id)+'">حذف</button></td></tr>').join('')||'<tr><td colspan="6">لا توجد إشعارات.</td></tr>';
 const nav=$('acnHistoryPager');nav.textContent='';
 const prev=document.createElement('button');prev.textContent='السابق';prev.disabled=p<=1;prev.onclick=()=>historyLoad(p-1);
 const span=document.createElement('span');span.textContent=' '+p+' / '+Math.max(1,Math.ceil(Number(data.total||0)/8))+' ';
 const next=document.createElement('button');next.textContent='التالي';next.disabled=p*8>=Number(data.total||0);next.onclick=()=>historyLoad(p+1);nav.append(prev,span,next);
 }catch(e){$('acnMessage').textContent='تعذر تحميل السجل: '+e.message}
}
async function send(){
 if(busy)return;const all=$('acnAll').checked,title=$('acnTitle').value.trim(),body=$('acnBody').value.trim(),kind=$('acnKind').value;
 if(title.length<2||title.length>160||body.length<2||body.length>4000)return $('acnMessage').textContent='تحقق من العنوان والنص.';
 if(!all&&(!selected.size||selected.size>500))return $('acnMessage').textContent='حدد بين 1 و500 عميل.';
 if(!confirm('تأكيد إرسال الإشعار إلى '+(all?'جميع العملاء':selected.size+' عميل')+'؟'))return;
 busy=true;$('acnSend').disabled=true;$('acnMessage').textContent='جاري الإرسال...';
 try{
 const sb=await client(),{data,error}=await sb.rpc('admin_send_customer_notice_v420',{p_session_token:token(),p_request_key:crypto.randomUUID(),p_title:title,p_body:body,p_kind:kind,p_customer_ids:all?null:[...selected.keys()],p_all_customers:all,p_store_ids:[...linkedStores.keys()]});
 if(error)throw error;$('acnMessage').textContent='تم الإرسال إلى '+data.recipients+' عميل.';selected.clear();linkedStores.clear();$('acnStoreSelectedV420').textContent='المتاجر المحددة: 0';renderPeople();await storeLoad(1);await historyLoad(1);
 }catch(e){$('acnMessage').textContent='فشل الإرسال: '+e.message}finally{busy=false;$('acnSend').disabled=false}
}
window.adminCustomerNoticesLoadV415=()=>Promise.all([peopleLoad(1),historyLoad(1),storeLoad(1)]);
window.addEventListener('DOMContentLoaded',()=>{
 $('acnSearch')?.addEventListener('input',()=>{clearTimeout(window.__acnTimer);window.__acnTimer=setTimeout(()=>peopleLoad(1),250)});
 $('acnPeople')?.addEventListener('change',e=>{if(!e.target.matches('.acn-person'))return;const c=people.find(x=>String(x.id)===e.target.value);if(!c)return;if(e.target.checked)selected.set(String(c.id),c);else selected.delete(String(c.id));$('acnSelected').textContent='المحددون: '+selected.size});
 $('acnStoreSearchV420')?.addEventListener('input',()=>{clearTimeout(window.__acnStoreTimer);window.__acnStoreTimer=setTimeout(()=>storeLoad(1),250)});
 $('acnStoresV420')?.addEventListener('change',e=>{
  if(!e.target.matches('.acn-store-v420'))return;
  const store=storeRows.find(x=>String(x.id)===e.target.value);if(!store)return;
  if(e.target.checked){if(linkedStores.size>=20){e.target.checked=false;$('acnMessage').textContent='الحد الأقصى 20 متجراً.';return}linkedStores.set(String(store.id),store)}
  else linkedStores.delete(String(store.id));
  $('acnStoreSelectedV420').textContent='المتاجر المحددة: '+linkedStores.size;
 });
 $('acnSend')?.addEventListener('click',send);
 $('acnHistory')?.addEventListener('click',async event=>{
 const button=event.target.closest('.acn-delete');if(!button||busy)return;
 const id=button.dataset.id;
 if(!/^[0-9a-f-]{36}$/i.test(id)||!confirm('حذف هذا الإشعار نهائياً من جميع العملاء وسجل القراءة؟'))return;
 busy=true;button.disabled=true;
 try{
 const sb=await client();
 const {data,error}=await sb.rpc('admin_delete_customer_notice_v417',{p_session_token:token(),p_notice_id:id});
 if(error)throw error;
 $('acnMessage').textContent=data?.deleted?'حُذف الإشعار ومستلموه.':'الإشعار محذوف مسبقاً.';
 await historyLoad(1);
 }catch(e){$('acnMessage').textContent='تعذر الحذف: '+e.message;button.disabled=false}
 finally{busy=false}
 });
 $('acnAll')?.addEventListener('change',e=>{$('acnPicker').hidden=e.target.checked});
});
})();
