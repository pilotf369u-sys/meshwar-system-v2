import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function fixture(){
 let store=null;const listeners=new Map(),requests=[],renders=[],fields=[];
 const source=fs.readFileSync(process.env.KINTO_CATEGORY_SOURCE||'js/local-store-categories-v9.js','utf8');const i=source.lastIndexOf('})();');
 const ctx={window:{addEventListener:(name,fn)=>listeners.set(name,fn)},document:{readyState:'loading',addEventListener:()=>{},getElementById:()=>null},sessionStorage:{getItem:()=>JSON.stringify(store)},MutationObserver:class{observe(){}},console,fetch:async url=>{const sid=new URL(url).searchParams.get('store_id').slice(3);requests.push(sid);return {ok:true,status:200,text:async()=>JSON.stringify([{id:'cat-'+sid,name:'Category '+sid,store_id:sid}])}},renders,fields};vm.createContext(ctx);
 const injected=`injectCss=()=>{};injectVendorTab=()=>{};injectProductFields=()=>{};bindProductTaxonomy=()=>{};renderVendorCategories=()=>renders.push(state.categories.map(x=>x.name));refreshProductCategoryFields=()=>fields.push(state.categories.map(x=>x.id));window.testCategory={startVendor,loadVendorCategories,state};`;
 vm.runInContext(source.slice(0,i)+injected+source.slice(i),ctx);
 return {ctx,requests,renders,fields,listeners,setStore:x=>store=x,emit:async()=>{listeners.get('meshwar:vendor-session-ready')?.();await new Promise(setImmediate)}};
}
test('fresh login reloads category list and product selectors without a page refresh',async()=>{
 const f=fixture();await f.ctx.window.testCategory.startVendor();assert.equal(f.requests.length,0);
 f.setStore({id:'A'});await f.emit();assert.equal(f.requests.at(-1),'A');assert.deepEqual(Array.from(f.renders.at(-1)),['Category A']);assert.deepEqual(Array.from(f.fields.at(-1)),['cat-A']);
 f.setStore({id:'B'});await f.emit();assert.equal(f.requests.at(-1),'B');assert.deepEqual(Array.from(f.renders.at(-1)),['Category B']);
});
test('delayed response for previous store cannot overwrite current store categories',async()=>{
 const f=fixture();let finishA;
 f.ctx.fetch=async url=>{const sid=new URL(url).searchParams.get('store_id').slice(3);if(sid==='A')await new Promise(r=>finishA=r);return {ok:true,status:200,text:async()=>JSON.stringify([{id:'cat-'+sid,name:'Category '+sid}])}};
 f.setStore({id:'A'});const a=f.ctx.window.testCategory.loadVendorCategories();f.setStore({id:'B'});await f.ctx.window.testCategory.loadVendorCategories();finishA();await a;assert.equal(f.ctx.window.testCategory.state.categories[0].id,'cat-B');
});
