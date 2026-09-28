/* V310 — KINTO secure coupon loyalty UI. Server is authoritative. */
(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:0});
const style=document.createElement('style');
style.textContent='.reward-order-control-v112{display:none!important}.kinto-points-v310{padding:12px;border:1px solid #d6b65c55;border-radius:12px;margin:8px 0}.kp-row{display:flex;gap:7px;flex-wrap:wrap;align-items:center;margin-top:8px}.kp-btn{border:1px solid #d6b65c88;border-radius:9px;padding:7px 10px;cursor:pointer}.kp-btn:disabled{opacity:.4;cursor:not-allowed}.kp-chip{display:inline-block;padding:4px 7px;border-radius:999px;margin:2px;border:1px solid #d6b65c55}.kp-expired{opacity:.58}.kp-used{opacity:.72}.kinto-points-v310 small{display:block;margin-top:5px}';
document.head.appendChild(style);
window.applyV112OrderReward=()=>alert('تم إلغاء الخصم اليدوي. كوبونات KINTO يختارها العميل ويثبتها السيرفر.');

const sessionCustomer=()=>window.KintoCustomerSessionV150?.read?.();
const activeTotal=(coupons,currency)=>coupons.filter(x=>x.status==='active'&&x.currency===currency).reduce((s,x)=>s+Number(x.points||0),0);
const couponHistory=coupons=>coupons.slice(0,12).map(x=>{const d=x.expires_at?new Date(x.expires_at).toLocaleDateString('en-GB'):'---',cls=x.status==='expired'?'kp-expired':x.status==='used'?'kp-used':'';return '<span class="kp-chip '+cls+'">'+fmt(x.points)+' '+esc(x.currency)+' · '+(x.status==='active'?'متاح حتى '+d:x.status==='used'?'مستخدم':'منتهي الصلاحية')+'</span>'}).join('');

async function customer(){
  const box=document.getElementById('rewardStatusBadge'),session=sessionCustomer();
  if(!box||!session?.token||typeof ensureCustomerPortalSupabase!=='function')return;
  try{
    const sb=await ensureCustomerPortalSupabase(),{data,error}=await sb.rpc('customer_loyalty_summary_v310',{p_session_token:session.token});
    if(error)throw error;
    const wallets=data?.wallets||[],coupons=data?.coupons||[],orders=data?.eligible_orders||[];
    const currencies=[...new Set([...wallets.map(x=>x.currency),...coupons.map(x=>x.currency)])];
    const totals=currencies.length?currencies.map(c=>'<b>'+fmt(activeTotal(coupons,c))+' نقطة '+esc(c)+'</b>').join(' / '):'<b>0 نقطة</b>';
    const progress=wallets.length?wallets.map(w=>fmt(w.progress_points)+' / 1,000 '+esc(w.currency)).join(' · '):'0 / 1,000';
    const opts=orders.map(o=>'<option value="'+esc(o.id)+'" data-currency="'+esc(o.currency)+'" data-cap="'+Number(o.max_coupon||0)+'">'+esc(o.order_code)+' — '+fmt(o.product_total)+' '+esc(o.currency)+'</option>').join('');
    box.innerHTML='<div class="kinto-points-v310"><div>⭐ <b>كوبونات KINTO</b></div><div>المتاح: '+totals+'</div><small>التقدم للكوبون التالي: '+progress+' · كل 1,000 نقطة تصبح كوبوناً صالحاً 30 يوماً.</small>'+
      (orders.length?'<div class="kp-row"><select id="kpOrderSelect">'+opts+'</select><button class="kp-btn" data-kp-tier="1000">استخدام 1,000</button><button class="kp-btn" data-kp-tier="3000">استخدام 3,000</button><button class="kp-btn" data-kp-tier="5000">استخدام 5,000</button></div><small>الخصم لا يتجاوز 10% من قيمة المنتجات ولا يشمل الشحن.</small>':'<small>لا يوجد طلب مؤهل لاستخدام كوبون حالياً.</small>')+
      '<div class="kp-row">'+couponHistory(coupons)+'</div></div>';
    const refreshButtons=()=>{const sel=document.getElementById('kpOrderSelect'),op=sel?.selectedOptions?.[0],cur=op?.dataset.currency||'',cap=Number(op?.dataset.cap||0),have=activeTotal(coupons,cur);box.querySelectorAll('[data-kp-tier]').forEach(b=>{const tier=Number(b.dataset.kpTier);b.disabled=!op||tier>cap||tier>have})};
    document.getElementById('kpOrderSelect')?.addEventListener('change',refreshButtons);
    box.querySelectorAll('[data-kp-tier]').forEach(b=>b.addEventListener('click',()=>redeem(Number(b.dataset.kpTier))));
    refreshButtons();
  }catch(e){console.warn('KINTO coupon summary skipped',e)}
}
async function redeem(points){
  const session=sessionCustomer(),sel=document.getElementById('kpOrderSelect'),orderId=sel?.value;
  if(!session?.token||!orderId)return;
  if(!confirm('استخدام كوبون KINTO بقيمة '+fmt(points)+' نقطة على هذا الطلب؟'))return;
  try{
    const sb=await ensureCustomerPortalSupabase(),{error}=await sb.rpc('customer_apply_coupon_v310',{p_session_token:session.token,p_order_id:orderId,p_points:points});
    if(error)throw error;
    await customer();
    if(typeof window.loadCustomerOrdersFromCloud==='function')await window.loadCustomerOrdersFromCloud();
    alert('تم تثبيت كوبون KINTO على الطلب بنجاح.');
  }catch(e){alert('تعذر استخدام الكوبون: '+(e?.message||e))}
}
function aggregate(data,id){
  const wallets=(data?.wallets||[]).filter(x=>String(x.customer_id)===String(id));
  const coupons=(data?.coupons||[]).filter(x=>String(x.customer_id)===String(id));
  const by={};coupons.forEach(x=>{const c=x.currency||'IQD';by[c]??={active:0,used:0,expired:0};by[c][x.status]=(by[c][x.status]||0)+Number(x.points||0)});
  const parts=[...new Set([...wallets.map(x=>x.currency),...Object.keys(by)])].map(c=>{const w=wallets.find(x=>x.currency===c),b=by[c]||{};return '<b>'+fmt(b.active||0)+' '+esc(c)+'</b> متاح · '+fmt(w?.progress_points||0)+'/1,000 تقدم · '+fmt(b.used||0)+' مستخدم · '+fmt(b.expired||0)+' منتهي'});
  return parts.join('<br>')||'لا توجد نقاط بعد';
}
async function employee(){
  const panel=document.getElementById('rewardPanel'),session=window.KintoEmployeeSessionV143?.read?.();
  if(!panel||!session?.token||typeof ensureEmployeeSupabase!=='function')return;
  try{
    const sb=await ensureEmployeeSupabase(),{data,error}=await sb.rpc('employee_loyalty_overview_v310',{p_session_token:session.token});if(error)throw error;
    const body=document.getElementById('rewardsTableBody'),head=panel.querySelector('thead tr'),customers=typeof cloudCustomers!=='undefined'?cloudCustomers:[];
    const h=panel.querySelector('h3');if(h)h.textContent='🎁 مكافآت KINTO';
    const p=panel.querySelector('p.mini');if(p)p.textContent='عرض فقط: نقاط وكوبونات KINTO محمية من السيرفر. لا يملك الموظف صلاحية منح أو خصم المكافآت.';
    if(head)head.innerHTML='<th>العميل</th><th>الهاتف</th><th>حالة مكافآت KINTO</th>';
    if(body)body.innerHTML=customers.map(c=>'<tr><td>'+esc(c.name||'---')+'</td><td>'+esc(c.phone||'---')+'</td><td>'+aggregate(data,c.id)+'</td></tr>').join('')||'<tr><td colspan="3">لا توجد بيانات.</td></tr>';
  }catch(e){console.warn('Employee KINTO overview failed',e)}
}
async function admin(){
  const panel=document.getElementById('adminRewardPanel'),session=window.KintoAdminSessionV147?.read?.();
  if(!panel||!session?.token||typeof ensureCustomerSupabase!=='function')return;
  try{
    const sb=await ensureCustomerSupabase(),{data,error}=await sb.rpc('admin_loyalty_overview_v310',{p_session_token:session.token});if(error)throw error;
    const body=document.getElementById('adminRewardTableBody'),head=panel.querySelector('thead tr'),customers=typeof adminRewardCustomers!=='undefined'?adminRewardCustomers:[];
    const h=panel.querySelector('h3');if(h)h.textContent='🎁 مكافآت KINTO';
    if(head)head.innerHTML='<th>العميل</th><th>الهاتف</th><th>الحالة</th><th>منح استثنائي</th>';
    if(body)body.innerHTML=customers.map(c=>{const id=encodeURIComponent(String(c.id));return '<tr><td>'+esc(c.name||'---')+'</td><td>'+esc(c.phone||'---')+'</td><td>'+aggregate(data,c.id)+'</td><td><input id="kp-'+id+'" type="number" min="1" step="1" placeholder="نقاط" style="width:75px"><select id="kc-'+id+'"><option>IQD</option><option>TRY</option><option>USD</option></select><input id="kr-'+id+'" placeholder="سبب إلزامي" style="width:120px"><button type="button" onclick="KintoPointsV310.grant(\''+id+'\')">منح</button></td></tr>'}).join('')||'<tr><td colspan="4">لا توجد بيانات.</td></tr>';
  }catch(e){console.warn('Admin KINTO overview failed',e)}
}
async function grant(encoded){
  const session=window.KintoAdminSessionV147?.read?.();if(!session?.token)return alert('جلسة الأدمن غير صالحة.');
  const points=Number(document.getElementById('kp-'+encoded)?.value||0),currency=document.getElementById('kc-'+encoded)?.value||'IQD',reason=String(document.getElementById('kr-'+encoded)?.value||'').trim();
  if(!Number.isInteger(points)||points<=0)return alert('أدخل نقاطاً صحيحة بدون كسور.');
  if(!reason)return alert('سبب المنح مطلوب.');
  const sb=await ensureCustomerSupabase(),{error}=await sb.rpc('admin_loyalty_grant_points_v310',{p_session_token:session.token,p_customer_id:decodeURIComponent(encoded),p_points:points,p_currency:currency,p_reason:reason});
  if(error)return alert('تعذر منح النقاط: '+error.message);
  await admin();alert('تم منح نقاط KINTO وتسجيل العملية.');
}
window.KintoPointsV310=Object.freeze({customer,employee,admin,grant,redeem});
const oe=window.loadRewardsManagementTable;if(typeof oe==='function')window.loadRewardsManagementTable=async function(){await oe.apply(this,arguments);await employee()};
const oa=window.loadAdminRewards;if(typeof oa==='function')window.loadAdminRewards=async function(){await oa.apply(this,arguments);await admin()};
if(typeof window.customerOrderMoneyBreakdown==='function'){const base=window.customerOrderMoneyBreakdown;window.customerOrderMoneyBreakdown=function(o){const x=base(o)||{},discount=Math.max(0,Number(o?.reward_discount_amount)||0);if('productTotal'in x){x.rewardDiscount=discount;x.grandTotal=x.productTotal===null?null:Math.max(0,Number(x.productTotal)-discount)+Math.max(0,Number(x.externalShippingFee)||0)+Math.max(0,Number(x.deliveryFee)||0)}return x}}
setTimeout(()=>{customer();employee();admin()},0);
})();