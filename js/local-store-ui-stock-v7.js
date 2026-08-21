/* MESHWAR_LOCAL_STORE_UI_STOCK_V7 */
(function(){
  const DESCRIPTION_THRESHOLD=180;
  const style=document.createElement('style');
  style.id='mwLocalStoreV7Css';
  style.textContent=`
    .local-v3-desc{display:-webkit-box!important;-webkit-box-orient:vertical!important;-webkit-line-clamp:2!important;line-clamp:2!important;overflow:hidden!important;max-height:2.9em!important;min-height:2.9em!important}
    .mw-detail-description-text.mw-v7-collapsed{max-height:7.2em;overflow:hidden;position:relative;transition:max-height .28s ease}
    .mw-detail-description-text.mw-v7-expanded{max-height:1200px;transition:max-height .35s ease}
    .mw-v7-read-more{margin-top:8px;border:0;background:transparent;color:#9a7415;font-weight:900;font-size:12px;cursor:pointer;padding:4px 0}.dark .mw-v7-read-more{color:#fbbf24}
    .mw-v7-stock-error{margin-top:10px;padding:10px 12px;border-radius:12px;border:1px solid rgba(248,113,113,.45);background:rgba(127,29,29,.12);color:#ef4444;font-size:12px;font-weight:900;line-height:1.6}.dark .mw-v7-stock-error{color:#fca5a5}
  `;
  document.head.appendChild(style);

  function enhanceModal(){
    const modal=document.getElementById('mwLocalProductDetailsModal');
    const text=modal?.querySelector('.mw-detail-description-text');
    if(!text)return;
    const box=text.closest('.mw-detail-description-box');
    box?.querySelector('.mw-v7-read-more')?.remove();
    text.classList.remove('mw-v7-collapsed','mw-v7-expanded');
    const content=String(text.textContent||'').trim();
    if(content.length<=DESCRIPTION_THRESHOLD)return;
    text.classList.add('mw-v7-collapsed');
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='mw-v7-read-more';
    btn.textContent='اقرأ المزيد';
    btn.setAttribute('aria-expanded','false');
    btn.addEventListener('click',()=>{
      const expanded=text.classList.toggle('mw-v7-expanded');
      text.classList.toggle('mw-v7-collapsed',!expanded);
      btn.textContent=expanded?'عرض أقل':'اقرأ المزيد';
      btn.setAttribute('aria-expanded',String(expanded));
    });
    box?.appendChild(btn);
  }

  function matrixInputs(){return[...document.querySelectorAll('#mwMatrixStockEditor [data-matrix-key]')]}
  function variantInputs(){return[...document.querySelectorAll('#mwVariantStockEditor [data-vs-group][data-vs-value]')]}
  function hasMatrix(){return matrixInputs().length>0}
  function normalizeBlankInputs(){
    const targets=hasMatrix()?matrixInputs():[...matrixInputs(),...variantInputs()];
    for(const input of targets){if(String(input.value??'').trim()==='')input.value='0'}
  }
  function findTotalStockInput(){
    const ids=['productStock','productStockQuantity','productStockQty','stockQuantity','stockQty'];
    for(const id of ids){const el=document.getElementById(id);if(el)return el}
    const direct=document.querySelector('#productModal [name="stock_quantity"],#productModal [name="stock"],input[name="stock_quantity"],input[name="stock"]');
    if(direct)return direct;
    const scope=document.getElementById('productModal')||document;
    for(const input of scope.querySelectorAll('input[type="number"]')){
      const wrap=input.closest('label,.field-wrap,.form-group,div');
      const label=String(wrap?.textContent||'');
      if(/المخزون\s*الإجمالي|المخزون|stock/i.test(label)&&!input.hasAttribute('data-matrix-key')&&!input.hasAttribute('data-vs-group'))return input;
    }
    return null;
  }
  function showValidationError(message){
    const box=document.getElementById('mwMatrixStockEditor');
    if(!box){alert(message);return}
    let note=box.querySelector('.mw-v7-stock-error');
    if(!note){note=document.createElement('div');note.className='mw-v7-stock-error';box.prepend(note)}
    note.textContent=message;
    note.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function clearValidationError(){document.querySelector('#mwMatrixStockEditor .mw-v7-stock-error')?.remove()}
  function validateMatrixTotal(){
    const inputs=matrixInputs();
    if(!inputs.length)return true;
    const stockInput=findTotalStockInput();
    if(!stockInput)return true;
    const total=Math.max(0,Math.floor(Number(stockInput.value)||0));
    const sum=inputs.reduce((acc,input)=>acc+Math.max(0,Math.floor(Number(input.value)||0)),0);
    if(sum>total){showValidationError(`مجموع مخزون التركيبات (${sum}) يتجاوز المخزون الإجمالي (${total}). يرجى خفض كميات التركيبات أو زيادة المخزون الإجمالي قبل الحفظ.`);return false}
    clearValidationError();return true;
  }

  function resetVendorProductForm(){
    const ids=['productId','productName','productImage','productDescription','productBasePrice','productDiscountPrice','productStock','productColors','productSizes','productVolumes'];
    for(const id of ids){const el=document.getElementById(id);if(el)el.value=''}
    const file=document.getElementById('productImageFile');if(file)file.value='';
    const preview=document.getElementById('productImagePreview');if(preview){preview.src='';preview.classList.add('hidden')}
    const threshold=document.getElementById('productLowThreshold');if(threshold)threshold.value='3';
    const title=document.getElementById('productModalTitle');if(title)title.textContent='إضافة منتج';
    document.querySelector('#mwMatrixStockEditor .mw-v7-stock-error')?.remove();
  }
  function openAddProductModal(){
    const modal=document.getElementById('productModal');if(!modal)return false;
    resetVendorProductForm();
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    return true;
  }
  function bindAddProductButton(){
    const btn=document.getElementById('addNewProductBtn')||document.querySelector('button[onclick="openProductModal()"]');
    if(!btn||btn.dataset.mwV7AddBound==='1')return false;
    btn.dataset.mwV7AddBound='1';
    document.addEventListener('click',e=>{
      const target=e.target.closest?.('#addNewProductBtn,button[onclick="openProductModal()"]');
      if(target!==btn)return;
      e.preventDefault();
      e.stopImmediatePropagation();
      openAddProductModal();
    },true);
    return true;
  }

  function wrapVendorSave(){
    if(typeof window.saveProduct!=='function'||window.saveProduct.__mwV7Wrapped)return false;
    const original=window.saveProduct;
    const wrapped=async function(...args){
      normalizeBlankInputs();
      if(!validateMatrixTotal())return false;
      return await original.apply(this,args);
    };
    wrapped.__mwV7Wrapped=true;
    wrapped.__mwMatrixWrapped=original.__mwMatrixWrapped;
    wrapped.__mwVariantWrapped=original.__mwVariantWrapped;
    wrapped.__mwMulti=original.__mwMulti;
    window.saveProduct=wrapped;
    return true;
  }
  function startVendor(){
    bindAddProductButton();
    let tries=0;
    const timer=setInterval(()=>{tries++;bindAddProductButton();if((wrapVendorSave()&&bindAddProductButton())||tries>120)clearInterval(timer)},100);
    document.addEventListener('input',e=>{if(e.target.matches?.('#mwMatrixStockEditor [data-matrix-key],#productModal input[type="number"]'))queueMicrotask(validateMatrixTotal)},true);
  }
  function start(){if(document.getElementById('productModal')||/vendor-dashboard\.html$/i.test(location.pathname))startVendor()}
  window.openAddProductModal=openAddProductModal;
  window.MeshwarLocalStoreV7={enhanceModal,validateMatrixTotal,normalizeBlankInputs,openAddProductModal};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
