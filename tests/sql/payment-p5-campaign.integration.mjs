import assert from 'node:assert/strict';

const base = process.env.P5_URL;
const key = process.env.P5_PUBLISHABLE_KEY;
const a = process.env.P5_CUSTOMER_A_TOKEN;
const b = process.env.P5_CUSTOMER_B_TOKEN;
const stockCampaign = process.env.P5_STOCK_CAMPAIGN;
const giftCampaign = process.env.P5_GIFT_CAMPAIGN;
const quotaCampaign = process.env.P5_QUOTA_CAMPAIGN;
for (const [name, value] of Object.entries({base,key,a,b,stockCampaign,giftCampaign,quotaCampaign})) {
  if (!value) throw new Error(`Missing ${name}`);
}
const lines = {
  stock: [{store_id:'22222222-2222-4222-8222-222222222221',product_id:'33333333-3333-4333-8333-333333333333',quantity:1,selected_options:{}}],
  variant: [{store_id:'22222222-2222-4222-8222-222222222221',product_id:'33333333-3333-4333-8333-333333333334',quantity:1,selected_options:{color:'blue',size:'small'}}],
};
const results=[];
const log=(name,ok,detail='')=>{results.push({name,ok,detail});console.log(`${ok?'PASS':'FAIL'} ${name}${detail?` — ${detail}`:''}`);if(!ok)process.exitCode=1;};
async function call(token,action,body={}){
  const response=await fetch(`${base}/functions/v1/kinto-payment-p5`,{method:'POST',headers:{'content-type':'application/json',apikey:key,authorization:`Bearer ${key}`},body:JSON.stringify({action,session_token:token,...body})});
  let json;try{json=await response.json()}catch{json={error:'invalid json'}}
  return {status:response.status,json,data:json.data};
}
async function reserve(token,campaign,items,idempotency=crypto.randomUUID(),coupon_points={}){
  return call(token,'campaign_reserve',{campaign_id:campaign,items,idempotency_key:idempotency,coupon_points});
}
async function startAnd(token,attempt,scenario){
  const s=await call(token,'start',{attempt_id:attempt});
  if(!s.json.ok) return s;
  return call(token,'simulate',{attempt_id:attempt,scenario,shipping:{}});
}
async function cancelIfReserved(token,attempt){
  if(attempt) await startAnd(token,attempt,'cancel');
}

// Coupons are rejected at the server boundary even when the caller bypasses UI.
const coupon=await reserve(a,stockCampaign,lines.stock,crypto.randomUUID(),{'22222222-2222-4222-8222-222222222221':1000});
log('direct-campaign coupon rejected server-side',coupon.status===400||/COUPONS_FORBIDDEN|COUPON/i.test(JSON.stringify(coupon.json)),`HTTP ${coupon.status}`);

// Same customer/key replay returns the same durable KP and reservation.
const idem=crypto.randomUUID();
const [same1,same2]=await Promise.all([reserve(a,stockCampaign,lines.stock,idem),reserve(a,stockCampaign,lines.stock,idem)]);
const sameAttempt=same1.data?.attempt_id;
log('duplicate reservation idempotency',Boolean(sameAttempt&&same2.data?.attempt_id===sameAttempt),sameAttempt||JSON.stringify(same1.json));
await cancelIfReserved(a,sameAttempt);

// Last physical unit: two customer sessions compete; P4 row lock yields one winner.
const stockRace=await Promise.all([reserve(a,stockCampaign,lines.stock),reserve(b,stockCampaign,lines.stock)]);
const stockWinners=stockRace.filter(x=>x.json.ok&&x.data?.attempt_id);
log('direct campaign last product concurrent reserve',stockWinners.length===1,`winners=${stockWinners.length}; ${stockRace.map(x=>x.data?.status||x.json.error||'error').join(',')}`);
for(const x of stockWinners) await cancelIfReserved(x===stockRace[0]?a:b,x.data.attempt_id);

// Gift product is separately held in P4; product 333 has one piece in total.
const giftRace=await Promise.all([reserve(a,giftCampaign,lines.variant),reserve(b,giftCampaign,lines.variant)]);
const giftWinners=giftRace.filter(x=>x.json.ok&&x.data?.attempt_id);
log('direct campaign last gift concurrent reserve',giftWinners.length===1,`winners=${giftWinners.length}; ${giftRace.map(x=>x.data?.status||x.json.error||'error').join(',')}`);
for(const x of giftWinners) await cancelIfReserved(x===giftRace[0]?a:b,x.data.attempt_id);

// Quota cap is checked while holding the campaign row, before attempting stock.
const quotaRace=await Promise.all([reserve(a,quotaCampaign,lines.variant),reserve(b,quotaCampaign,lines.variant)]);
const quotaWinners=quotaRace.filter(x=>x.json.ok&&x.data?.attempt_id);
log('direct campaign last quota concurrent reserve',quotaWinners.length===1,`winners=${quotaWinners.length}; ${quotaRace.map(x=>x.data?.status||x.json.error||'error').join(',')}`);
const quotaWinnerIndex=quotaRace.indexOf(quotaWinners[0]);
const quotaWinnerToken=quotaWinnerIndex===0?a:b;
const quotaAttempt=quotaWinners[0]?.data?.attempt_id;
if(quotaRace.some(x=>/DEALS_ALLOCATION_LIMIT_REACHED/.test(JSON.stringify(x.json))))
  log('quota loser rejected by campaign cap',true,'DEALS_ALLOCATION_LIMIT_REACHED');
else log('quota loser rejected by campaign cap',false,JSON.stringify(quotaRace.map(x=>x.json)));

// Failure releases both product and gift/campaign quota holds without a KN.
const failureReserve=await reserve(a,giftCampaign,lines.variant);
let failureStatus='';
if(failureReserve.data?.attempt_id){const f=await startAnd(a,failureReserve.data.attempt_id,'failure');failureStatus=f.data?.status||f.json.data?.status||'';}
log('campaign payment failure releases reservation',failureStatus==='failed',failureStatus||JSON.stringify(failureReserve.json));

// A disconnected result must retain every hold until trusted reconciliation.
const unknownReserve=await reserve(a,giftCampaign,lines.variant);
let unknownStatus='';
if(unknownReserve.data?.attempt_id){const u=await startAnd(a,unknownReserve.data.attempt_id,'disconnect');unknownStatus=u.data?.status||u.json.data?.status||'';}
log('campaign unknown result retains holds',unknownStatus==='reconciliation_required',unknownStatus||JSON.stringify(unknownReserve.json));

// Successful confirmation goes through G20/G5/V47; duplicate delivery is idempotent.
let successStatus='';let duplicate=false;
if(quotaAttempt){
  await call(quotaWinnerToken,'start',{attempt_id:quotaAttempt});
  const s=await call(quotaWinnerToken,'simulate',{attempt_id:quotaAttempt,scenario:'success',shipping:{}});
  successStatus=s.data?.status||'';
  const d=await call(quotaWinnerToken,'simulate',{attempt_id:quotaAttempt,scenario:'success',shipping:{}});
  duplicate=d.data?.duplicate===true&&d.data?.status==='paid';
}
log('campaign success finalizes canonical KN via G20/G5/V47',successStatus==='paid',successStatus||JSON.stringify(quotaRace[quotaWinnerIndex]?.json));
log('duplicate successful campaign confirmation is idempotent',duplicate,duplicate?'duplicate=true':'no paid duplicate receipt');

console.log(JSON.stringify({results,exitCode:process.exitCode||0},null,2));
