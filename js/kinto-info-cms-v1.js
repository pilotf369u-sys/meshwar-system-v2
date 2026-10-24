/* Public KINTO informational pages: read-only CMS settings, textContent only. */
(async()=>{
 const ids=['about_shopping_text','terms_text','privacy_text','returns_text','developer_services_text'];
 const emailKeys=['support_email','developer_email'];
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  const sb=createClient('https://hsmmbloouskqdnptiiad.supabase.co','sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH',{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await sb.rpc('get_site_settings');if(error)throw error;
  function unpack(v){if(Array.isArray(v))return unpack(v[0]);if(typeof v==='string'){try{return unpack(JSON.parse(v))}catch{return{}}}if(v&&typeof v==='object'){if(v.value!=null)return unpack(v.value);return v}return{}}
  const settings=unpack(data);
  for(const key of ids){const el=document.querySelector('[data-cms-text="'+key+'"]');if(el&&typeof settings[key]==='string'&&settings[key].trim())el.textContent=settings[key].trim()}
  for(const key of emailKeys){const el=document.querySelector('[data-cms-email="'+key+'"]');const value=String(settings[key]||'').trim();if(el&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)){el.href='mailto:'+value;el.textContent=value}}
  const whatsapp=document.querySelector('[data-cms-whatsapp="developer_whatsapp_url"]');const url=String(settings.developer_whatsapp_url||'').trim();
  if(whatsapp&&/^https:\/\//i.test(url)){whatsapp.href=url}
  const shopping=document.querySelector('[data-cms-whatsapp="whatsapp_url"]');const shoppingUrl=String(settings.whatsapp_url||'').trim();
  if(shopping){if((settings.whatsapp_active===true||String(settings.whatsapp_active)==='true')&&/^https:\/\//i.test(shoppingUrl)){shopping.href=shoppingUrl}else{shopping.hidden=true}}
 }catch(e){console.warn('KINTO CMS informational page fallback:',e)}
})();