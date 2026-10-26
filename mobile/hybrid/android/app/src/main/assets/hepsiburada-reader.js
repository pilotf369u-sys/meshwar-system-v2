(() => {
 'use strict';
 const host=location.hostname.toLowerCase(),match=location.pathname.match(/-(p|pm)-([A-Za-z0-9]{3,40})\/?$/i);
 if(location.protocol!=='https:'||!['hepsiburada.com','www.hepsiburada.com','m.hepsiburada.com'].includes(host)||!match)return JSON.stringify({error:'NOT_PRODUCT'});
 const productId=match[2].toUpperCase(),parent=match[1].toLowerCase()==='pm';
 const text=v=>String(v||'').trim().slice(0,500),visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('del,s,[aria-hidden="true"],[data-test-id*="recommend"],[data-test-id*="sponsored"]');
 // The same price/variant test ids also occur in other offers and recommendation cards.
 // Read the active product buybox when present; never combine it with the rest of the page.
 const buyboxes=Array.from(document.querySelectorAll('[data-test-id="buybox-area"]')).filter(visible);
 if(buyboxes.length>1)return JSON.stringify({error:'AMBIGUOUS_PRODUCT'});
 // Mobile mounts title, price and variant widgets as siblings, not inside buybox-area.
 const scope=buyboxes[0]?.parentElement||buyboxes[0]||document;
 const list=s=>Array.from(scope.querySelectorAll(s)).filter(visible),unique=a=>[...new Set(a.filter(Boolean))];
 const parsePrice=value=>{let s=text(value);if(!s||/%|\d\s*[-–]\s*\d|taksit|premium|kupon|\bx\b/i.test(s))return null;s=s.replace(/TL|TRY|₺/gi,'').replace(/\s/g,'');if(!/^[\d.,]+$/.test(s))return null;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');const n=Number(s);return Number.isFinite(n)&&n>0&&n<10000000?n:null;};
 const meta=k=>document.querySelector('meta[property="'+k+'"]')?.content||'';
 const params=new URL(location.href).searchParams,merchant=params.get('magaza')||params.get('merchantId')||'';
 const observed={size:'',color:''},required={size:false,color:false},ambiguous={size:false,color:false};const sizes=[];
 for(const row of list('[data-test-id="variant-row"]')){
  const name=text(row.querySelector('[data-test-id="variant-name"]')?.textContent).replace(/:$/,'').trim();if(!name)continue;
  const kind=/^renk$/i.test(name)?'color':'size';required[kind]=true;
  const selected=Array.from(row.querySelectorAll('button')).filter(visible).filter(b=>/^seçili\s/i.test(text(b.getAttribute('aria-label')))||['aria-selected','aria-checked','aria-pressed'].some(a=>b.getAttribute(a)==='true')).map(b=>text(b.querySelector('[data-test-id="variant-box-name"]')?.textContent||b.getAttribute('aria-label')?.replace(/^seçili\s+/i,'').replace(new RegExp('^'+name+'\\s+','i'),'')));
  const label=text(row.querySelector('[data-test-id="variant-value"]')?.textContent),values=unique([...selected,label].filter(v=>v&&!/seçiniz|seçin|select|choose/i.test(v)));
  if(values.length!==1||values[0].length>60){ambiguous[kind]=true;continue;}
  if(kind==='color'){if(observed.color&&observed.color!==values[0])ambiguous.color=true;observed.color=values[0];}
  else sizes.push(/^(beden|numara|boyut|kapasite|hacim|dahili hafıza)$/i.test(name)?values[0]:name+': '+values[0]);
 }
 observed.size=unique(sizes).join(' / ');if(observed.size.length>60)ambiguous.size=true;
 for(const kind of ['size','color'])if(ambiguous[kind])observed[kind]='';
 const samePage=raw=>{if(!raw)return false;try{const u=new URL(raw,location.href),id=u.pathname.match(/-(p|pm)-([A-Za-z0-9]{3,40})\/?$/i);return u.protocol==='https:'&&['hepsiburada.com','www.hepsiburada.com','m.hepsiburada.com'].includes(u.hostname)&&!!id&&id[1].toLowerCase()===match[1].toLowerCase()&&id[2].toUpperCase()===productId;}catch{return false;}};
 const products=[];const walk=node=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(walk);return;}if([].concat(node['@type']||[]).includes('Product')){const offers=[].concat(node.offers||[]);if(!parent&&String(node.sku||node.productID||'').toUpperCase()===productId||parent&&(samePage(node.url||node['@id']||'')||offers.some(o=>samePage(o?.url))))products.push(node);}if(node['@graph'])walk(node['@graph']);};
 for(const node of document.querySelectorAll('script[type="application/ld+json"]'))try{walk(JSON.parse(node.textContent));}catch{}
 const product=products.length===1?products[0]:null;
 const prices=[];
 const collect=selectors=>{for(const selector of selectors)for(const e of list(selector)){
  let raw=text(e.textContent);
  // Some mobile layouts render the currency as a sibling of the numeric price.
  // Accept only a parent that is itself a single plain TRY amount, not a discount/instalment panel.
  if(!/(TL|TRY|₺)/i.test(raw)){const parentRaw=text(e.parentElement?.textContent);if(!/(TL|TRY|₺)/i.test(parentRaw)||parsePrice(parentRaw)===null)continue;raw=parentRaw;}
  const value=parsePrice(raw);if(value!==null&&!prices.some(p=>p.value===value))prices.push({value,raw});
 }};
 // Current mobile storefront uses a sticky purchase bar OUTSIDE the title/variant section.
 // Its default-price is not price-current-price. Read its exact semantic price nodes first,
 // just as the Trendyol reader distinguishes ordinary, basket and membership price blocks.
 const bars=Array.from(document.querySelectorAll('[data-test-id="sticky-price"]')).filter(visible);
 let mobilePriceSource='';
 const mobileValues=[];
 const leafAmounts=(block,excludePrevious)=>[block,...block.querySelectorAll('span')].filter(visible).filter(e=>!excludePrevious||!e.closest('[data-test-id="prev-price"]')).map(e=>({value:parsePrice(e.textContent),raw:text(e.textContent)})).filter(p=>p.value!==null&&/(TL|TRY|₺)/i.test(p.raw));
 for(const bar of bars){
  const ordinary=Array.from(bar.querySelectorAll('[data-test-id="default-price"]')).filter(visible);
  if(ordinary.length){for(const block of ordinary)mobileValues.push(...leafAmounts(block,true));mobilePriceSource='visible';}
  else{
   // Basket thresholds, coupons and Premium membership are not guaranteed for the client.
   // Use the visibly stated ordinary price preceding that conditional offer, never the lower offer.
   const conditional=Array.from(bar.querySelectorAll('[data-test-id="checkout-price"],[data-test-id="premium-price"]')).filter(visible);
   for(const block of conditional)for(const prior of block.querySelectorAll('[data-test-id="prev-price"]'))if(visible(prior))mobileValues.push(...leafAmounts(prior,false));
   if(conditional.length)mobilePriceSource='visible-before-conditional-offer';
  }
 }
 for(const p of mobileValues)if(!prices.some(x=>x.value===p.value))prices.push(p);
 if(!bars.length)collect(['[data-test-id="price-current-price"]','[data-test-id="current-price"]','#offering-price']);
 // Generic price nodes may include the old price; they must not override an explicit current price.
 if(!bars.length&&!prices.length)collect(['[data-test-id="price"]']);
 let price=prices.length===1?prices[0].value:null,priceRaw=prices.length===1?prices[0].raw:'',priceSource=price===null?'':mobilePriceSource||'visible';
 // Mobile merchant-label is a badge (e.g. Resmi Satıcı), not the seller name.
 const mobileSeller=text(document.querySelector('[data-test-id="merchant-name"]')?.textContent);
 const sellerLabel=text(document.querySelector('[data-test-id="merchant-label"]')?.textContent);
 const seller=mobileSeller||(/^(resmi satıcı|yetkili satıcı)$/i.test(sellerLabel)?'':sellerLabel.replace(/^satıcı\s*:?\s*/i,'').trim());
 const optionMatch=product&&['size','color'].every(k=>!required[k]||!!observed[k]&&(!product[k]||text(product[k])===observed[k]));
 if(!bars.length&&!prices.length&&product&&optionMatch){const offers=[].concat(product.offers||[]).filter(o=>o&&o['@type']!=='AggregateOffer'&&String(o.priceCurrency).toUpperCase()==='TRY'&&(!o.url||samePage(o.url)||!parent&&String(product.sku).toUpperCase()===productId)&&(!merchant||[o.seller?.name,o.seller?.identifier,o.seller?.['@id']].some(v=>text(v).toLowerCase()===merchant.toLowerCase()))&&(!seller||text(o.seller?.name).toLowerCase()===seller.toLowerCase()));if(offers.length===1){price=parsePrice(offers[0].price);if(price!==null){priceRaw=String(offers[0].price)+' TRY';priceSource='structured';}}}
 // Repeated/missing variant selections never authorize a metadata price for another variant.
 const optionsPending=!!(required.size&&!observed.size||required.color&&!observed.color);
 const displayPrice=optionsPending&&priceSource.startsWith('visible')?price:null;
 if(optionsPending){price=null;priceSource='';}
 const images=Array.from(document.querySelectorAll('img.hb-HbImage-view__image[src*="productimages.hepsiburada.net"]')).filter(visible);let image=images[0]?.currentSrc||images[0]?.src||(!required.size&&!required.color?meta('og:image')||(Array.isArray(product?.image)?product.image[0]:product?.image):'')||'';
 try{const u=new URL(typeof image==='object'?image.url:image,location.href);image=u.protocol==='https:'&&u.hostname==='productimages.hepsiburada.net'&&!u.username&&!u.password&&(u.port===''||u.port==='443')?u.href:'';}catch{image='';}
 return JSON.stringify({source:'hepsiburada',sourceName:'Hepsiburada',productId,pageUrl:location.href,title:text(document.querySelector('h1')?.textContent||product?.name||meta('og:title')),image:String(image).slice(0,2000),price,displayPrice,optionsPending,currency:'TRY',priceRaw,priceSource,merchantId:merchant,observedOptions:observed,optionRequirements:required,warning:prices.length>1?'AMBIGUOUS_PRICE':optionsPending?'OPTIONS_REQUIRED':price===null?'PRICE_NOT_FOUND':''});
})();
