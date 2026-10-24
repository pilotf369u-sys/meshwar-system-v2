(()=>{'use strict';
 const u=new URL(location.href),hosts=['madparfum.com','www.madparfum.com'];
 if(u.protocol!=='https:'||!hosts.includes(u.hostname)||u.username||u.password||u.port&&u.port!=='443'||!/^\/urun\/[a-z0-9-]+\/$/i.test(u.pathname))return JSON.stringify({error:'NOT_PRODUCT'});
 const text=x=>String(x||'').replace(/\s+/g,' ').trim().slice(0,500),unique=a=>[...new Set(a.filter(x=>x!==null&&x!==''))];
 const norm=x=>text(x).normalize('NFKC').toLocaleLowerCase('tr-TR').replace(/(\d)\s*[x×]\s*(?=\d)/g,'$1x');
 const same=v=>{try{const x=new URL(v,u);return x.protocol==='https:'&&hosts.includes(x.hostname)&&!x.username&&!x.password&&(!x.port||x.port==='443')&&x.pathname.replace(/\/+$/,'')===u.pathname.replace(/\/+$/,'');}catch{return false;}};
 const amount=v=>{let s=text(v).replace(/TRY|TL|₺/gi,'').replace(/\s/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');const n=Number(s);return /^\d{1,7}(\.\d{1,2})?$/.test(s)&&n>0?n:null;};
 // aria-hidden alone is an accessibility hint, not visual hiding of a mobile price copy.
 const visible=e=>e&&e.getClientRects().length&&getComputedStyle(e).display!=='none'&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden],del,s,[data-testid="retail-price"],.line-through,[class*="old-price"],[class*="retail-price"]');
 const products=[];for(const s of document.querySelectorAll('script[type="application/ld+json"]'))try{const walk=x=>{if(Array.isArray(x))return x.forEach(walk);if(!x||typeof x!=='object')return;if([].concat(x['@type']||[]).includes('Product')&&same(x.offers?.url))products.push(x);if(x['@graph'])walk(x['@graph']);};walk(JSON.parse(s.textContent));}catch{}
 // Hydration can mount equivalent schema copies. Conflicting SKU/offer/options still reject.
 const identities=new Map();for(const p of products){const o=p.offers;const k=JSON.stringify([text(p.sku),norm(p.name),String(o.priceCurrency).toUpperCase(),amount(o.price),text(o.availability),norm(p.size),norm(p.color)]);identities.set(k,p);}
 const p=identities.size===1?[...identities.values()][0]:null,titles=Array.from(document.querySelectorAll('h1[data-testid="product-name"]')).filter(visible),h=titles.length===1?titles[0]:null;
 const needsOptions=!!document.querySelector('[data-testid^="product-variant-"]');
 // The mobile buy bar can be portalled out of the title/variant panel. It must not determine the purchase root.
 let root=h;while(root&&root!==document.body&&(!root.querySelector('[data-testid="price"]')||needsOptions&&!root.querySelector('[data-testid^="product-variant-"]')))root=root.parentElement;
 if(root===document.body)root=null;
 const issues=[],canonicals=Array.from(document.querySelectorAll('link[rel="canonical"]'));
 // Observed live MAD hydration appends href="undefined/urun/<same-slug>/".
 // Ignore only that exact same-product duplicate, and still require a correct canonical.
 const brokenDuplicate=raw=>{try{const x=new URL(raw,u),path=u.pathname.replace(/\/+$/,'');return x.protocol==='https:'&&hosts.includes(x.hostname)&&!x.username&&!x.password&&(!x.port||x.port==='443')&&x.pathname.replace(/\/+$/,'')===path+'/undefined'+path;}catch{return false;}};
 const identityChecks={schema:!!p,title:!!h,root:!!root,canonical:canonicals.some(x=>same(x.href))&&canonicals.every(x=>same(x.href)||brokenDuplicate(x.href)),name:norm(p?.name)===norm(h?.textContent),sku:!!text(p?.sku)};
 if(Object.values(identityChecks).some(x=>!x))issues.push('MAD_IDENTITY');
 const controls=Array.from(document.querySelectorAll('[data-testid="product-add-to-cart"]')),panels=root?[root]:[];
 // Admit only purchase-price ancestors, never the body/recommendation/list price regions.
 for(const b of controls){let q=b.parentElement;while(q&&q!==document.body&&!q.querySelector('[data-testid="price"]'))q=q.parentElement;if(q&&q!==document.body&&!q.querySelector('[data-testid="product-card"],h2')&&!Array.from(q.querySelectorAll('[data-testid="product-name"]')).some(t=>t!==h))panels.push(q);}
 const nodes=unique(panels.flatMap(r=>Array.from(r.querySelectorAll('[data-testid="price"]')))).filter(visible),values=nodes.map(x=>amount(x.textContent)),prices=unique(values);
 if(prices.length!==1||values.some(x=>x===null))issues.push('MAD_PRICE_MISSING_OR_CONFLICT');
 if(!p||String(p.offers?.priceCurrency).toUpperCase()!=='TRY'||amount(p.offers?.price)!==prices[0])issues.push('MAD_PRICE_MISMATCH');
 if(!/\/InStock$/.test(p?.offers?.availability||''))issues.push('MAD_UNAVAILABLE');
 const groups=Array.from(root?.querySelectorAll('[data-testid^="product-variant-"]')||[]),options=[];
 for(const g of groups){const selected=Array.from(g.querySelectorAll('select')).flatMap(s=>Array.from(s.options||s.querySelectorAll('option')).filter(o=>o.selected||o.hasAttribute('selected')).map(o=>text(o.textContent)));const headers=Array.from(g.querySelectorAll('button.w-full')).filter(visible).map(b=>text(b.querySelector('span')?.textContent));const choices=unique([...selected,...headers]);if(choices.length!==1||/seç|select|choose/i.test(choices[0]||''))issues.push('MAD_OPTIONS_REQUIRED');else options.push(choices[0]);}
 const size=options.join('; ');if(size.length>60)issues.push('MAD_OPTIONS_LONG');
 if(!controls.length||controls.every(x=>x.disabled||x.getAttribute('aria-disabled')==='true'))issues.push('MAD_UNAVAILABLE');
 let image='';try{const x=new URL([].concat(p?.image||[])[0]);if(x.protocol==='https:'&&x.hostname==='ba62e8.cdn.akinoncloud.com'&&x.pathname.startsWith('/products/')&&!x.username&&!x.password&&(!x.port||x.port==='443'))image=x.href;}catch{}
 const price=issues.length?null:prices[0];
 return JSON.stringify({source:'madparfum',sourceName:'MAD Parfumeur',productId:text(p?.sku),pageUrl:u.href,title:text(h?.textContent),image,price,currency:'TRY',priceSource:price===null?'':'visible',observedOptions:{size,color:''},optionRequirements:{size:groups.length>0,color:false},warning:issues[0]||'',diagnostics:{issues,products:products.length,identities:identities.size,titles:titles.length,root:!!root,panels:unique(panels).length,visiblePrices:nodes.length,prices,groups:groups.length,canonicalMatches:canonicals.filter(x=>same(x.href)).length,canonicalTotal:canonicals.length,ignoredBrokenDuplicates:canonicals.filter(x=>brokenDuplicate(x.href)).length,identityChecks,schemaName:text(p?.name),visibleTitle:text(h?.textContent)}});
})();
