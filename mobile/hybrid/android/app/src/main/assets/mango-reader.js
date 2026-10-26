(()=>{'use strict';
 const u=new URL(location.href),id=u.pathname.match(/^\/tr\/tr\/p\/.+\/(\d{8})\/(\d{2})\/(\d{2})\/?$/);
 if(u.protocol!=='https:'||u.hostname!=='shop.mango.com'||u.username||u.password||u.port&&u.port!=='443'||!id)return JSON.stringify({error:'NOT_PRODUCT'});
 const text=x=>String(x||'').replace(/\s+/g,' ').trim().slice(0,500),uniq=a=>[...new Set(a.filter(x=>x!==null&&x!==''))],key=id.slice(1).join('/');
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden],del,s,[class*="oldPrice"],[class*="previousPrice"],[class*="crossed"]');
 const amount=v=>{let s=text(v).replace(/TRY|TL|₺/gi,'').replace(/\s/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return /^\d{1,7}(\.\d{1,2})?$/.test(s)&&n>0?n:null;};
 const heads=Array.from(document.querySelectorAll('h1[class*="ProductDetail-"]')).filter(visible),h=heads.length===1?heads[0]:null,root=h?.closest('[class*="ProductDetail-"][class*="__product"]');
 let warning='',price=null,color='',size='',image='';
 const bullets=Array.from(root?.querySelectorAll('[class*="ColorBullet-"][class*="__selected"] img')||[]),selected=bullets.length===1?bullets[0]:null;
 let selectedUrl;try{selectedUrl=new URL(selected?.getAttribute('src'),u);}catch{}
 if(!root||!h||!selectedUrl||selectedUrl.hostname!=='media.mango.com'||!selectedUrl.pathname.includes('/'+id[1]+'-'+id[2]+'-'))warning='MANGO_IDENTITY';
 color=text(selected?.getAttribute('alt')).replace(/^Seçilen renk\s*/i,'');if(!color||color===text(selected?.getAttribute('alt')))warning='MANGO_COLOR_REQUIRED';
 const offers=Array.from(root?.querySelectorAll('[itemprop="offers"],[itemProp="offers"]')||[]).filter(visible),prices=[];
 for(const o of offers){const v=amount(o.textContent),meta=amount(o.querySelector('[itemprop="price"],[itemProp="price"]')?.getAttribute('content')),currency=o.querySelector('[itemprop="priceCurrency"],[itemProp="priceCurrency"]')?.getAttribute('content');if(v===null||v!==meta||currency!=='TRY')warning='MANGO_PRICE_MISMATCH';else prices.push(v);}
 if(uniq(prices).length!==1)warning='MANGO_PRICE_MISSING_OR_CONFLICT';
 const sizes=Array.from(root?.querySelectorAll('button[id^="product.sizeSelector."]')||[]),selectedSizes=sizes.filter(e=>e.getAttribute('aria-pressed')==='true'||e.getAttribute('aria-selected')==='true'||/Chip-[^ ]*__selected/.test(e.className));
 // Record only an actual click on an available size in the current product root.
 if(!window.__kintoMangoSizeListener){window.__kintoMangoSizeListener=true;document.addEventListener('click',e=>{const b=e.target.closest?.('button[id^="product.sizeSelector.available."]');if(!b||b.disabled||b.getAttribute('aria-disabled')==='true'||!b.closest('[class*="ProductDetail-"][class*="__product"]'))return;const now=new URL(location.href).pathname.match(/\/(\d{8})\/(\d{2})\/(\d{2})\/?$/);if(now)window.__kintoMangoSize={key:now.slice(1).join('/'),id:b.id,value:text(b.querySelector('[class*="SizeLabel-"] span')?.textContent||b.textContent)};},true);}
 if(selectedSizes.length===1)size=text(selectedSizes[0].querySelector('[class*="SizeLabel-"] span')?.textContent||selectedSizes[0].textContent);
 else if(!selectedSizes.length&&window.__kintoMangoSize?.key===key){const saved=window.__kintoMangoSize,b=sizes.find(x=>x.id===saved.id);if(b&&!b.disabled&&b.getAttribute('aria-disabled')!=='true'&&text(b.querySelector('[class*="SizeLabel-"] span')?.textContent||b.textContent)===saved.value)size=saved.value;}
 if(selectedSizes.some(x=>x.disabled||x.getAttribute('aria-disabled')==='true'))warning='MANGO_SIZE_UNAVAILABLE';
 if(selectedSizes.length>1||!sizes.length)warning='MANGO_OPTIONS_UNKNOWN';
 const availableSizes=!warning?uniq(sizes.filter(e=>e.id.startsWith('product.sizeSelector.available.')&&!e.disabled&&e.getAttribute('aria-disabled')!=='true').map(e=>text(e.querySelector('[class*="SizeLabel-"] span')?.textContent||e.textContent)).filter(v=>v&&v.length<=60)):[];
 const pending=!warning&&!size;
 const imgs=Array.from(root?.closest('article')?.querySelectorAll('img[class*="SlideshowWrapper-"]')||[]);for(const img of imgs)try{const x=new URL(img.getAttribute('src'),u);if(x.protocol==='https:'&&x.hostname==='media.mango.com'&&x.pathname.startsWith('/is/image/punto/'+id[1]+'-'+id[2]+'-')&&!x.username&&!x.password&&(!x.port||x.port==='443')){image=x.href;break;}}catch{}
 if(!warning&&size)price=prices[0];
 return JSON.stringify({source:'mango',sourceName:'Mango',productId:id[1]+'-'+id[2],pageUrl:u.href,title:text(h?.textContent),image,price,currency:'TRY',priceSource:price===null?'':'visible',displayPrice:!warning?prices[0]:null,optionsPending:pending,availableSizes,observedOptions:{size,color},optionRequirements:{size:true,color:true},warning:warning||(!size?'MANGO_OPTIONS_REQUIRED':''),diagnostics:{titles:heads.length,colors:bullets.length,prices:uniq(prices),sizes:sizes.length}});
})();
