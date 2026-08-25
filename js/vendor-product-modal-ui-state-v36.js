/* MESHWAR_VENDOR_PRODUCT_MODAL_UI_STATE_V36 */
(function(){
  'use strict';
  const VERSION='20260825-v36-edit-cost-field4';

  function install(win){
    if(!win||win.__mwVendorProductModalUiStateV36)return;
    const d=win.document,$=id=>d.getElementById(id);

    function ensureEditCostField(){
      let input=$('mwProductCostPrice');
      if(!input){
        const base=$('productBasePrice');
        if(!base)return null;
        input=d.createElement('input');
        input.id='mwProductCostPrice';
        input.name='cost_price';
        input.className='field';
        input.type='number';
        input.min='0';
        input.step='0.01';
        input.required=true;
        input.setAttribute('aria-required','true');
        input.placeholder='سعر التكلفة (Cost Price) *';
        base.insertAdjacentElement('afterend',input);
      }
      input.name='cost_price';
      input.type='number';
      input.min='0';
      input.step='0.01';
      input.required=true;
      input.hidden=false;
      input.removeAttribute('hidden');
      input.setAttribute('aria-required','true');
      input.placeholder='سعر التكلفة (Cost Price) *';
      input.classList.remove('hidden');
      input.style.removeProperty('display');
      input.style.removeProperty('visibility');
      input.style.removeProperty('opacity');
      return input;
    }

    function clearImagePreviews(){
      const file=$('productImageFile');if(file)file.value='';
      const hidden=$('productImage');if(hidden)hidden.value='';
      const preview=$('productImagePreview');
      if(preview){preview.removeAttribute('src');preview.src='';preview.classList.add('hidden')}
      ['imagePreviewContainer','productImageGallery','productImagesPreview','productGalleryPreview','mwProductImageGallery'].forEach(id=>{
        const el=$(id);if(el){el.innerHTML='';el.classList.add('hidden')}
      });
      d.querySelectorAll('#productModal img,#productModal [data-product-image-gallery],#productModal [data-mw-product-image-preview],#productModal .product-image-preview,#productModal .image-preview').forEach(el=>{
        if(el.tagName==='IMG'){el.removeAttribute('src');el.src=''}else el.innerHTML='';
        el.classList.add('hidden');
      });
    }

    function resetAddProductUi(){
      const modal=$('productModal');if(!modal)return;
      const form=modal.querySelector('form');
      if(form){try{form.reset()}catch(_){}}
      modal.querySelectorAll('input,textarea,select').forEach(el=>{
        const tag=el.tagName,type=String(el.type||'').toLowerCase();
        if(tag==='SELECT'){
          el.selectedIndex=0;
          if(el.options?.length)el.value=el.options[0].value;
        }else if(type==='checkbox'||type==='radio')el.checked=false;
        else if(type==='file'){try{el.value=''}catch(_){}}
        else el.value='';
      });
      const threshold=$('productLowThreshold');if(threshold)threshold.value='3';
      const id=$('productId');if(id)id.value='';
      const barcode=$('productBarcode');if(barcode)barcode.value='';
      const cost=ensureEditCostField();if(cost)cost.value='';
      const main=$('mwProductMainCategory');if(main){main.selectedIndex=0;main.value=''}
      const sub=$('mwProductSubCategory');if(sub){sub.innerHTML='<option value="">بدون قسم فرعي</option>';sub.value='';sub.disabled=true}
      const featured=$('mwProductFeatured');if(featured)featured.checked=false;
      win.__mwTaxonomyTouchedV10=false;
      win.__mwTaxonomySelectionV10={main:'',sub:''};
      clearImagePreviews();
      const title=$('productModalTitle');if(title)title.textContent='إضافة منتج';
    }

    function openFreshProductModal(){
      const modal=$('productModal');if(!modal)return;
      win.__mwProductModalMode='add';
      resetAddProductUi();
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      return modal;
    }

    function hydrateCostFromCurrentProduct(){
      const id=String($('productId')?.value||'').trim();
      if(!id)return;
      const input=ensureEditCostField();if(!input)return;
      const product=(Array.isArray(win.products)?win.products:[]).find(p=>String(p.id)===id);
      if(product)input.value=product.cost_price==null?'':String(product.cost_price);
    }

    // Replace only the add opener. saveProduct()/payload remain untouched.
    win.openProductModal=openFreshProductModal;
    win.openProductModal.__mwFreshAddModal=true;

    d.addEventListener('click',e=>{
      const edit=e.target?.closest?.('button[onclick^="editProduct("],button[data-product-id][data-action="edit-product"]');
      if(edit){
        win.__mwProductModalMode='edit';
        ensureEditCostField();
        win.requestAnimationFrame(hydrateCostFromCurrentProduct);
        setTimeout(hydrateCostFromCurrentProduct,80);
        setTimeout(hydrateCostFromCurrentProduct,220);
      }
    },true);

    const modal=$('productModal');
    if(modal){
      new win.MutationObserver(()=>{
        if(modal.classList.contains('hidden'))return;
        const id=String($('productId')?.value||'').trim();
        if(id)hydrateCostFromCurrentProduct();
        else ensureEditCostField();
      }).observe(modal,{attributes:true,attributeFilter:['class']});
    }

    ensureEditCostField();
    win.__mwVendorProductModalUiStateV36=true;
  }

  window.MeshwarVendorProductModalUiStateV36={install,VERSION};
})();
