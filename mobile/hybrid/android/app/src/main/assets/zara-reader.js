(() => {
 'use strict';
 const u=new URL(location.href),match=u.pathname.match(/^\/tr\/tr\/[^/]+-p(\d{8})\.html$/);
 if(u.protocol!=='https:'||!['zara.com','www.zara.com'].includes(u.hostname)||u.username||u.password||(u.port&&u.port!=='443')||!match)return JSON.stringify({error:'NOT_PRODUCT'});
 const text=v=>String(v||'').replace(/\s+/g,' ').trim().slice(0,500);
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden],[aria-hidden="true"],del,s,[class*="recommend"],[class*="similar"]');
 const list=s=>Array.from(document.querySelectorAll(s)).filter(visible),unique=a=>[...new Set(a.filter(Boolean))];
 const productId=match[1],key=u.pathname+'?v1='+(u.searchParams.get('v1')||'');
 const number=v=>{const s=text(v);return /^\d{1,7}(\.\d{1,2})?$/.test(s)&&Number(s)>0&&Number(s)<10000000?Number(s):null;};
 const displayNumber=v=>{const s=text(v);if(!/^[\d.,\s]+(?:TL|TRY|₺)$/i.test(s))return null;let n=s.replace(/TL|TRY|₺|\s/gi,'');if(n.includes(','))n=n.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(n))n=n.replace(/\./g,'');return number(n);};
 const root=document.querySelector('.product-detail-card-info')||document.querySelector('.product-detail-info');
 const colors=unique(list('[data-qa-action="select-color"][aria-current="true"],.product-detail-color-selector [aria-checked="true"]').map(e=>text(e.querySelector('.screen-reader-text')?.textContent||e.getAttribute('aria-label')||e.getAttribute('title')||e.textContent)));
 if(!colors.length)colors.push(...unique(list('.product-color-extended-name__name,.product-detail-info__color').map(e=>text(e.textContent))));
 const color=colors.length===1&&colors[0].length<=60?colors[0]:'';
 // Only explicit selected size markers; never the first available size or a model's measurements.
 const sizeNodes=list('.size-selector-sizes [aria-checked="true"],.size-selector-sizes [aria-selected="true"],.product-size-selector [aria-pressed="true"],.product-detail-size-selector [aria-checked="true"],[data-qa-qualifier="product-detail-selected-size"]');
 // Observe a customer's explicit Zara size click without altering Zara's own handlers.
 if(!window.__kintoZaraSelection){window.__kintoZaraSelection={};document.addEventListener('click',event=>{
  const target=event.target?.closest?.('[data-qa-action]');if(!target)return;
  const action=target.getAttribute('data-qa-action');
  if(action==='select-color'){window.__kintoZaraSelection.choice=null;return;}
  if(!['size-in-stock','size-low-on-stock','size-out-of-stock','size-back-soon'].includes(action))return;
  const current=new URL(location.href),selected=Array.from(document.querySelectorAll('[data-qa-action="select-color"][aria-current="true"]')).filter(visible);
  const currentColor=selected.length===1?text(selected[0].querySelector('.screen-reader-text')?.textContent||selected[0].getAttribute('aria-label')||selected[0].textContent):text(document.querySelector('.product-color-extended-name__name')?.textContent);
  const label=text(target.querySelector('[data-qa-qualifier="size-selector-sizes-size-label"]')?.textContent);
  window.__kintoZaraSelection.choice={key:current.pathname+'?v1='+(current.searchParams.get('v1')||''),color:currentColor,size:label,blocked:target.disabled||target.getAttribute('aria-disabled')==='true'||!['size-in-stock','size-low-on-stock'].includes(action)};
 },true);}
 const choice=window.__kintoZaraSelection.choice,activeChoice=choice&&choice.key===key&&choice.color===color?choice:null;
 const sizes=unique(sizeNodes.filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true').map(e=>text(e.querySelector('.size-selector-sizes-size__label')?.textContent||e.getAttribute('data-size-name')||e.textContent)));
 if(!sizes.length&&activeChoice&&!activeChoice.blocked&&activeChoice.size&&activeChoice.size.length<=60)sizes.push(activeChoice.size);
 const size=sizes.length===1&&sizes[0].length<=60?sizes[0]:'';
 const sizeKey=v=>text(v).toLocaleUpperCase('tr-TR').replace(/[^A-Z0-9ÇĞİÖŞÜ]/g,'');
 const groups=[];const walk=n=>{if(!n||typeof n!=='object')return;if(Array.isArray(n)){n.forEach(walk);return;}if([].concat(n['@type']||[]).includes('ProductGroup')&&String(n.productGroupID)===productId)groups.push(n);if(n['@graph'])walk(n['@graph']);};
 for(const e of document.querySelectorAll('script[type="application/ld+json"]'))try{walk(JSON.parse(e.textContent));}catch{}
 const group=groups.length===1?groups[0]:null;
 const samePage=raw=>{try{const x=new URL(raw,u.href);return x.protocol==='https:'&&['zara.com','www.zara.com'].includes(x.hostname)&&!x.username&&!x.password&&(!x.port||x.port==='443')&&x.pathname===u.pathname&&(!u.searchParams.get('v1')||x.searchParams.get('v1')===u.searchParams.get('v1'));}catch{return false;}};
 const variants=(group?.hasVariant||[]).filter(v=>v&&color&&text(v.color)===color&&(!size||sizeKey(v.size)===sizeKey(size)));
 const offers=variants.flatMap(v=>[].concat(v.offers||[]).map(o=>({v,o}))).filter(({o})=>o&&o['@type']!=='AggregateOffer'&&o.priceCurrency==='TRY'&&samePage(o.url));
 const values=[];let priceRaw='',foreign=false;
 if(root)for(const e of Array.from(root.querySelectorAll('[data-qa-id="price-container-current"] data[data-currency],.price-current data[data-currency]')).filter(visible)){
  if(e.getAttribute('data-currency')!=='TRY'){foreign=true;continue;}
  const n=number(e.getAttribute('value')),shown=displayNumber(e.textContent);if(n!==null&&shown===n){values.push(n);priceRaw=text(e.textContent);}
 }
 let prices=unique(values),price=prices.length===1&&!foreign?prices[0]:null,priceSource=price===null?'':'visible';
 // Structured fallback must match current color, country, URL and every matching size price.
 if(!prices.length&&!foreign&&offers.length){const all=offers.map(({o})=>number(o.price)),p=unique(all);if(all.every(n=>n!==null)&&p.length===1){price=p[0];priceRaw=String(price)+' TRY';priceSource='structured';}}
 const variantPriceValues=offers.map(({o})=>number(o.price));
 if(group&&(!variants.length||!offers.length)||!size&&unique(variantPriceValues).length>1||price!==null&&variantPriceValues.length&&variantPriceValues.some(n=>n===null||n!==price)){price=null;priceSource='';}
 if(activeChoice?.blocked||!color||colors.length>1||sizes.length>1||foreign||offers.length&&offers.every(({o})=>/OutOfStock|Discontinued|SoldOut/.test(String(o.availability)))){price=null;priceSource='';}
 let image='';const live=list('.product-detail-card__main-image img,.product-detail-image img,.product-detail-images img');
 image=variants[0]?.image?.[0]||live[0]?.currentSrc||live[0]?.src||'';
 try{const x=new URL(typeof image==='object'?image.url:image,u.href);image=x.protocol==='https:'&&x.hostname==='static.zara.net'&&!x.username&&!x.password&&(!x.port||x.port==='443')&&x.pathname.startsWith('/assets/')?x.href:'';}catch{image='';}
 return JSON.stringify({source:'zara',sourceName:'ZARA',productId,pageUrl:u.href,title:text(root?.querySelector('h1')?.textContent||document.querySelector('h1')?.textContent||group?.name),image,price,currency:'TRY',priceRaw,priceSource,merchantId:'',observedOptions:{size,color},optionRequirements:{size:true,color:true},selectionKey:key,warning:price===null?'PRICE_NOT_CONFIRMED':''});
})();
