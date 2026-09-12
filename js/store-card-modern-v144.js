(()=>{'use strict';
  const grid=document.getElementById('localStoreProductsGrid');
  if(!grid||grid.dataset.kintoModernV144==='1')return;
  grid.dataset.kintoModernV144='1';
  const customerId=String(localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId')||'guest').trim()||'guest';
  const storageKey=`kinto_storefront_favorites_v144_${customerId}`;
  const read=()=>{try{const value=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(value)?value:[]}catch{return[]}};
  const write=value=>{try{localStorage.setItem(storageKey,JSON.stringify(value))}catch(error){console.warn('KINTO favorites storage unavailable:',error)}};
  const heart='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.7-7.5 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z"/></svg>';
  function decorate(card){
    if(!card||card.dataset.kintoModernV144==='1')return;
    const wrap=card.querySelector('.local-v3-img-wrap'),image=wrap?.querySelector('.local-v3-img');
    if(!wrap||!image)return;
    card.dataset.kintoModernV144='1';
    const backdrop=document.createElement('span');backdrop.className='kinto-media-backdrop';backdrop.setAttribute('aria-hidden','true');
    const backdropImage=document.createElement('img');backdropImage.alt='';backdropImage.src=image.currentSrc||image.src;backdrop.appendChild(backdropImage);wrap.prepend(backdrop);
    image.addEventListener('load',()=>{backdropImage.src=image.currentSrc||image.src},{passive:true});
    const productId=String(card.dataset.productCard||'');
    const button=document.createElement('button');button.type='button';button.className='kinto-favorite-btn';button.innerHTML=heart;
    const sync=()=>{const active=read().some(item=>String(item.productId)===productId);button.setAttribute('aria-pressed',String(active));button.setAttribute('aria-label',active?'إزالة من المفضلة':'إضافة إلى المفضلة');button.title=button.getAttribute('aria-label')};
    sync();button.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();let items=read();const exists=items.some(item=>String(item.productId)===productId);
      if(exists)items=items.filter(item=>String(item.productId)!==productId);else items.unshift({productId,storeId:String(window.__KINTO_STORE_ID__||''),name:String(card.querySelector('.local-v3-name')?.textContent||'منتج').trim(),image:String(image.currentSrc||image.src||''),savedAt:new Date().toISOString()});
      write(items);sync();window.dispatchEvent(new CustomEvent('kinto:favorites-changed',{detail:{productId,favorite:!exists,items}}));
    });wrap.appendChild(button);
  }
  const decorateAll=()=>grid.querySelectorAll('.local-v3-card[data-product-card]').forEach(decorate);
  let queued=false;const observer=new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;decorateAll()})});
  observer.observe(grid,{childList:true,subtree:true});decorateAll();
})();
