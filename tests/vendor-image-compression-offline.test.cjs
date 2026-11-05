// Merchant photo compression simulation: in-memory only, no Storage/DB requests.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const code=fs.readFileSync('js/kinto-vendor-product-image-prepare-v1.js','utf8');
function runtime({width=1600,height=1200,encode=(w,h)=>Math.round(w*h*.3),bitmapAllowed=true}={}){
  const calls=[];
  const canvas={width:0,height:0,getContext:()=>({drawImage(){}}),
    toBlob(cb,type,quality){calls.push({w:canvas.width,h:canvas.height,type,quality});
      const bytes=encode(canvas.width,canvas.height);
      cb(bytes ? new Blob([Buffer.alloc(bytes)],{type}) : null);
    }};
  const window={};
  const context=vm.createContext({window,document:{createElement:name=>{assert.equal(name,'canvas');return canvas}},
    Blob,File,Date,createImageBitmap:bitmapAllowed?async()=>({width,height,close(){}}):undefined});
  vm.runInContext(code,context);
  return {prepare:window.KintoVendorProductImagePrepareV1.prepare,calls};
}
function photo(kb,name='photo.jpg'){return new File([Buffer.alloc(kb*1024)],name,{type:'image/jpeg'})}
test('large product picture uses WebP Q50 with maximum 800 px and size reduction towards 70 KB',async()=>{
  const r=runtime(),input=photo(700);
  const out=await r.prepare(input);
  assert.equal(out.type,'image/webp');
  assert.equal(out.name,'photo.webp');
  assert.ok(out.size<=70*1024,'compression target should be reached in fixture');
  assert.equal(r.calls[0].w,800);assert.equal(r.calls[0].h,600);
  assert.ok(r.calls.every(c=>c.quality===.50));
  assert.ok(r.calls.length>1,'image should be downscaled if first Q50 pass is too large');
});
test('already small photo is not inflated or pointlessly uploaded again',async()=>{
  const r=runtime({width:600,height:500}),input=photo(35);
  const out=await r.prepare(input);
  assert.equal(out,input);
  assert.equal(r.calls.length,0);
});
test('unsupported formats bypass compression without changing upload policy',async()=>{
  const r=runtime(),file=new File([Buffer.alloc(100000)],'photo.gif',{type:'image/gif'});
  assert.equal(await r.prepare(file),file);
});
test('if the image API cannot encode, original photo stays available for existing upload checks',async()=>{
  const r=runtime({encode:()=>0}),file=photo(300);
  assert.equal(await r.prepare(file),file);
});
test('do not replace original with larger output',async()=>{
  const r=runtime({encode:()=>800000}),file=photo(90);
  assert.equal(await r.prepare(file),file);
});
