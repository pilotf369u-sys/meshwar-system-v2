const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../js/local-store-card-v3.js','utf8');
const declarations=['rawOptions','cleanOptionArray','productOptions'].map(name=>{
  const line=source.split('\n').find(x=>x.startsWith('const '+name+'='));
  assert.ok(line,'Missing production parser: '+name);
  return line;
}).join('\n');
const parse=vm.runInNewContext(declarations+'\nproductOptions');
const plain=value=>JSON.parse(JSON.stringify(value));

test('stored multiword colors remain two exact choices',()=>{
  const actual=plain(parse({options:{colors:['بني محروق','جوزي فاتح']}}));
  assert.deepEqual(actual.colors,['بني محروق','جوزي فاتح']);
});
test('all variant groups preserve internal spaces and split only explicit delimiters',()=>{
  const actual=plain(parse({options:{
    colors:'بني محروق، جوزي فاتح',
    sizes:'Extra Large, Small Size',
    volumes:'250 ml\n500 ml'
  }}));
  assert.deepEqual(actual,{colors:['بني محروق','جوزي فاتح'],sizes:['Extra Large','Small Size'],volumes:['250 ml','500 ml']});
});
test('JSON options and legacy delimiter strings trim and deduplicate choices',()=>{
  const actual=plain(parse({options:JSON.stringify({colors:[' بني محروق ','بني محروق','جوزي فاتح، أزرق داكن']})}));
  assert.deepEqual(actual.colors,['بني محروق','جوزي فاتح','أزرق داكن']);
});
test('stock zero does not change option visibility in this first stage',()=>{
  const actual=plain(parse({options:{colors:['بني محروق'],variant_stock:{color:{'بني محروق':0}}}}));
  assert.deepEqual(actual.colors,['بني محروق']);
});
test('missing or malformed options produce empty lists',()=>{
  assert.deepEqual(plain(parse({options:'invalid'})),{colors:[],sizes:[],volumes:[]});
});
