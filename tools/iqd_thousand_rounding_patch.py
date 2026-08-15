from pathlib import Path

p=Path('js/local-store-pricing.js')
s=p.read_text(encoding='utf-8')
old="""  function customerPriceLocal(vendorPrice,commissionRate,exchangeRate){
    const usd=customerPriceUSD(vendorPrice,commissionRate);
    const rate=Number(exchangeRate);
    if(usd===null||!Number.isFinite(rate)||rate<=0)return null;
    return ceilNumber(usd*rate);
  }"""
new="""  function customerPriceLocal(vendorPrice,commissionRate,exchangeRate){
    const usd=customerPriceUSD(vendorPrice,commissionRate);
    const rate=Number(exchangeRate);
    if(usd===null||!Number.isFinite(rate)||rate<=0)return null;
    const rawLocalPrice=usd*rate;
    return Math.ceil(rawLocalPrice/1000)*1000;
  }"""
if old not in s:
    raise SystemExit('customerPriceLocal block not found')
s=s.replace(old,new,1)
s=s.replace("      vendor_price_usd:vendor,", "      pricing_version:'iqd_ceil_1000_v1',\n      vendor_price_usd:vendor,",1)
p.write_text(s,encoding='utf-8')

card=Path('js/local-store-card-v3.js')
c=card.read_text(encoding='utf-8')
c=c.replace("customerPriceLocal:(v,r,x)=>Math.ceil(Math.ceil(Number(v)/(1-(Number(r)||10)/100))*Number(x||1))", "customerPriceLocal:(v,r,x)=>Math.ceil((Math.ceil(Number(v)/(1-(Number(r)||10)/100))*Number(x||1))/1000)*1000",1)
old_snap="const storedPricing=(p,s)=>{const snap=rawOptions(p?.options).pricing;if(!snap)return null;const vendor=vendorPrice(p),commission=Number(s?.commission_rate),rate=exchangeRate(s);"
new_snap="const storedPricing=(p,s)=>{const snap=rawOptions(p?.options).pricing;if(!snap||snap.pricing_version!=='iqd_ceil_1000_v1')return null;const vendor=vendorPrice(p),commission=Number(s?.commission_rate),rate=exchangeRate(s);"
if old_snap not in c:
    raise SystemExit('storedPricing block not found')
c=c.replace(old_snap,new_snap,1)
card.write_text(c,encoding='utf-8')

idx=Path('index.html')
h=idx.read_text(encoding='utf-8')
h=h.replace('js/local-store-pricing.js?v=pricing-final-2','js/local-store-pricing.js?v=iqd-thousand-v1')
h=h.replace('js/local-store-card-v3.js?v=pricing-final-2','js/local-store-card-v3.js?v=iqd-thousand-v1')
idx.write_text(h,encoding='utf-8')

vendor=Path('vendor-dashboard.html')
v=vendor.read_text(encoding='utf-8')
v=v.replace('js/local-store-pricing.js?v=pricing-final-2','js/local-store-pricing.js?v=iqd-thousand-v1')
vendor.write_text(v,encoding='utf-8')
