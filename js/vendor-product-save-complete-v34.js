/* MESHWAR_VENDOR_PRODUCT_SAVE_COMPLETE_V34 */
(function(){
  'use strict';
  const VERSION='20260825-v34-required-cost3';
  const arr=v=>Array.isArray(v)?v.map(x=>String(x??'').trim()).filter(Boolean):[];
  const parse=v=>{if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return{...v};try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?{...x}:{}}catch{return{}}};
  const uniq=v=>[...new Set(v.filter(Boolean))];

  function install(win){
    if(!win||win.__mwVendorProductSaveCompleteV34)return;
    const d=win.document,$=id=>d.getElementById(id);
    if(typeof win.saveProduct!=='function'||!win.sb){setTimeout(()=>install(win),80);return}

    function ensureCostField(){
      let input=$('mwProductCostPrice');
      if(input){input.type='number';input.min='0';input.step='0.01';input.required=true;input.name='cost_price';input.placeholder='سعر التكلفة (Cost Price) *';input.setAttribute('aria-label','سعر التكلفة (Cost Price)');input.setAttribute('aria-required','true');return input}
      const base=$('productBasePrice');if(!base)return null;
      input=d.createElement('input');input.id='mwProductCostPrice';input.name='cost_price';input.className='field';input.type='number';input.min='0';input.step='0.01';input.required=true;input.placeholder='سعر التكلفة (Cost Price) *';input.setAttribute('aria-label','سعر التكلفة (Cost Price)');input.setAttribute('aria-required','true');
      base.insertAdjacentElement('afterend',input);return input;
    }
    function hydrateCostField(){
      const input=ensureCostField();if(!input)return;
      const id=String($('productId')?.value||'').trim();if(!id){input.value='';return}
      const product=(Array.isArray(win.products)?win.products:[]).find(p=>String(p.id)===id);
      if(product)input.value=product.cost_price==null?'':String(product.cost_price);
    }
    function bindCostHydration(){
      const modal=$('productModal');if(!modal||modal.__mwV34CostObserver)return;
      let open=!modal.classList.contains('hidden');
      const sync=()=>{const next=!modal.classList.contains('hidden');if(next&&!open){setTimeout(hydrateCostField,0);setTimeout(hydrateCostField,160)}open=next};
      new win.MutationObserver(sync).observe(modal,{attributes:true,attributeFilter:['class']});modal.__mwV34CostObserver=true;
    }
    ensureCostField();bindCostHydration();
    const costDomObserver=new win.MutationObserver(()=>{ensureCostField();bindCostHydration()});costDomObserver.observe(d.documentElement,{childList:true,subtree:true});

    win.saveProduct=async function saveProduct(){
      if(!win.vendorStore)return;
      const costInput=ensureCostField();
      const id=String($('productId')?.value||'').trim();
      const name=String($('productName')?.value||'').trim();
      const description=String($('productDescription')?.value||'').trim();
      const detailed=String($('productDetailedDescription')?.value||'').trim();
      const barcodeValue=String($('productBarcode')?.value||'').trim()||null;
      const base=Number($('productBasePrice')?.value);
      const discount=String($('productDiscountPrice')?.value||'').trim()===''?null:Number($('productDiscountPrice')?.value);
      const costRaw=String(costInput?.value||'').trim();
      const cost=costRaw===''?NaN:Number(costRaw);
      const stock=Math.max(0,Math.floor(Number($('productStock')?.value||0)));
      const threshold=Math.max(0,Math.floor(Number($('productLowThreshold')?.value||0)));
      if(!name||!Number.isFinite(base)||base<0)return win.showNotice('أدخل اسم المنتج وسعرًا صحيحًا.',true);
      if(discount!=null&&(!Number.isFinite(discount)||discount<0||discount>base))return win.showNotice('سعر الخصم يجب أن يكون بين 0 والسعر الأصلي.',true);
      if(!costRaw||!Number.isFinite(cost)||cost<0){costInput?.focus?.();costInput?.reportValidity?.();return win.showNotice('سعر التكلفة (Cost Price) مطلوب ويجب أن يكون رقمًا صحيحًا أكبر من أو يساوي صفر.',true)}

      try{
        const existing=(Array.isArray(win.products)?win.products:[]).find(p=>String(p.id)===id)||{};
        const oldOptions=parse(existing.options);
        let imageUrl=String($('productImage')?.value||'').trim()||null;
        const files=Array.from($('productImageFile')?.files||[]);
        const uploaded=[];
        if(files.length){
          win.showNotice('جاري رفع صور المنتج...');
          for(const file of files)uploaded.push(await win.uploadProductImage(file));
          if(uploaded[0])imageUrl=uploaded[0];
        }
        const domGallery=Array.from(d.querySelectorAll('#productImageGallery img,#productImagesPreview img,[data-product-image-gallery] img')).map(img=>String(img.currentSrc||img.src||'').trim());
        const oldImages=uniq([
          ...arr(oldOptions.images),...arr(oldOptions.image_urls),...arr(oldOptions.gallery),
          ...arr(existing.images),...arr(existing.image_urls),String(existing.image_url||'').trim()
        ]);
        const images=uniq([imageUrl,...uploaded,...domGallery,...oldImages]);

        const colors=win.optionsArray(String($('productColors')?.value||''));
        const sizes=win.optionsArray(String($('productSizes')?.value||''));
        const volumes=win.optionsArray(String($('productVolumes')?.value||''));
        const main=String($('mwProductMainCategory')?.value||win.__mwTaxonomySelectionV10?.main||'').trim();
        const sub=String($('mwProductSubCategory')?.value||win.__mwTaxonomySelectionV10?.sub||'').trim();
        const effective=sub||main||null;
        const options={...oldOptions,colors,sizes,volumes,detailed_description:detailed,images,image_urls:images,gallery:images,pricing:win.MeshwarLocalPricing?.pricingSnapshot(discount??base,win.vendorStore?.commission_rate??10,win.vendorStore?.exchange_rate||1,win.vendorStore?.exchange_target_currency||win.vendorStore?.default_currency||'IQD')||oldOptions.pricing||null};
        const payload={store_id:win.vendorStore.id,product_name:name,barcode:barcodeValue,image_url:imageUrl,description,base_price:base,discount_price:discount,cost_price:cost,currency:'USD',stock_quantity:stock,low_stock_threshold:threshold,is_out_of_stock:stock===0,category_id:effective,subcategory_id:sub||null,options,updated_at:new Date().toISOString()};
        win.__mwVendorProductSaveV34LastPayload=payload;
        const query=id?win.sb.from('local_products').update(payload).eq('id',id).eq('store_id',win.vendorStore.id):win.sb.from('local_products').insert([payload]);
        const{error}=await query;if(error)throw error;
        win.closeProductModal();win.showNotice(id?'تم تحديث المنتج وحفظ جميع الحقول.':'تمت إضافة المنتج وحفظ جميع الحقول.');await win.loadProducts();
      }catch(e){console.error('Product complete save error:',e);const message=e?.message||String(e);win.showNotice('تعذر حفظ المنتج: '+message,true);alert(message)}
    };
    win.saveProduct.__mwCompletePayloadV34=true;
    win.__mwVendorProductSaveCompleteV34=true;
  }
  window.MeshwarVendorProductSaveCompleteV34={install,VERSION};
})();
