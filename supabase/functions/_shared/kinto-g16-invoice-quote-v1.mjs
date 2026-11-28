/* KINTO G16 READ-ONLY finance quote, extracted from the current V94 invoice
 * globalTotals / paidGoodsInfo conventions for server-only order records.
 * No SQL, no mutations. FAIL CLOSED for unsupported currencies, ambiguous
 * discounts, stock-projected invoices or incomplete order revision.
 * Required parity fixtures live in tests/kinto-g16-invoice-quote-v1.test.cjs.
 */
export const supportedModes=Object.freeze(['card_full','goods_now_shipping_cod','full_cod']);
function obj(v){if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return v;
 try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?x:{}}catch{return{}}}
function cur(c){const x=String(c||'').trim().toUpperCase();if(x!=='USD'&&x!=='IQD')throw Error('INVOICE_CURRENCY_UNSUPPORTED');return x}
function money(v,c){
 if(v===null||v===undefined||v==='')v=0;
 if(typeof v!=='number'&&typeof v!=='string')throw Error('INVOICE_FINANCE_UNSAFE');
 const s=String(v).trim();
 if(!/^(?:0|[1-9][0-9]{0,12})(?:[.][0-9]{1,2})?$/.test(s))throw Error('INVOICE_FINANCE_UNSAFE');
 const [i,f='']=s.split('.');
 if(c==='IQD'&&f.replace(/0/g,'')!=='')throw Error('IQD_FRACTION_UNSAFE');
 const m=Number(i)*(c==='USD'?100:1)+(c==='USD'?Number(f.padEnd(2,'0')):0);
 if(!Number.isSafeInteger(m)||m<0)throw Error('INVOICE_FINANCE_UNSAFE');
 return m;
}
function field(o,d,key,fallback){return o[key]??d[key]??fallback}
export function derive(order,mode){
 if(!order||!supportedModes.includes(mode)||!['تمت الموافقة','تمت الموافقة - بانتظار الدفع'].includes(String(order.status||'').trim()))
  throw Error('ORDER_NOT_APPROVED');
 const types={card_full:'paid_prepaid',goods_now_shipping_cod:'product_paid_delivery_cod',full_cod:'cod_full'};
 if(order.delivery_payment_type!==types[mode])throw Error('PAYMENT_MODE_MISMATCH');
 const code=String(order.order_code||'');
 if(!/^(?:KN|MW)-[0-9]{4,12}$/.test(code))throw Error('ORDER_CODE_UNSUPPORTED');
 const rev=String(order.updated_at||order.created_at||'');
 if(!rev||!Number.isFinite(Date.parse(rev)))throw Error('INVOICE_REVISION_UNAVAILABLE');
 const d=obj(order.details),ship=obj(order.shipping_snapshot);
 if(d.stock_adjustment_v58||d._invoiceRequestedV57||d._invoiceAvailableV57)
  throw Error('STOCK_PROJECTION_REVIEW_REQUIRED');
 const c=cur(order.currency||d.local_currency),deliveryCurrency=cur(order.delivery_currency||ship.currency||c);
 const externalCurrency=cur(order.external_shipping_currency||c);
 if(order.total_price==null&&d.customer_total_local==null)throw Error('GOODS_TOTAL_MISSING');
 const goods=money(order.total_price??d.customer_total_local,c);
 const external=money(field(order,d,'external_shipping_fee',d.shipping_fee??0),c);
 const local=money(field(order,d,'delivery_fee',d.local_delivery_fee??0),c);
 if((external&&externalCurrency!==c)||(local&&deliveryCurrency!==c))
  throw Error('MIXED_SHIPPING_CURRENCY_MANUAL_REQUIRED');
 const cs=obj(order.kinto_campaign_discount_snapshot||d.kinto_campaign_discount_snapshot);
 const rs=obj(order.reward_discount_snapshot||d.reward_discount);
 // Exact priority from shipped V94 campaignInfo()/rewardInfo():
 // column > verified snapshot > legacy details > zero.
 const campRaw=order.kinto_campaign_discount_amount??cs.amount??d.kinto_campaign_discount_amount??0;
 const rewRaw=order.reward_discount_amount??rs.amount??d.reward_discount_amount??0;
 const campaign=money(campRaw,c),reward=money(rewRaw,c);
 if(campaign&&cur(order.kinto_campaign_discount_currency||cs.currency||d.kinto_campaign_discount_currency||c)!==c)
  throw Error('MIXED_DISCOUNT_CURRENCY_MANUAL_REQUIRED');
 if(reward&&cur(order.reward_discount_currency||rs.currency||d.reward_discount_currency||c)!==c)
  throw Error('MIXED_DISCOUNT_CURRENCY_MANUAL_REQUIRED');
 if(mode==='goods_now_shipping_cod'&&campaign)
  throw Error('PARTIAL_CAMPAIGN_REVIEW_REQUIRED');
 if(campaign+reward>goods)throw Error('DISCOUNT_EXCEEDS_GOODS_REVIEW_REQUIRED');
 const shipping=external+local;
 const grand=goods+shipping-campaign-reward;
 const goodsDue=goods-reward-campaign;
 if(!Number.isSafeInteger(grand)||!Number.isSafeInteger(goodsDue)||grand<0||goodsDue<0)
  throw Error('INVOICE_FINANCE_UNSAFE');
 const amount=mode==='full_cod'?0:mode==='card_full'?grand:goodsDue;
 if(mode!=='full_cod'&&amount===0)throw Error('ZERO_TRANSFER_AMOUNT');
 return Object.freeze({orderCode:code,version:rev,currency:c,
  prepaidMinor:grand,goodsMinor:goodsDue,deliveryDueMinor:shipping,
  amountMinor:amount,mode,source:'server_readonly_v94_parity',
  serverVerified:true,orderEligible:true,amountIncluded:true});
}
