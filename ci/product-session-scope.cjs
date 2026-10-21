// Permit only the reviewed transport prefix and V34 duplicate-writer stand-down.
// All pricing, finance, barcode resolution and remaining file contents stay byte-identical.
const fs=require('node:fs'),cp=require('node:child_process'),assert=require('node:assert/strict');
const prefix=String.raw`if(/^local_products(?:\?|$)/.test(path)&&String(method).toUpperCase()!=='GET'&&!(win.KintoVendorProductsV1||window.KintoVendorProductsV1))throw Error('PRODUCT_SESSION_TRANSPORT_REQUIRED');const productTransport=(win.KintoVendorProductsV1||window.KintoVendorProductsV1)?.forWindow(win)||win.fetch.bind(win);`;
function normalize(source){return source.replace(prefix,'').replace('const r=await productTransport(','const r=await win.fetch(').replaceAll('if(!btn||win.__mwVendorProductSaveCompleteV34)return;','if(!btn)return;')}
module.exports={normalize};
if(require.main===module){const [base,...paths]=process.argv.slice(2);assert(base&&paths.length);for(const path of paths){const before=cp.execFileSync('git',['show',base+':'+path],{encoding:'utf8'});assert.equal(normalize(fs.readFileSync(path,'utf8')),normalize(before),path+': only reviewed session transport/duplicate-write changes allowed')}console.log('PASS protected file scope with exact session transport exceptions')}
