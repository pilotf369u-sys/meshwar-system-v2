/* KINTO browser-tab brand: presentation only, shared by store directory pages. */
(function(){
  'use strict';
  const fallback='images/kinto-header-logo-v158.jpeg?v=20261025-tab';
  const BRAND_CACHE_KEY='kinto_public_tab_brand_v1';
  const HOME_CONTACTS_CACHE_KEY='kinto_public_contacts_settings_v1';
  const MAX_AGE_MS=60000;

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
  function validLogo(raw){
    const value=String(raw||'').trim();
    if(!value)return '';
    try{
      const url=new URL(value,location.href);
      return url.protocol==='https:'||url.protocol==='http:'?url.href:'';
    }catch{return ''}
  }
  function cachedLogo(){
    try{
      // Homepage already fetched the same public CMS settings this tab.
      for(const key of [HOME_CONTACTS_CACHE_KEY,BRAND_CACHE_KEY]){
        const item=JSON.parse(sessionStorage.getItem(key)||'null');
        if(!item||!Number.isFinite(item.at)||Date.now()-item.at<0||Date.now()-item.at>=MAX_AGE_MS)continue;
        const logo=validLogo(parse(item.data).brand_logo_url);
        if(logo)return logo;
      }
    }catch{}
    return '';
  }
  function rememberLogo(logo){
    try{sessionStorage.setItem(BRAND_CACHE_KEY,JSON.stringify({at:Date.now(),data:{brand_logo_url:logo}}))}catch{}
  }
  function probeLogo(url){
    const probe=new Image();
    probe.onload=()=>icon(url);
    probe.src=url;
  }
  async function load(attempt){
    try{
      const cached=cachedLogo();
      if(cached){probeLogo(cached);return}
      const sb=window.KintoSupabase;
      if(!sb||typeof sb.rpc!=='function'){
        if(attempt<12)setTimeout(()=>load(attempt+1),1000);
        return;
      }
      const {data,error}=await sb.rpc('get_site_settings');
      if(error)return;
      const logo=validLogo(parse(data).brand_logo_url);
      if(!logo)return;
      rememberLogo(logo);
      probeLogo(logo);
    }catch(e){console.warn('KINTO tab logo fallback retained',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>load(0),{once:true});
  else load(0);
})();
