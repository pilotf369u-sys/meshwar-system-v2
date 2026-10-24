(()=>{'use strict';
 const u=new URL(location.href),hosts=['madparfum.com','www.madparfum.com'];
 if(u.protocol!=='https:'||!hosts.includes(u.hostname)||u.username||u.password||u.port&&u.port!=='443'||!/^\/urun\/[a-z0-9-]+\/$/i.test(u.pathname))return JSON.stringify({error:'NOT_PRODUCT'});
 const text=x=>String(x||'').replace(/\s+/g,' ').trim().slice(0,500),unique=a=>[...new Set(a.filter(x=>x!==null&&x!==''))];
 const same=v=>{try{const x=new URL(v,u);return x.protocol==='https:'&&hosts.includes(x.hostname)&&!x.username&&!x.password&&(!x.port||x.port==='443')&&x.pathname===u.pathname;}catch{return false;}};
 const amount=v=>{let s=text(v).replace(/TRY|TL|₺/gi,'').replace(/\s/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return /^\d{1,7}(\.\d{1,2})?$/.test(s)&&n>0?n:null;};
 const visible=e=>e&&e.getClientRects().length&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden],[aria-hidden="true"],del,s,[class*="old-price"],[class*="retail-price"]');
 const products=[];for(const s of document.querySelectorAll('script[type="application/ld+json"]'))try{const walk=x=>{if(Array.isArray(x))return x.forEach(walk);if(!x||typeof x!=='object')return;if([].concat(x['@type']||[]).includes('Product')&&same(x.offers?.url))products.push(x);if(x['@graph'])walk(x['@graph']);};walk(JSON.parse(s.textContent));}catch{}
 const p=products.length===1?products[0]:null,titles=Array.from(document.querySelectorAll('h1[data-testid="product-name"]')).filter(visible),h=titles.length===1?titles[0]:null;
 let root=h;while(root&&root!==document.body&&!root.querySelector('[data-testid="product-add-to-cart"]'))root=root.parentElement;
 let warning='',price=null,size='',color='',image='';
 if(!p||!h||!root||root===document.body||!same(document.querySelector('link[rel="canonical"]')?.href)||text(p.name)!==text(h.textContent)||!text(p.sku))warning='MAD_IDENTITY';
 const nodes=Array.from(root?.querySelectorAll('[data-testid="price"]')||[]).filter(visible),values=nodes.map(x=>amount(x.textContent)),prices=unique(values);
 if(prices.length!==1||values.some(x=>x===null))warning='MAD_PRICE_MISSING_OR_CONFLICT';
 if(!p||String(p.offers?.priceCurrency).toUpperCase()!=='TRY'||amount(p.offers?.price)!==prices[0])warning='MAD_PRICE_MISMATCH';
 if(!/\/InStock$/.test(p?.offers?.availability||''))warning='MAD_UNAVAILABLE';
 const groups=Array.from(root?.querySelectorAll('[data-testid^="product-variant-"]')||[]),options=[];
 for(const g of groups){const buttons=Array.from(g.querySelectorAll('button')).filter(visible),selected=buttons.length===1?text(buttons[0].querySelector('span')?.textContent):'';if(!selected||/seç|select|choose/i.test(selected)||buttons[0]?.disabled)warning='MAD_OPTIONS_REQUIRED';else options.push(selected);}
 size=options.join('; ');if(size.length>60)warning='MAD_OPTIONS_LONG';
 const controls=Array.from(root?.querySelectorAll('[data-testid="product-add-to-cart"]')||[]);if(!controls.length||controls.every(x=>x.disabled||x.getAttribute('aria-disabled')==='true'))warning='MAD_UNAVAILABLE';
 try{const x=new URL([].concat(p?.image||[])[0]);if(x.protocol==='https:'&&x.hostname==='ba62e8.cdn.akinoncloud.com'&&x.pathname.startsWith('/products/')&&!x.username&&!x.password&&(!x.port||x.port==='443'))image=x.href;}catch{}
 if(!warning)price=prices[0];
 return JSON.stringify({source:'madparfum',sourceName:'MAD Parfumeur',productId:text(p?.sku),pageUrl:u.href,title:text(h?.textContent),image,price,currency:'TRY',priceSource:price===null?'':'visible',observedOptions:{size,color},optionRequirements:{size:groups.length>0,color:false},warning,diagnostics:{products:products.length,titles:titles.length,prices,groups:groups.length}});
})();
