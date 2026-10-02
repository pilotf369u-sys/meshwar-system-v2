/* KINTO DEALS G3F: isolated admin moderation panel. No storefront or checkout access. */
(()=>{
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const token=()=>window.KintoAdminSessionV147?.read()?.token||'';
let busy=false,open=false,serial=0;
const rpc=async(name,args)=>{
 const sb=await window.ensureCustomerSupabase();
 const {data,error}=await sb.rpc(name,args);
 if(error)throw error;
 return data;
};
const css=document.createElement('style');
css.textContent='.kd3f{background:#0a2f23;color:#f8f5e9;border-radius:12px;padding:16px;margin:12px 0}.kd3f h2{color:#dec17e}.kd3f button{background:#d6b66b;color:#123226;border-radius:8px;margin:5px;padding:9px}.kd3f button:disabled{opacity:.45}.kd3f textarea{width:100%;min-height:65px;background:#092b21;color:#fff;border:1px solid #8b996f;border-radius:8px;padding:8px}.kd3f .entry{border:1px solid #52735b;padding:12px;border-radius:10px;margin:12px 0}.kd3f .products{display:flex;gap:8px;flex-wrap:wrap}.kd3f .prod{width:150px;background:#153d2e;padding:8px;border-radius:8px}.kd3f .prod img{width:100%;height:90px;object-fit:contain}.kd3f .hero{height:170px;position:relative;overflow:hidden;display:grid;place-items:center}.kd3f .hero img{width:100%;height:100%;object-fit:contain;position:relative}.kd3f .hero img:first-child{position:absolute;inset:0;object-fit:cover;filter:blur(16px);opacity:.4}.kd3f .message{white-space:pre-wrap;color:#f4d28c}';
document.head.append(css);
function el(tag,textValue){const x=document.createElement(tag);if(textValue!==undefined)x.textContent=String(textValue);return x}
function detailCard(parent,d){
 const detail=el('div');detail.className='entry';
 detail.append(el('h3',d.title),el('p','المتجر: '+(d.store_name||'—')+' | النوع: '+d.kind+' | المراجعة: '+d.revision),
 el('p','من '+new Date(d.starts_at).toLocaleString('ar-IQ')+' إلى '+new Date(d.ends_at).toLocaleString('ar-IQ')),
 el('p','الحد الكلي: '+(d.max_total_redemptions??'غير محدد')+' | للعميل: '+d.max_uses_per_customer+' | المطلوب: '+(d.threshold_units??'لا ينطبق')));
 if(d.campaign_image_url){const hero=el('div');hero.className='hero';for(let i=0;i<2;i++){let im=el('img');im.src=d.campaign_image_url;im.alt=i?'صورة الحملة':'';hero.append(im)}detail.append(hero)}
 else detail.append(el('p','صورة الحملة غير متاحة بعد؛ مخزن وسائط الحملات لم يُفعّل.'));
 const products=el('div');products.className='products';
 for(const p of d.products||[]){const x=el('div');x.className='prod';if(p.image_url){const im=el('img');im.src=p.image_url;im.alt='صورة المنتج';im.loading='lazy';x.append(im)}x.append(el('div',p.name),el('small','باركود: '+(p.barcode||'—')));products.append(x)}
 detail.append(el('h4','المنتجات المؤهلة'),products);
 if(d.gift){const g=el('p','الهدية: '+d.gift.name+' | باركود: '+(d.gift.barcode||'—'));detail.append(g);if(d.gift.image_url){let im=el('img');im.src=d.gift.image_url;im.alt='صورة الهدية';im.style.cssText='height:85px;max-width:130px;object-fit:contain';detail.append(im)}}
 detail.append(el('p','الوصف: '+(d.description||'—')));
 const terms=el('details');terms.append(el('summary','الشروط التفصيلية'),el('pre',JSON.stringify(d.terms_snapshot||{},null,2)));terms.style.whiteSpace='pre-wrap';detail.append(terms);
 const reason=el('textarea');reason.maxLength=1000;reason.placeholder='سبب الرفض (3 أحرف على الأقل)';detail.append(reason);
 const msg=el('div');msg.className='message';
 for(const [decision,label] of [['approved','موافقة'],['rejected','رفض']]){
 const btn=el('button',label);btn.onclick=async()=>{
 if(busy)return;
 const r=reason.value.trim();
 if(decision==='rejected'&&(r.length<3||r.length>1000)){msg.textContent='سبب الرفض مطلوب (3–1000 حرف).';return}
 if(!confirm('تأكيد '+label+' على هذه النسخة؟ لا تعني الموافقة نشر الحملة.'))return;
 busy=true;document.querySelectorAll('.kd3f button').forEach(b=>b.disabled=true);
 try{await rpc('kinto_deals_v1_admin_decide_g3',{p_session_token:token(),p_submission_id:d.submission_id,p_expected_revision:d.revision,p_decision:decision,p_rejection_reason:decision==='rejected'?r:null});msg.textContent='سُجّل القرار في الخادم؛ لا يوجد نشر أو بث تلقائي.';await load()}
 catch(e){msg.textContent='لم يُحفظ القرار: '+e.message}
 finally{busy=false;document.querySelectorAll('.kd3f button').forEach(b=>b.disabled=false)}
 };detail.append(btn)
 }
 detail.append(msg);parent.append(detail)
}
async function load(){
 const panel=document.getElementById('kintoDealsG3f');if(!panel||!open)return;
 const id=++serial,box=panel.querySelector('.kd-items'),status=panel.querySelector('.kd-status');
 status.textContent='جاري تحميل الطلبات المحمية...';box.replaceChildren();
 try{
 if(!token())throw Error('جلسة الأدمن غير متاحة. سجّل الدخول من جديد.');
 const data=await rpc('kinto_deals_v1_admin_inbox_g3',{p_session_token:token()});
 if(id!==serial)return;
 panel.querySelector('.kd-count').textContent=data.pending_count??0;
 status.textContent=(data.items||[]).length?'اضغط عرض التفاصيل لمراجعة المنتجات والهدية.':'لا توجد حملات تنتظر المراجعة.';
 for(const item of data.items||[]){
 const entry=el('div');entry.className='entry';entry.append(el('h3',item.title_snapshot),el('p','رقم النسخة: '+item.revision+' | أُرسل: '+new Date(item.submitted_at).toLocaleString('ar-IQ')));
 const btn=el('button','عرض التفاصيل');btn.onclick=async()=>{if(busy)return;btn.disabled=true;try{const d=await rpc('kinto_deals_v1_admin_detail_g3',{p_session_token:token(),p_submission_id:item.submission_id});entry.replaceChildren();detailCard(entry,d)}catch(e){status.textContent='تعذر جلب التفاصيل: '+e.message;btn.disabled=false}};entry.append(btn);box.append(entry)
 }
 }catch(e){if(id===serial)status.textContent='تعذر تحميل الحملات: '+e.message}
}
document.addEventListener('DOMContentLoaded',()=>{
 const sidebar=document.querySelector('.sidebar'),main=document.querySelector('.main-content');if(!sidebar||!main)return;
 const link=el('a','حملات التجار — المراجعة');link.href='#kintoDealsG3f';link.addEventListener('click',e=>{
 e.preventDefault();document.querySelectorAll('.main-content > .card').forEach(x=>x.classList.remove('active-section'));
 const panel=document.getElementById('kintoDealsG3f');panel.style.display='block';open=true;panel.scrollIntoView({behavior:'smooth'});load();
 });sidebar.append(link);
 const panel=el('section');panel.id='kintoDealsG3f';panel.className='kd3f';panel.style.display='none';
 panel.append(el('h2','مراجعة حملات التجار'),el('p','بانتظار المراجعة: '));
 panel.lastChild.append(Object.assign(el('strong','—'),{className:'kd-count'}));
 const refresh=el('button','تحديث');refresh.onclick=load;panel.append(refresh);
 const status=el('p');status.className='kd-status';panel.append(status);
 const items=el('div');items.className='kd-items';panel.append(items);main.append(panel);
});
})();
