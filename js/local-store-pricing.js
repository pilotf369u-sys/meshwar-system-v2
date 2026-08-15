(function(){
  function ceilNumber(value){
    const n=Number(value);
    return Number.isFinite(n)?Math.ceil(n):0;
  }
  function commissionFraction(rate){
    const n=Number(rate);
    return Number.isFinite(n)&&n>=0&&n<100?n/100:0.10;
  }
  function customerPriceUSD(vendorPrice,commissionRate){
    const v=Number(vendorPrice);
    if(!Number.isFinite(v)||v<0)return null;
    return ceilNumber(v/(1-commissionFraction(commissionRate)));
  }
  function customerPriceLocal(vendorPrice,commissionRate,exchangeRate){
    const usd=customerPriceUSD(vendorPrice,commissionRate);
    const rate=Number(exchangeRate);
    if(usd===null||!Number.isFinite(rate)||rate<=0)return null;
    const rawLocalPrice=usd*rate;
    return Math.ceil(rawLocalPrice/1000)*1000;
  }
  function discountPercent(basePrice,discountPrice){
    const base=Number(basePrice),discount=Number(discountPrice);
    if(!Number.isFinite(base)||!Number.isFinite(discount)||base<=0||discount<0||discount>=base)return null;
    return Math.max(1,Math.min(99,Math.round(((base-discount)/base)*100)));
  }
  function pricingSnapshot(vendorPrice,commissionRate,exchangeRate,localCurrency='IQD'){
    const vendor=Number(vendorPrice),rate=Number(exchangeRate),commission=Number(commissionRate);
    const usd=customerPriceUSD(vendor,commission);
    const local=customerPriceLocal(vendor,commission,rate);
    if(usd===null||local===null)return null;
    return {
      pricing_version:'iqd_ceil_1000_v1',
      vendor_price_usd:vendor,
      commission_rate:Number.isFinite(commission)&&commission>=0&&commission<100?commission:10,
      exchange_rate:rate,
      customer_price_usd:ceilNumber(usd),
      customer_price_local:ceilNumber(local),
      local_currency:String(localCurrency||'IQD').toUpperCase()
    };
  }
  window.MeshwarLocalPricing={ceilNumber,commissionFraction,customerPriceUSD,customerPriceLocal,discountPercent,pricingSnapshot};
})();
