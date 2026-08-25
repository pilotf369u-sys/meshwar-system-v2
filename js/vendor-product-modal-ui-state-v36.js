/* MESHWAR_VENDOR_PRODUCT_MODAL_UI_STATE_V36 */
(function(){
  'use strict';
  const VERSION='20260825-v36-modal-state2';

  function install(win){
    if(!win||win.__mwVendorProductModalUiStateV36)return;
    const d=win.document,$=id=>d.getElementById(id);

    function clearImagePreviews(){
      const file=$('productImageFile');if(file)file.value='';
      const hidden=$('productImage');if(hidden)hidden.value='';
      const preview=$('productImagePreview');
      if(preview){preview.removeAttribute('src');preview.src='';preview.classList.add('hidden')}
      ['productImageGallery','productImagesPreview','productGalleryPreview','mwProductImageGallery'].forEach(id=>{
        const el=$(id);if(el){el.innerHTML='';el.classList.add('hidden')}
      });
      d.querySelectorAll('#productModal [data-product-image-gallery],#productModal [data-mw-product-image-preview],#productModal .product-image-preview,#productModal .image-preview').forEach(el=>{
        if(el.tagName==='IMG'){el.removeAttribute('src');el.src=''}else el.innerHTML='';
        el.classList.add('hidden');
      });
    }

    function resetAddProductUi(){
      const modal=$('productModal');if(!modal)return;
      modal.querySelectorAll('form').forEach(form=>{try{form.reset()}catch(_){}});
      modal.querySelectorAll('input,textarea,select').forEach(el=>{
        const tag=el.tagName;
        const type=String(el.type||'').toLowerCase();
        if(tag==='SELECT'){
          el.selectedIndex=0;
          if(el.options?.length)el.value=el.options[0].value;
          return;
        }
        if(type==='checkbox'||type==='radio'){el.checked=false;return}
        if(type==='file'){try{el.value=''}catch(_){};return}
        el.value='';
      });
      const threshold=$('productLowThreshold');if(threshold)threshold.value='3';
      const id=$('productId');if(id)id.value='';
      const barcode=$('productBarcode');if(barcode)barcode.value='';
      const cost=$('mwProductCostPrice');if(cost)cost.value='';
      clearImagePreviews();
      const title=$('productModalTitle');if(title)title.textContent='إضافة منتج';
    }

    function openCleanAddModal(){
      const modal=$('productModal');if(!modal)return;
      resetAddProductUi();
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      // One-shot post-open cleanup only, to defeat legacy hydration without any loop.
      win.requestAnimationFrame(resetAddProductUi);
      setTimeout(resetAddProductUi,80);
      setTimeout(resetAddProductUi,220);
    }

    function hydrateCostFromCurrentProduct(){
      const id=String($('productId')?.value||'').trim();
      const input=$('mwProductCostPrice');
      if(!id||!input)return;
      const product=(Array.isArray(win.products)?win.products:[]).find(p=>String(p.id)===id);
      if(product)input.value=product.cost_price==null?'':String(product.cost_price);
    }

    function isAddButton(target){
      const btn=target?.closest?.('button,a,[role="button"]');if(!btn)return null;
      const onclick=String(btn.getAttribute('onclick')||'');
      const action=String(btn.dataset?.action||'');
      const text=String(btn.textContent||'').replace(/\s+/g,' ').trim();
      if(/openProductModal\s*\(/.test(onclick)||/add[-_ ]?product/i.test(action)||/إضافة\s+منتج/.test(text))return btn;
      return null;
    }

    d.addEventListener('click',e=>{
      const add=isAddButton(e.target);
      if(add){
        e.preventDefault();
        e.stopImmediatePropagation();
        openCleanAddModal();
        return;
      }
      const edit=e.target?.closest?.('button[onclick^="editProduct("],button[data-product-id][data-action="edit-product"]');
      if(edit){
        win.requestAnimationFrame(hydrateCostFromCurrentProduct);
        setTimeout(hydrateCostFromCurrentProduct,80);
        setTimeout(hydrateCostFromCurrentProduct,220);
      }
    },true);

    const modal=$('productModal');
    if(modal){
      let wasOpen=!modal.classList.contains('hidden');
      new win.MutationObserver(()=>{
        const open=!modal.classList.contains('hidden');
        if(open&&!wasOpen){
          const id=String($('productId')?.value||'').trim();
          if(id){setTimeout(hydrateCostFromCurrentProduct,0);setTimeout(hydrateCostFromCurrentProduct,140)}
        }
        wasOpen=open;
      }).observe(modal,{attributes:true,attributeFilter:['class']});
    }

    win.__mwVendorProductModalUiStateV36=true;
  }

  window.MeshwarVendorProductModalUiStateV36={install,VERSION};
})();
