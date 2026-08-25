/* MESHWAR_VENDOR_PRODUCT_MODAL_UI_STATE_V36 */
(function(){
  'use strict';
  const VERSION='20260825-v36-modal-state1';

  function install(win){
    if(!win||win.__mwVendorProductModalUiStateV36)return;
    const d=win.document,$=id=>d.getElementById(id);

    function clearImagePreviews(){
      const file=$('productImageFile');if(file)file.value='';
      const hidden=$('productImage');if(hidden)hidden.value='';
      const preview=$('productImagePreview');
      if(preview){preview.removeAttribute('src');preview.src='';preview.classList.add('hidden')}
      ['productImageGallery','productImagesPreview','productGalleryPreview','mwProductImageGallery'].forEach(id=>{
        const el=$(id);if(el)el.innerHTML='';
      });
      d.querySelectorAll('[data-product-image-gallery],[data-mw-product-image-preview]').forEach(el=>{el.innerHTML='';el.classList.add('hidden')});
    }

    function hydrateCostFromCurrentProduct(){
      const id=String($('productId')?.value||'').trim();
      const input=$('mwProductCostPrice');
      if(!id||!input)return;
      const product=(Array.isArray(win.products)?win.products:[]).find(p=>String(p.id)===id);
      if(product)input.value=product.cost_price==null?'':String(product.cost_price);
    }

    d.addEventListener('click',e=>{
      const add=e.target?.closest?.('button[onclick="openProductModal()"]');
      if(add){
        win.requestAnimationFrame(()=>{
          const cost=$('mwProductCostPrice');if(cost)cost.value='';
          clearImagePreviews();
          setTimeout(()=>{const c=$('mwProductCostPrice');if(c)c.value='';clearImagePreviews()},80);
        });
        return;
      }
      const edit=e.target?.closest?.('button[onclick^="editProduct("]');
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
          else{const cost=$('mwProductCostPrice');if(cost)cost.value='';clearImagePreviews()}
        }
        wasOpen=open;
      }).observe(modal,{attributes:true,attributeFilter:['class']});
    }

    win.__mwVendorProductModalUiStateV36=true;
  }

  window.MeshwarVendorProductModalUiStateV36={install,VERSION};
})();
