const fs=require('node:fs');
const html=fs.readFileSync('vendor-dashboard-v2.html','utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
let count=0;
for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){
 if(/\bsrc\s*=/.test(match[1]))continue;
 new AsyncFunction(match[2]);count++;
}
if(count===0)throw Error('Missing inline dashboard scripts');
console.log('Native dashboard inline scripts parsed:',count);
