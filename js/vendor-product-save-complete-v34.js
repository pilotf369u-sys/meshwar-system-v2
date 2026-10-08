/* MESHWAR_VENDOR_PRODUCT_SAVE_COMPLETE_V34 */
(function(){
  'use strict';
  const VERSION='20261008-v68-preserve-product-options';
  const arr=v=>Array.isArray(v)?v.map(x=>String(x??'').trim()).filter(Boolean):[];
  const parse=v=>{if(!v)return{};if(typeof v==='object'&&!Array.isArray(v))return{...v};try{const x=JSON.parse(v);return x&&typeof x==='object'&&!Array.isArray(x)?{...x}:{}}catch{return{}}};
  const uniq=v=>[...new Set(v.filter(Boolean))];

  function install(win){
    if(!win||win.__mwVendorProductSaveCompleteV34)return;
    const d=win.document,$=id=>d.getElementById(id);
    const runtime=win.MeshwarVendorRuntime;
    const sb=runtime?.sb||win.sb;
    const getStore=()=>runtime?.getStore?.()||win.vendorStore;
    const getProducts=()=>runtime?.getProducts?.()||win.products||[];
    const notice=(...args)=>(runtime?.showNotice||win.showNotice)(...args);
    const split=runtime?.optionsArray||win.optionsArray;
    if(typeof win.saveProduct!=='function'||!sb||!split){setTimeout(()=>install(win),80);return}

    function ensureCostField(){
      let input=$('mwProductCostPrice');
      if(input){input.type='number';input.min='0';input.step='0.01';input.required=true;input.name='cost_price';input.placeholder='سعر التكلفة (Cost Price) *';input.setAttribute('aria-label','سعر التكلفة (Cost Price)');input.setAttribute('aria-required','true');if(!input.__mwCostDirtyBound){input.addEventListener('input',()=>{input.dataset.mwCostDirty='1'});input.__mwCostDirtyBound=true}return input}
      const base=$('productBasePrice');if(!base)return null;
      input=d.createElement('input');input.id='mwProductCostPrice';input.name='cost_price';input.className='field';input.type='number';input.min='0';input.step='0.01';input.required=true;input.placeholder='سعر التكلفة (Cost Price) *';input.setAttribute('aria-label','سعر التكلفة (Cost Price)');input.setAttribute('aria-required','true');input.addEventListener('input',()=>{input.dataset.mwCostDirty='1'});input.__mwCostDirtyBound=true;
      base.insertAdjacentElement('afterend',input);return input;
    }
    function hydrateCostField(){
      const input=ensureCostField();if(!input||input.dataset.mwCostDirty==='1')return;
      const id=String($('productId')?.value||'').trim();if(!id){input.value='';return}
      const product=getProducts().find(p=>String(p.id)===id);
      if(product&&product.cost_price!=null)input.value=String(product.cost_price);
    }
    function bindCostHydration(){
      const modal=$('productModal');if(!modal||modal.__mwV34CostObserver)return;
      let open=!modal.classList.contains('hidden');
      const sync=()=>{const next=!modal.classList.contains('hidden');if(next&&!open){const input=ensureCostField();if(input)delete input.dataset.mwCostDirty;setTimeout(hydrateCostField,0);setTimeout(hydrateCostField,160)}open=next};
      new win.MutationObserver(sync).observe(modal,{attributes:true,attributeFilter:['class']});modal.__mwV34CostObserver=true;
    }
    ensureCostField();bindCostHydration();
    const costDomObserver=new win.MutationObserver(()=>{ensureCostField();bindCostHydration()});costDomObserver.observe(d.documentElement,{childList:true,subtree:true});

    win.saveProduct=async function saveProduct(){
      const vendorStore=getStore();if(!vendorStore)return;
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
      const stockSnapshot=win.MeshwarMatrixStock?.editorSnapshot?.()||win.MeshwarVariantStock?.editorSnapshot?.();
      const fields=Object.fromEntries(['productImage','productColors','productSizes','productVolumes','mwProductMainCategory','mwProductSubCategory'].map(key=>[key,$(key)?.value]));
      const files=Array.from($('productImageFile')?.files||[]);
      const featured=$('mwProductFeatured')?!!$('mwProductFeatured').checked:null;
      const touched=!!win.__mwTaxonomyTouchedV10;
      const shadow={...win.__mwTaxonomySelectionV10};
      if(!name||!Number.isFinite(base)||base<0)return notice('أدخل اسم المنتج وسعرًا صحيحًا.',true);
      if(discount!=null&&(!Number.isFinite(discount)||discount<0||discount>base))return notice('سعر الخصم يجب أن يكون بين 0 والسعر الأصلي.',true);
      if(!costRaw||!Number.isFinite(cost)||cost<0){costInput?.focus?.();costInput?.reportValidity?.();return notice('سعر التكلفة (Cost Price) مطلوب ويجب أن يكون رقمًا صحيحًا أكبر من أو يساوي صفر.',true)}

      try{
        let existing=getProducts().find(p=>String(p.id)===id)||{};
        if(id){
          const result=await sb.from('local_products').select('*').eq('id',id).eq('store_id',vendorStore.id).limit(1);
          if(result.error)throw result.error;
          if(!result.data?.length)throw new Error('تعذر تحميل المنتج قبل الحفظ.');
          existing=result.data[0];
        }
        const oldOptions=parse(existing.options);
        let imageUrl=String(fields.productImage||existing.image_url||'').trim()||null;
        const uploaded=[];
        if(files.length){
          notice('جاري رفع صور المنتج...');
          for(const file of files)uploaded.push(await (runtime?.uploadProductImage||win.uploadProductImage)(file));
          if(uploaded[0])imageUrl=uploaded[0];
        }
        const domGallery=Array.from(d.querySelectorAll('#productImageGallery img,#productImagesPreview img,[data-product-image-gallery] img')).map(img=>String(img.currentSrc||img.src||'').trim());
        const oldImages=uniq([...arr(oldOptions.images),...arr(oldOptions.image_urls),...arr(oldOptions.gallery),...arr(existing.images),...arr(existing.image_urls),String(existing.image_url||'').trim()]);
        const images=uniq([imageUrl,...uploaded,...domGallery,...oldImages]);
        const colors=fields.productColors!==undefined?split(fields.productColors):arr(oldOptions.colors);
        const sizes=fields.productSizes!==undefined?split(fields.productSizes):arr(oldOptions.sizes);
        const volumes=fields.productVolumes!==undefined?split(fields.productVolumes):arr(oldOptions.volumes);
        const main=String(fields.mwProductMainCategory||shadow.main||'').trim();
        const sub=String(fields.mwProductSubCategory||shadow.sub||'').trim();
        const preserveCategory=id&&!touched&&!main&&!sub;
        const effective=preserveCategory?existing.category_id:(sub||main||null);
        const options={...oldOptions,colors,sizes,volumes,detailed_description:$('productDetailedDescription')?detailed:(oldOptions.detailed_description||''),images,image_urls:images,gallery:images,pricing:win.MeshwarLocalPricing?.pricingSnapshot(discount??base,vendorStore.commission_rate??10,vendorStore.exchange_rate||1,vendorStore.exchange_target_currency||vendorStore.default_currency||'IQD')||oldOptions.pricing||null};
        
        if(stockSnapshot)Object.assign(options,stockSnapshot);
        const payload={store_id:vendorStore.id,product_name:name,barcode:barcodeValue,image_url:imageUrl,description,base_price:base,discount_price:discount,cost_price:cost,currency:'USD',stock_quantity:stock,low_stock_threshold:threshold,is_out_of_stock:stock===0,category_id:effective,subcategory_id:preserveCategory?existing.subcategory_id:(sub||null),is_featured:featured===null?!!existing.is_featured:featured,options,updated_at:new Date().toISOString()};
        win.__mwVendorProductSaveV34LastPayload=payload;
        let query=id?sb.from('local_products').update(payload).eq('id',id).eq('store_id',vendorStore.id):sb.from('local_products').insert([payload]);
        if(id&&existing.updated_at)query=query.eq('updated_at',existing.updated_at);
        const{data,error}=await query.select('*');if(error)throw error;
        if(!data?.length)throw new Error('تغير المنتج أثناء الحفظ. أعد فتحه وراجع الكميات ثم احفظ.');
        if(costInput)delete costInput.dataset.mwCostDirty;
        win.closeProductModal();notice(id?'تم تحديث المنتج وحفظ جميع الحقول.':'تمت إضافة المنتج وحفظ جميع الحقول.');await (runtime?.loadProducts||win.loadProducts)();
      }catch(e){console.error('Product complete save error:',e);const message=e?.message||String(e);notice('تعذر حفظ المنتج: '+message,true);win.alert(message)}
    };
    win.saveProduct.__mwCompletePayloadV34=true;
    win.saveProduct.__mwMulti=true;
    win.saveProduct.__mwFinanceV21=true;
    win.saveProduct.__mwVariantWrapped=true;
    win.saveProduct.__mwMatrixWrapped=true;
    win.__mwVendorProductSaveCompleteV34=true;
  }
  window.MeshwarVendorProductSaveCompleteV34={install,VERSION};
})();
