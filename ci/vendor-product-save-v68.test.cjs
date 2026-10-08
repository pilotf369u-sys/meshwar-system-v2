const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/vendor-product-save-complete-v34.js'),'utf8');
const clone=x=>JSON.parse(JSON.stringify(x));
// Exercise the real editor APIs, including the interval before hydration.
{
 const boxes={productId:{value:'p'},productColors:{value:'أبيض,أزرق'},productSizes:{value:'S,M'},productVolumes:{value:''},mwVariantStockEditor:{dataset:{}},mwMatrixStockEditor:{dataset:{}}};
 const variantInputs=[{value:'4',dataset:{vsGroup:'color',vsValue:'أبيض'}},{value:'2',dataset:{vsGroup:'size',vsValue:'S'}},{value:'1',dataset:{vsGroup:'volume',vsValue:'75ml'}}];
 const matrixInputs=[{value:'2',dataset:{matrixKey:'أبيض_S'}},{value:'3',dataset:{matrixKey:'أبيض_M'}}];
 const document={readyState:'loading',createElement:()=>({}),head:{appendChild(){}},getElementById:id=>boxes[id],addEventListener(){},querySelectorAll:s=>s.includes('data-vs-group')?variantInputs:s.includes('data-matrix-key')?matrixInputs:[]};
 const window={},context={window,document,location:{pathname:'/customer'},console};vm.createContext(context);
 for(const path of ['local-store-variant-stock-v5.js','local-store-matrix-stock-v6.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../js',path),'utf8'),context);
 assert.equal(window.MeshwarVariantStock.editorSnapshot(),null);
 assert.equal(window.MeshwarMatrixStock.editorSnapshot(),null);
 boxes.mwVariantStockEditor.dataset.stockProductId='p';boxes.mwMatrixStockEditor.dataset.stockProductId='p';
 const result=clone(window.MeshwarMatrixStock.editorSnapshot());
 assert.equal(result.variant_stock.color['أبيض'],5);
 assert.equal(result.variant_stock.size.S,2);assert.equal(result.variant_stock.volume['75ml'],1);
 assert.equal(result.matrix_stock['أبيض_M'],3);
 boxes.productId.value='other';
 assert.equal(window.MeshwarMatrixStock.editorSnapshot(),null);
}
async function check({snapshot,collision=false,create=false}={}){
 let row={id:'p',store_id:'s',updated_at:'before',category_id:'category',subcategory_id:'sub',is_featured:true,cost_price:8,image_url:'photo',options:{colors:['وردي','أزرق فاتح','سلفر'],sizes:[],volumes:[],variant_stock:{color:{وردي:3,'أزرق فاتح':5,سلفر:5},size:{},volume:{}},matrix_stock:{},images:['photo'],campaign_extra:{keep:true},detailed_description:'details'}};
 let closed=0,reloads=0,writes=0,alerts=[],saved;
 const vals={productId:create?'':'p',productName:'stay fresh deo roll on pure',productDescription:'description',productImage:'photo',productBasePrice:'10',mwProductCostPrice:'8',productDiscountPrice:'7',productStock:'30',productLowThreshold:'3',productBarcode:'8690131123079',productColors:'وردي,أزرق فاتح,سلفر',productSizes:'',productVolumes:'',productDetailedDescription:'details'};
 const fields=Object.fromEntries(Object.entries(vals).map(([k,value])=>[k,{value,dataset:{},files:[],setAttribute(){},addEventListener(){}}]));
 fields.productModal={classList:{contains:()=>false}};
 const document={getElementById:id=>fields[id],querySelectorAll:()=>[],documentElement:{}};
 const sb={from(table){assert.equal(table,'local_products');let payload,filters=[];
   const q={select(){return q},eq(k,v){filters.push([k,v]);return q},limit(){return q},
     update(p){payload=clone(p);return q},insert(p){payload=clone(p[0]);return q},
     then(resolve){if(payload){writes++;saved=payload;if(collision)return resolve({data:[],error:null});row={...row,...payload};return resolve({data:[clone(row)],error:null})}resolve({data:[clone(row)],error:null})}};return q}};
 const win={document,saveProduct(){},MutationObserver:class{observe(){}},closeProductModal(){closed++},alert:x=>alerts.push(x),MeshwarVendorRuntime:{sb,getStore:()=>({id:'s'}),getProducts:()=>[clone(row)],showNotice(){},loadProducts:async()=>{reloads++},optionsArray:s=>s.split(',').filter(Boolean),uploadProductImage:async()=>''}};
 if(snapshot)win.MeshwarVariantStock={editorSnapshot:()=>clone(snapshot)};
 vm.runInNewContext(source,{window:win,console:{error(){}},setTimeout(){throw Error('unexpected wait: runtime unavailable')}});
 win.MeshwarVendorProductSaveCompleteV34.install(win);
 assert.equal(win.__mwVendorProductSaveCompleteV34,true);
 await win.saveProduct();
 assert.equal(writes,1);
 assert.equal(saved.stock_quantity,30);
 if(!create)assert.deepEqual(saved.options.campaign_extra,{keep:true});
 if(!create){assert.equal(saved.category_id,'category');assert.equal(saved.subcategory_id,'sub');}
 assert.equal(saved.image_url,'photo');assert.equal(saved.product_name,vals.productName);
 assert.deepEqual(saved.options.colors,['وردي','أزرق فاتح','سلفر']);
 if(collision){assert.equal(closed,0);assert.equal(reloads,0);assert.equal(alerts.length,1)}
 else {assert.equal(closed,1);assert.equal(reloads,1);assert.deepEqual(row.options,saved.options);assert.equal(alerts.length,0)}
 return saved;
}
(async()=>{
 const changed={variant_stock:{color:{وردي:4,'أزرق فاتح':5,سلفر:5},size:{},volume:{}}};
 assert.equal((await check({snapshot:changed})).options.variant_stock.color.وردي,4);
 assert.equal((await check()).options.variant_stock.color.وردي,3);
 await check({snapshot:changed,collision:true});
 await check({snapshot:changed,create:true});
 console.log('PASS: runtime-only activation; 30 total / 4 pink; lower variant sum; unchanged stock fallback; metadata/category/image retention; round trip; concurrent-write rejection; creation.');
})();
