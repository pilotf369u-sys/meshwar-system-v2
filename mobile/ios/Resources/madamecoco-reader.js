(() => {
 'use strict';
 const u=new URL(location.href),m=u.pathname.match(/-([a-z0-9]{5,30})-(\d{1,5})\/?$/i);
 if(u.protocol!=='https:'||!['madamecoco.com','www.madamecoco.com'].includes(u.hostname)||u.username||u.password||u.port&&u.port!=='443'||!m||!/[a-z]/i.test(m[1])||!/[0-9]/.test(m[1]))return JSON.stringify({error:'NOT_PRODUCT'});
 const text=x=>String(x||'').replace(/\s+/g,' ').trim().slice(0,500),norm=x=>text(x).normalize('NFKC').toLocaleLowerCase('tr-TR');
 const same=raw=>{try{const x=new URL(raw,u.href);return x.protocol==='https:'&&['madamecoco.com','www.madamecoco.com'].includes(x.hostname)&&!x.username&&!x.password&&(!x.port||x.port==='443')&&x.pathname.replace(/\/+$/,'')===u.pathname.replace(/\/+$/,'');}catch{return false;}};
 const visible=e=>!!e&&e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden'&&!e.closest('[hidden],[aria-hidden="true"],del,s,.price.-retail,.retail-price,.old-price,[class*="installment"],[class*="coupon"],[class*="basket-discount"]');
 const unique=a=>[...new Set(a.filter(x=>x!==null&&x!==''&&x!==undefined))];
 const amount=raw=>{let s=text(raw).replace(/(?:TRY|TL|₺)/gi,'').replace(/\s/g,'');if(!/^[\d.,]+$/.test(s))return null;if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');else if(/^\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');const n=Number(s);return /^\d{1,7}(\.\d{1,2})?$/.test(s)&&n>0&&n<10000000?n:null;};
 const groups=[];for(const el of document.querySelectorAll('script[type="application/ld+json"]'))try{const walk=v=>{if(Array.isArray(v)){v.forEach(walk);return;}if(!v||typeof v!=='object')return;if([].concat(v['@type']||[]).includes('ProductGroup')&&same(v.url)&&String(v.productGroupID).toLowerCase()===m[1].toLowerCase())groups.push(v);if(v['@graph'])walk(v['@graph']);};walk(JSON.parse(el.textContent));}catch{}
 const group=groups.length===1?groups[0]:null;
 const candidates=Array.from(document.querySelectorAll('.product-info')).filter(r=>r.querySelector('h1.product-info__title'));
 const roots=candidates.map(root=>({root,skus:unique(Array.from(root.querySelectorAll('[data-sku]')).map(e=>text(e.getAttribute('data-sku'))))})).filter(x=>x.skus.length===1&&/^[a-z0-9]{5,40}$/i.test(x.skus[0]));
 const root=roots.length===1?roots[0].root:null,sku=roots.length===1?roots[0].skus[0]:'';
 let warning='',price=null,priceSource='',color='',size='',image='',title=text(root?.querySelector('h1.product-info__title')?.textContent);
 if(!root||!group)warning='C_PRODUCT_IDENTITY';
 const variants=(group?.additionalVariants||group?.hasVariant||[]).filter(v=>v&&typeof v==='object'&&String(v.sku)===sku&&same(v.url));
 const variant=variants.length===1?variants[0]:null,offer=variant&&[].concat(variant.offers||[]).length===1?[].concat(variant.offers)[0]:null;
 if(!variant||!offer||!same(offer.url)||String(offer.priceCurrency).toUpperCase()!=='TRY'||norm(offer.seller?.name)!=='madame coco')warning='C_VARIANT_IDENTITY';
 const colorGroup=root?.querySelector('.product-info__variants pz-variant[key="renk"]'),sizeGroup=root?.querySelector('.product-info__variants pz-variant[key="boyut"]');
 const selected=(g,isColor)=>{if(!g)return [];const nodes=Array.from(g.querySelectorAll(isColor?'a.variant-color.-selected,pz-variant-option[selected]':'pz-variant-option[selected]'));return unique(nodes.filter(e=>!e.classList.contains('-disabled')&&(!e.getAttribute('url')||same(e.getAttribute('url')))&&(!e.getAttribute('href')||same(e.getAttribute('href')))).map(e=>text(e.getAttribute('value')||e.getAttribute('label')||e.textContent)).map(norm));};
 const colors=selected(colorGroup,true),sizes=selected(sizeGroup,false);
 color=colors.length===1?(variant&&norm(variant.color)===colors[0]?text(variant.color):colors[0]):!colors.length?text(variant?.color):'';
 size=sizes.length===1?(variant&&norm(variant.size)===sizes[0]?text(variant.size):sizes[0]):!sizes.length?text(variant?.size):'';
 if(colors.length>1||sizes.length>1||variant&&(color&&norm(color)!==norm(variant.color)||size&&norm(size)!==norm(variant.size)))warning='C_OPTIONS_MISMATCH';
 if(colorGroup&&!color||sizeGroup&&!size)warning='C_OPTIONS_REQUIRED';
 const bars=Array.from(document.querySelectorAll('.sticky-add-to-cart')).filter(b=>{const ids=unique(Array.from(b.querySelectorAll('[data-sku]')).map(e=>text(e.getAttribute('data-sku'))));return ids.length===1&&ids[0]===sku;});
 const panels=[...(root?[root]:[]),...bars];
 const priceNodes=unique(panels.flatMap(p=>Array.from(p.querySelectorAll('.product-info__price .price pz-price')))).filter(visible);
 const readPrice=e=>{const values=unique([amount(e.textContent),amount(e.getAttribute('value')),amount(e.getAttribute('price'))]);return values.length===1?values[0]:null;};
 const values=priceNodes.map(readPrice),prices=unique(values);
 const buttons=unique(panels.flatMap(p=>Array.from(p.querySelectorAll('.js-add-to-cart-button[data-sku]')))).filter(e=>e.getAttribute('data-sku')===sku);
 const buttonPrices=unique(buttons.map(e=>amount(e.getAttribute('data-price'))));
 if(prices.length!==1||values.some(x=>x===null))warning=prices.length>1?'C_PRICE_AMBIGUOUS':'C_PRICE_MISSING';
 else if(buttonPrices.length!==1||buttonPrices[0]!==prices[0]||offer&&amount(offer.price)!==prices[0])warning='C_PRICE_MISMATCH';
 if(offer&&/OutOfStock|Discontinued|SoldOut/i.test(String(offer.availability))||buttons.length&&buttons.every(e=>e.hasAttribute('disabled')||e.classList.contains('-disabled')))warning='C_UNAVAILABLE';
 const otherGroups=Array.from(root?.querySelectorAll('.product-info__variants pz-variant')||[]).filter(g=>!['renk','boyut'].includes(g.getAttribute('key'))),details=[];
 for(const g of otherGroups){const values=selected(g,false);if(values.length!==1)warning='C_OPTIONS_REQUIRED';else details.push(text(g.getAttribute('name')||g.getAttribute('key'))+': '+values[0]);}
 if(details.length){size=[size,...details].filter(Boolean).join('; ');if(size.length>60)warning='C_OPTION_DETAILS_LONG';}
 if([colorGroup,sizeGroup,...otherGroups].some(g=>g?.querySelector('pz-variant-option[selected].-disabled,pz-variant-option[selected][disabled],a.variant-color.-selected.-disabled')))warning='C_UNAVAILABLE';
 if(!warning){price=prices[0];priceSource='visible';}
 try{const x=new URL(typeof variant?.image==='string'?variant.image:variant?.image?.[0],u.href);if(x.protocol==='https:'&&x.hostname==='4d0873.akinoncloudcdn.com'&&!x.username&&!x.password&&(!x.port||x.port==='443')&&x.pathname.startsWith('/products/'))image=x.href;}catch{}
 return JSON.stringify({source:'madamecoco',sourceName:'Madame Coco',productId:sku,pageUrl:u.href,title,image,price,currency:'TRY',priceRaw:price===null?'':String(price)+' TRY',priceSource,merchantId:'',observedOptions:{size,color},optionRequirements:{size:!!sizeGroup||otherGroups.length>0,color:!!colorGroup},warning,diagnostics:{groups:groups.length,roots:roots.length,variants:variants.length,visiblePrices:priceNodes.length,prices,buttonPrices}});
})();
