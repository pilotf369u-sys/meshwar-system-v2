/* KINTO payment card logo selection — isolated, pure.
 * Uses the same brand_logo_url key as get_site_settings, never a hardcoded logo.
 * Caller must fetch settings with existing authorized site settings provider.
 */
(function(root,factory){const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.KintoPaymentBrandV1=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 function unpack(value){
  let item=value;
  for(let i=0;i<4;i++){
   if(Array.isArray(item)){item=item[0];continue}
   if(typeof item==='string'){try{item=JSON.parse(item);continue}catch{return {}}}
   if(item&&typeof item==='object'){
    if(item.value!=null){item=item.value;continue}
    if(item.settings&&typeof item.settings==='object'){item=item.settings;continue}
    return item;
   }
   break;
  }
  return item&&typeof item==='object'&&!Array.isArray(item)?item:{};
 }
 function select(data,base){
  const raw=unpack(data).brand_logo_url;
  if(typeof raw!=='string'||!raw.trim())return null;
  try{
   const url=new URL(raw.trim(),base);
   if(url.protocol!=='https:')return null;
   if(url.username||url.password)return null;
   if(!/\.(png|jpe?g|webp)(?:$)/i.test(url.pathname))return null;
   return url.href;
  }catch{return null}
 }
 return Object.freeze({select,unpack});
});
