const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../js/local-store-card-v3.js','utf8');
const names=['rawOptions','cleanOptionArray','productOptions'];
const declarations=names.map(name=>source.split('\n').find(line=>line.startsWith('const '+name+'='))).join('\n');
const helper=source.slice(source.indexOf('function visibleProductOptions('),source.indexOf('const optionSelect='));
const api=vm.runInNewContext(declarations+'\n'+helper+'\n({visibleProductOptions,hasVisibleProductOptions})');
const plain=value=>JSON.parse(JSON.stringify(value));
const product=options=>({options});

test('zero quantities disappear across colors, sizes and volumes without mutating stored data',()=>{
  const p=product({colors:['بني محروق','جوزي فاتح'],sizes:['Small Size','Extra Large'],volumes:['250 ml','500 ml'],
    variant_stock:{color:{'بني محروق':0,'جوزي فاتح':4},size:{'Small Size':0,'Extra Large':3},volume:{'250 ml':0,'500 ml':2}}});
  const before=JSON.stringify(p);
  assert.deepEqual(plain(api.visibleProductOptions(p)),{colors:['جوزي فاتح'],sizes:['Extra Large'],volumes:['500 ml']});
  assert.equal(JSON.stringify(p),before);
});
test('missing, blank and null quantities preserve fallback choices; numeric string zero hides',()=>{
  const p=product({colors:['missing','blank','null','zero','positive'],variant_stock:{colors:{blank:'',null:null,zero:'0',positive:2}}});
  assert.deepEqual(plain(api.visibleProductOptions(p)).colors,['missing','blank','null','positive']);
});
test('matrix choices depend on selected dimensions and never expose a zero combination',()=>{
  const p=product({colors:['red','blue'],sizes:['S','L'],matrix_stock:{red_S:0,red_L:3,blue_S:2,blue_L:0}});
  assert.deepEqual(plain(api.visibleProductOptions(p)).colors,['red','blue']);
  assert.deepEqual(plain(api.visibleProductOptions(p,{color:'red'})).sizes,['L']);
  assert.deepEqual(plain(api.visibleProductOptions(p,{size:'S'})).colors,['blue']);
});
test('one all-zero matrix branch is absent and all-zero products have no visible options',()=>{
  const p=product({colors:['red','blue'],sizes:['S','L'],matrix_stock:{red_S:0,red_L:0,blue_S:2,blue_L:0}});
  assert.deepEqual(plain(api.visibleProductOptions(p)),{colors:['blue'],sizes:['S'],volumes:[]});
  p.options.matrix_stock.blue_S=0;
  assert.equal(api.hasVisibleProductOptions(p),false);
});
test('an unconfigured matrix combination keeps total-stock fallback',()=>{
  const p=product({colors:['red'],sizes:['S','L'],matrix_stock:{red_S:0}});
  assert.deepEqual(plain(api.visibleProductOptions(p)).sizes,['L']);
  assert.equal(api.hasVisibleProductOptions(p),true);
});
test('three-dimensional matrices and stock aliases work with JSON options',()=>{
  const options={colors:['dark brown'],sizes:['XL'],volumes:['250 ml','500 ml'],
    variant_stock:{sizes:{XL:4}},matrix_stock:{'dark brown_XL_250 ml':0,'dark brown_XL_500 ml':1}};
  assert.deepEqual(plain(api.visibleProductOptions(product(JSON.stringify(options)))),{colors:['dark brown'],sizes:['XL'],volumes:['500 ml']});
});
test('products without variants remain available to the visibility helper',()=>{
  assert.equal(api.hasVisibleProductOptions(product({})),true);
});

test('modal option refresh removes zero choices and clears an unavailable selection',()=>{
  const modal=fs.readFileSync(__dirname+'/../js/storefront-product-modal-v145.js','utf8');
  const refresh=modal.slice(modal.indexOf('  function refreshVisibleOptions(){'),modal.indexOf('  function submit(){'));
  const select={dataset:{option:'color'},value:'بني محروق',innerHTML:'',closest(){return {childNodes:[{textContent:'اللون'}]}}};
  const add={disabled:false,textContent:''};
  const order={dataset:{pid:'p'},disabled:false};
  const p=product({colors:['بني محروق','جوزي فاتح'],variant_stock:{color:{'بني محروق':0,'جوزي فاتح':4}}});
  const context=vm.createContext({
    sourceCard:{querySelector(){return order}},
    root(){return {querySelectorAll(){return [select]},querySelector(){return add}}},
    window:{KintoLocalStoreCardV3:{...api,getProduct(){return p}}},
    esc:value=>String(value).replace(/"/g,'&quot;')
  });
  vm.runInContext(refresh+'\nrefreshVisibleOptions()',context);
  assert.equal(select.value,'');
  assert.equal(select.innerHTML.includes('بني محروق'),false);
  assert.equal(select.innerHTML.includes('جوزي فاتح'),true);
  assert.equal(add.disabled,false);
});
