const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../js/local-cart-v93.js','utf8');
const line=name=>source.split('\n').find(s=>s.startsWith('function '+name+'('));
const helpers=source.slice(source.indexOf('const stockProducts='),source.indexOf('function add(input){'));
const api=vm.runInNewContext([line('optionsKey'),line('itemKey'),helpers,'({stockLimit,validateCheckoutStock})'].join('\n'));
const p={id:'p',stock_quantity:10,options:{variant_stock:{color:{orange:4,purple:6},size:{L:3}},matrix_stock:{orange_L:2}}};
const item=(color,quantity,size='')=>({store_id:'s',product_id:'p',quantity,selected_options:{color,size}});
test('minimum of total, selected variants and matrix controls quantity',()=>{
  assert.equal(api.stockLimit(p,{color:'orange'}),4);
  assert.equal(api.stockLimit(p,{color:'orange',size:'L'}),2);
  assert.equal(api.stockLimit({...p,stock_quantity:1},{color:'orange',size:'L'}),1);
});
test('shared variants and total are deducted across distinct cart lines',()=>{
  assert.equal(api.stockLimit(p,{color:'orange'},[item('orange',3,'S')]),1);
  assert.equal(api.stockLimit(p,{color:'purple'},[item('orange',4),item('purple',5,'S')]),1);
});
test('replacement quantity excludes only its own line',()=>{
  const rows=[item('orange',2),item('orange',1,'S')];
  assert.equal(api.stockLimit(p,{color:'orange'},rows,'s::p::orange||'),3);
});
test('zero blocks and missing quantities use total; null total remains unmanaged',()=>{
  assert.equal(api.stockLimit({...p,stock_quantity:0},{color:'orange'}),0);
  assert.equal(api.stockLimit({...p,is_out_of_stock:true},{color:'orange'}),0);
  assert.equal(api.stockLimit(p,{color:'missing'}),10);
  assert.equal(api.stockLimit({id:'p',stock_quantity:null,options:{}},{}),Infinity);
});
test('custom groups, aliases and numeric strings obey the same rule',()=>{
  const product={id:'p',stock_quantity:'20',options:{variant_stock:{colors:{orange:'5'},material:{cotton:'3'}}}};
  assert.equal(api.stockLimit(product,{color:'orange',material:'cotton'}),3);
});

function cartContext(product){
  const add=source.slice(source.indexOf('function add(input){'),source.indexOf('function setSelected('));
  const context=vm.createContext({
    state:[],requireCustomerShopping:()=>true,syncScope(){},currentStoreId:()=> 's',
    normalize:x=>({...x,product_id:String(x.product_id),quantity:Number(x.quantity),selected_options:x.selected_options||{}}),
    valid:x=>x.quantity>0,save(){},open(){},snapshot(){return context.state},
    alert(){},rest:async()=>[product]
  });
  vm.runInContext([line('optionsKey'),line('itemKey'),helpers,add].join('\n'),context);
  return context;
}
test('repeat additions cannot exceed the variant shared with the existing cart',()=>{
  const c=cartContext(p);
  c.add({...item('orange',3),stock_product:p});
  assert.throws(()=>c.add({...item('orange',2),stock_product:p}));
  assert.equal(c.state[0].quantity,3);
});
test('cart increase fetches live stock and clamps instead of overselling',async()=>{
  const c=cartContext(p);
  c.state.push(item('orange',1));
  await c.setQuantity('s::p::orange||',100);
  assert.equal(c.state[0].quantity,4);
});
test('legacy add without a supplied product validates live stock before writing',async()=>{
  const c=cartContext(p);
  await c.add(item('orange',100));
  assert.equal(c.state.length,0);
});
test('checkout rechecks live stock and stops an excessive selection',async()=>{
  const c=cartContext(p);
  await assert.rejects(c.validateCheckoutStock([item('orange',5)]));
  await c.validateCheckoutStock([item('orange',4),item('purple',6)]);
});
test('modal clamps quantity when a tighter combination is selected and disables plus',()=>{
  const modal=fs.readFileSync(__dirname+'/../js/storefront-product-modal-v145.js','utf8');
  const refresh=modal.slice(modal.indexOf('  function refreshQuantityLimit(){'),modal.indexOf('  async function submit(){'));
  const nodes={'strong':{textContent:''},'plus':{disabled:false},'minus':{disabled:false},'add':{disabled:false}};
  const context=vm.createContext({
    sourceCard:{querySelector(){return {dataset:{pid:'p'}}}},quantity:100,
    window:{KintoLocalStoreCardV3:{getProduct:()=>p},KintoLocalCartV93:{stockLimit:api.stockLimit,getItems:()=>[]}},
    root(){return {
      querySelectorAll(){return [{dataset:{option:'color'},value:'orange'},{dataset:{option:'size'},value:'L'}]},
      querySelector(selector){return selector.includes('strong')?nodes.strong:selector.includes('plus')?nodes.plus:selector.includes('minus')?nodes.minus:nodes.add}
    }}
  });
  vm.runInContext(refresh+'\nrefreshQuantityLimit()',context);
  assert.equal(context.quantity,2);
  assert.equal(nodes.strong.textContent,'2');
  assert.equal(nodes.plus.disabled,true);
});
