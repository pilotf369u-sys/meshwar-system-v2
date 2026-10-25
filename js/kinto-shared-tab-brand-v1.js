/* KINTO browser-tab brand: presentation only, shared by store directory pages. */
(function(){
  'use strict';
  const fallback='images/kinto-header-logo-v158.jpeg?v=20261025-tab';
  function icon(url){
    const ext=new URL(url,location.href).pathname.toLowerCase();
    const type=ext.endsWith('.svg')?'image/svg+xml':ext.endsWith('.png')?'image/png':ext.endsWith('.webp')?'image/webp':ext.endsWith('.gif')?'image/gif':'image/jpeg';
    for(const rel of ['icon','shortcut icon']){
      let link=document.querySelector('link[rel="'+rel+'"]');
      if(!link){link=document.createElement('link');link.rel=rel;document.head.appendChild(link)}
      link.type=type;
      link.href=url;
    }
  }
  icon(fallback);
  function parse(v){
    if(Array.isArray(v))return parse(v[0]);
    if(typeof v==='string'){try{return parse(JSON.parse(v))}catch{return{}}}
    if(v&&typeof v==='object')return v.value!=null?parse(v.value):(v.settings&&typeof v.settings==='object'?v.settings:v);
    return{};
  }
  async function load(attempt){
    try{
      const sb=window.KintoSupabase;
      if(!sb||typeof sb.rpc!=='function'){
        if(attempt<12)setTimeout(()=>load(attempt+1),1000);
        return;
      }
      const {data,error}=await sb.rpc('get_site_settings');
      if(error)return;
      const value=String(parse(data).brand_logo_url||'').trim();
      if(!value)return;
      const u=new URL(value,location.href);
      if(u.protocol!=='https:'&&u.protocol!=='http:')return;
      const probe=new Image();
      probe.onload=()=>icon(u.href);
      probe.src=u.href;
    }catch(e){console.warn('KINTO tab logo fallback retained',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>load(0),{once:true});
  else load(0);
})();
