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
    return ceilNumber(usd*rate);
  }
  function discountPercent(basePrice,discountPrice){
    const base=Number(basePrice),discount=Number(discountPrice);
    if(!Number.isFinite(base)||!Number.isFinite(discount)||base<=0||discount<0||discount>=base)return null;
    return Math.max(1,Math.min(99,Math.round(((base-discount)/base)*100)));
  }
  window.MeshwarLocalPricing={ceilNumber,commissionFraction,customerPriceUSD,customerPriceLocal,discountPercent};
})();
