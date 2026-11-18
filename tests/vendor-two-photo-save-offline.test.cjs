// Mocked merchant save: no Supabase, no browser, no real product writes.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const code=fs.readFileSync('js/vendor-product-save-complete-v34.js','utf8');
function fixture({photos=[],id='',existing=null}={}){
 const notices=[],uploads=[],saved=[];
 const values={productId:id,productName:'Test product',productDescription:'',productDetailedDescription:'',
   productBarcode:'',productBasePrice:'10',productDiscountPrice:'',mwProductCostPrice:'4',
   productStock:String(existing?.stock_quantity??5),productLowThreshold:'2',productImage:existing?.image_url||'',
   productColors:'',productSizes:'',productVolumes:'',mwProductMainCategory:'',mwProductSubCategory:''};
 const elements=new Map(Object.entries(values).map(([k,value])=>[k,{value,dataset:{},setAttribute(){},addEventListener(){},focus(){},reportValidity(){}}]));
 elements.set('productImageFile',{files:photos});
 elements.set('productModal',{classList:{contains:()=>true}});
 const document={documentElement:{},getElementById:key=>elements.get(key)||null,addEventListener(){},querySelectorAll:()=>[]};
 const operation=(payload)=>{
   saved.push(payload);
   return {eq(){return this},is(){return this},select:async()=>({data:[{id:existing?.id||'new'}],error:null})};
 };
 const sb={from:table=>{
   assert.equal(table,'local_products');
   return {
     select:()=>({eq(){return this},limit:async()=>({data:existing?[existing]:[],error:null})}),
     insert:rows=>operation(rows[0]),update:row=>operation(row)
   };
 }};
 const window={document,saveProduct(){},alert:msg=>{throw new Error('Save should not fail: '+msg)},
   closeProductModal(){},MutationObserver:class{observe(){}},
   MeshwarVendorRuntime:{sb,getStore:()=>({id:'store1',commission_rate:10,exchange_rate:1}),getProducts:()=>[],
     showNotice:(msg,err)=>notices.push({msg,err}),optionsArray:v=>String(v||'').split(',').map(x=>x.trim()).filter(Boolean),
     uploadProductImage:async file=>{uploads.push(file.name);return 'https://images.invalid/'+file.name},
     loadProducts:async()=>{}},
   MeshwarLocalPricing:{pricingSnapshot:()=>null}};
 const context=vm.createContext({window,document,setTimeout,console,Date});
 vm.runInContext(code,context);
 window.MeshwarVendorProductSaveCompleteV34.install(window);
 return {save:()=>window.saveProduct(),uploads,saved,notices,window};
}
test('new vendor product stores primary and optional second photo only',async()=>{
 const x=fixture({photos:[{name:'front.webp'},{name:'back.webp'}]});
 await x.save();
 assert.deepEqual(x.uploads,['front.webp','back.webp']);
 assert.equal(x.saved.length,1);
 assert.equal(x.saved[0].image_url,'https://images.invalid/front.webp');
 assert.equal(x.saved[0].options.images.length,2);
 assert.equal(x.saved[0].options.images[1],'https://images.invalid/back.webp');
});
test('choosing more than two rejects before uploads or product writes',async()=>{
 const x=fixture({photos:[{name:'a'},{name:'b'},{name:'c'}]});
 await x.save();
 assert.equal(x.uploads.length,0);
 assert.equal(x.saved.length,0);
 assert.ok(x.notices.some(x=>x.err&&x.msg.includes('بصورتين')));
});
test('editing product without changing image preserves legacy metadata and stock matrix',async()=>{
 const old={id:'old1',image_url:'https://images.invalid/old1',stock_quantity:5,updated_at:'2026-10-01',
 options:{images:['https://images.invalid/old1','https://images.invalid/old2'],
 gallery:['https://images.invalid/old1','https://images.invalid/old2'],
 image_urls:['https://images.invalid/old1','https://images.invalid/old2'],
 matrix_stock:{red_L:5},variant_stock:{colors:{red:5}}}};
 const x=fixture({id:old.id,existing:old});await x.save();
 assert.equal(x.uploads.length,0);
 assert.equal(x.saved.length,1);
 assert.equal(x.saved[0].options.images.length,2);
 assert.equal(x.saved[0].options.matrix_stock.red_L,5);
 assert.equal(x.saved[0].options.variant_stock.colors.red,5);
});
test('explicit photo replacement uses only newly selected photo(s)',async()=>{
 const old={id:'old1',image_url:'https://images.invalid/old1',stock_quantity:5,updated_at:'2026-10-01',
 options:{images:['https://images.invalid/old1','https://images.invalid/old2'],gallery:['https://images.invalid/old1','https://images.invalid/old2']}};
 const x=fixture({id:old.id,existing:old,photos:[{name:'replacement.webp'}]});await x.save();
 assert.equal(x.saved[0].image_url,'https://images.invalid/replacement.webp');
 assert.equal(x.saved[0].options.images.length,1);
 assert.equal(x.saved[0].options.images[0],'https://images.invalid/replacement.webp');
});
