const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync(__dirname+'/../vendor-dashboard-v2.html','utf8');
const start=html.indexOf('async function syncProductPricingSnapshots(){');
const end=html.indexOf('\nfunction ',start);
const source=html.slice(start,end);

async function run({race=false,alwaysConflict=false,options={variant_stock:{color:{orange:24}},matrix_stock:{orange_L:24}}}={}){
  let row={id:'product',store_id:'store',stock_quantity:48,options:structuredClone(options)};
  const cached=structuredClone(row);
  let attempts=0,writes=0;
  const sb={from(table){
    assert.equal(table,'local_products');
    let payload=null,filters={};
    return {
      update(value){payload=value;return this},
      select(){return this},
      eq(key,value){filters[key]=value;return this},
      is(key,value){filters[key]=value;return this},
      limit(){return this},
      then(resolve,reject){
        try{
          assert.equal(filters.id,'product');
          assert.equal(filters.store_id,'store');
          if(!payload)return Promise.resolve({data:[structuredClone(row)],error:null}).then(resolve,reject);
          attempts++;
          if(race&&attempts===1){
            row.stock_quantity=46;
            row.options.variant_stock.color.orange=22;
            row.options.matrix_stock.orange_L=22;
          }
          const expected=filters.options===null?null:JSON.parse(filters.options);
          if(alwaysConflict||JSON.stringify(expected)!==JSON.stringify(row.options))
            return Promise.resolve({data:[],error:null}).then(resolve,reject);
          row={...row,...structuredClone(payload)};
          writes++;
          return Promise.resolve({data:[structuredClone(row)],error:null}).then(resolve,reject);
        }catch(error){return Promise.reject(error).then(resolve,reject)}
      }
    };
  }};
  const context=vm.createContext({
    sb,products:[cached],vendorStore:{id:'store'},
    window:{MeshwarLocalPricing:{}},
    rawOptions:value=>({...value}),
    productPricingSnapshot:()=>({price:8000}),
    console:{warn(){}},Date
  });
  vm.runInContext(source,context);
  await context.syncProductPricingSnapshots();
  return {row,cached,attempts,writes};
}

test('concurrent paid-order deduction survives pricing snapshot retry',async()=>{
  const {row,cached,attempts,writes}=await run({race:true});
  assert.equal(attempts,2);
  assert.equal(writes,1);
  assert.equal(row.stock_quantity,46);
  assert.equal(row.options.variant_stock.color.orange,22);
  assert.equal(row.options.matrix_stock.orange_L,22);
  assert.equal(cached.stock_quantity,46);
  assert.equal(cached.options.variant_stock.color.orange,22);
  assert.equal(row.options.pricing.price,8000);
});
test('uncontended pricing update preserves stock groups',async()=>{
  const {row,writes}=await run();
  assert.equal(writes,1);
  assert.equal(row.options.variant_stock.color.orange,24);
  assert.equal(row.options.matrix_stock.orange_L,24);
});
test('persistent conflicts stop without overwriting options',async()=>{
  const {row,attempts,writes}=await run({alwaysConflict:true});
  assert.equal(attempts,3);
  assert.equal(writes,0);
  assert.equal(row.options.variant_stock.color.orange,24);
  assert.equal(row.options.pricing,undefined);
});
test('null options are matched with an IS NULL condition',async()=>{
  const {row,writes}=await run({options:null});
  assert.equal(writes,1);
  assert.equal(row.options.pricing.price,8000);
});
