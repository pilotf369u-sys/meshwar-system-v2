/* V112 — multi-currency rewards and atomic per-order loyalty discounts. */
(()=>{'use strict';
const CURRENCIES=['USD','IQD','TRY'];
const lockedStatus=s=>/تم التسليم|ملغي|رفض|مرفوض|راجع/.test(String(s||''));
const normalizeCurrency=v=>{const c=String(v||'USD').trim().toUpperCase();return c==='$'?'USD':c==='TL'?'TRY':CURRENCIES.includes(c)?c:'USD'};
const balancesOf=c=>{const raw=c?.reward_balances;return raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{[normalizeCurrency(c?.wallet_currency||c?.balance_currency||c?.reward_currency)]:Number(c?.wallet_balance??c?.balance??0)||0}};
const balancesText=(c,escape)=>CURRENCIES.map(cur=>{const n=Number(balancesOf(c)[cur]||0);return n>0?`${n.toLocaleString('en-US',{maximumFractionDigits:2})} ${cur}`:''}).filter(Boolean).map(escape).join(' / ')||'0';
const currencyOptions=selected=>CURRENCIES.map(c=>`<option value="${c}" ${c===normalizeCurrency(selected)?'selected':''}>${c}</option>`).join('');

function context(){
  if(document.getElementById('adminRewardPanel'))return{
    kind:'admin',escape:window.esc||String,sb:()=>window.ensureCustomerSupabase(),actor:()=>String(typeof currentAdminCloud!=='undefined'&&currentAdminCloud?.id||''),
    customers:()=>typeof adminRewardCustomers!=='undefined'?adminRewardCustomers:[],orders:()=>typeof adminOrdersCloud!=='undefined'?adminOrdersCloud:[],rewardBody:'#adminRewardTableBody',orderBody:'#adminOrdersTableBody',
    amount:id=>`adminReward-${id}`,currency:id=>`adminRewardCurrency-${id}`,loadRewards:()=>window.loadAdminRewards(),loadOrders:()=>window.loadAdminOrders()
  };
  if(document.getElementById('rewardPanel'))return{
    kind:'employee',escape:window.escapeHtml||String,sb:()=>window.ensureEmployeeSupabase(),actor:()=>String(typeof currentEmployee!=='undefined'&&currentEmployee?.id||''),
    customers:()=>typeof cloudCustomers!=='undefined'?cloudCustomers:[],orders:()=>typeof cloudOrders!=='undefined'?cloudOrders:[],rewardBody:'#rewardsTableBody',orderBody:'#pipelineOrdersBody',
    amount:id=>`reward-${id}`,currency:id=>`reward-currency-${id}`,loadRewards:()=>window.loadRewardsManagementTable(),loadOrders:()=>window.loadPipelineOrders()
  };
  return null;
}

const ctx=context();
if(!ctx&&document.getElementById('rewardStatusBadge')){
  const decorateCustomerWallet=()=>{const c=typeof currentCustomerCloud!=='undefined'?currentCustomerCloud:null,box=document.getElementById('rewardStatusBadge');if(!c||!box)return;const row=[...box.querySelectorAll('span')].find(x=>String(x.textContent||'').includes('الرصيد الحالي'));if(row)row.innerHTML=`الرصيد الحالي: <b class="reward-wallets-v112">${balancesText(c,window.escapeHtml||String)}</b>`};
  const base=window.renderCustomerRewardSummary;if(typeof base==='function')window.renderCustomerRewardSummary=function(...args){const out=base.apply(this,args);decorateCustomerWallet();return out};
  const style=document.createElement('style');style.textContent='.reward-wallets-v112{color:#60a5fa;font-weight:900}';document.head.appendChild(style);setTimeout(decorateCustomerWallet,0);return;
}
if(!ctx)return;
function customerForOrder(order){return ctx.customers().find(c=>String(c.id)===String(order?.customer_id))||null}
function decorateRewardBalances(){
  document.querySelectorAll(`${ctx.rewardBody} tr`).forEach(tr=>{const input=tr.querySelector('input[id^="adminReward-"],input[id^="reward-"]'),encoded=String(input?.id||'').replace(/^adminReward-|^reward-/,''),id=encoded?decodeURIComponent(encoded):'',c=ctx.customers().find(x=>String(x.id)===String(id)),cell=tr.children[4];if(!c||!cell)return;cell.innerHTML=`<b class="reward-wallets-v112">${balancesText(c,ctx.escape)}</b>`});
}
function decorateOrderDiscounts(){
  document.querySelectorAll(`${ctx.orderBody} tr`).forEach((tr,i)=>{const order=ctx.orders()[i];if(!order||lockedStatus(order.status)||tr.querySelector('[data-reward-order-control]'))return;const action=tr.lastElementChild;if(!action)return;const id=encodeURIComponent(String(order.id)),c=customerForOrder(order),balances=c?balancesText(c,ctx.escape):'تحميل الرصيد';action.insertAdjacentHTML('beforeend',`<div data-reward-order-control="${id}" class="reward-order-control-v112"><small>خصم الولاء: ${balances}</small><div><input id="orderRewardAmount-${id}" type="number" min="0" step="0.01" placeholder="القيمة"><select id="orderRewardCurrency-${id}">${currencyOptions(order.currency)}</select><button type="button" onclick="applyV112OrderReward('${id}')">تطبيق</button></div></div>`)});
}
async function adjustReward(encodedId,dir){
  const id=decodeURIComponent(encodedId),customer=ctx.customers().find(c=>String(c.id)===String(id)),amount=Number(document.getElementById(ctx.amount(encodedId))?.value||0),currency=normalizeCurrency(document.getElementById(ctx.currency(encodedId))?.value);
  if(!customer||!Number.isFinite(amount)||amount<=0)return alert('أدخل قيمة مكافأة صحيحة.');
  if(dir<0)return alert('لسلامة الحسابات، طبّق الخصم من الطلب المحدد في جدول الطلبات ليُثبت داخل فاتورته.');
  const sb=await ctx.sb(),{error}=await sb.rpc('adjust_customer_reward_balance',{p_customer_id:id,p_amount:amount,p_currency:currency,p_actor_id:ctx.actor(),p_note:'manual_reward_grant'});
  if(error)return alert('تعذر حفظ المكافأة: '+(error.message||error));
  await ctx.loadRewards();alert(`تمت إضافة ${amount} ${currency} إلى محفظة العميل.`);
}
async function applyOrderReward(encodedOrderId){
  const orderId=decodeURIComponent(encodedOrderId),amount=Number(document.getElementById('orderRewardAmount-'+encodedOrderId)?.value||0),currency=normalizeCurrency(document.getElementById('orderRewardCurrency-'+encodedOrderId)?.value);
  if(!Number.isFinite(amount)||amount<=0)return alert('أدخل قيمة خصم صحيحة.');
  if(!confirm(`تطبيق خصم ولاء ${amount} ${currency} على هذا الطلب؟`))return;
  const sb=await ctx.sb(),{error}=await sb.rpc('apply_order_reward_discount',{p_order_id:orderId,p_amount:amount,p_currency:currency,p_actor_id:ctx.actor()});
  if(error)return alert('تعذر تطبيق الخصم: '+(error.message||error));
  await Promise.all([ctx.loadOrders(),ctx.loadRewards()]);alert('تم تثبيت خصم الولاء داخل الطلب والفاتورة بنجاح.');
}
const rewardName=ctx.kind==='admin'?'changeAdminReward':'changeReward',rewardLoadName=ctx.kind==='admin'?'loadAdminRewards':'loadRewardsManagementTable',orderLoadName=ctx.kind==='admin'?'loadAdminOrders':'loadPipelineOrders';
const baseRewardLoad=window[rewardLoadName],baseOrderLoad=window[orderLoadName];
window[rewardLoadName]=async function(...args){const out=await baseRewardLoad.apply(this,args);decorateRewardBalances();return out};
window[orderLoadName]=async function(...args){const out=await baseOrderLoad.apply(this,args);decorateOrderDiscounts();return out};
window[rewardName]=adjustReward;window.applyV112OrderReward=applyOrderReward;
const style=document.createElement('style');style.textContent='.reward-wallets-v112{color:#60a5fa;font-weight:900}.reward-order-control-v112{margin-top:8px;padding:7px;border:1px solid rgba(96,165,250,.34);border-radius:9px;background:rgba(37,99,235,.08)}.reward-order-control-v112 small{display:block;margin-bottom:5px;color:#60a5fa;font-weight:900}.reward-order-control-v112>div{display:flex;gap:4px;flex-wrap:wrap}.reward-order-control-v112 input{width:72px!important}.reward-order-control-v112 select{width:66px!important}.reward-order-control-v112 button{background:#2563eb!important;color:#fff!important;padding:6px 8px!important;border-radius:7px!important}';document.head.appendChild(style);
})();
