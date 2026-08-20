from pathlib import Path
import re

admin_path=Path('admin-dashboard.html')
admin=admin_path.read_text(encoding='utf-8')
start=admin.index('async function loadStoresAdmin()')
end=admin.index('async function loadCloudSettings()', start)
new_store_code=r'''async function loadStoresAdmin(){const sb=await ensureCustomerSupabase(),{data,error}=await sb.from('global_stores').select('*').order('sort_order',{ascending:true}).order('id',{ascending:true}).limit(1000);if(error){const missing=/global_stores|schema cache|could not find/i.test(String(error.message||''));storesTableBody.innerHTML=`<tr><td colspan="4" class="mini">${missing?'جدول المتاجر العالمية غير مهيأ بعد. طبّق migration: 20260820_create_global_stores.sql':esc(error.message)}</td></tr>`;return}storesTableBody.innerHTML=(data||[]).map(s=>`<tr><td>${esc(s.name||'')}</td><td>${esc(s.category||'')}</td><td>${esc(s.store_url||'')}</td><td><button class="btn-red" onclick="deleteStore('${encodeURIComponent(String(s.id))}')">حذف</button></td></tr>`).join('')||'<tr><td colspan="4">لا توجد متاجر عالمية.</td></tr>'}
async function addStore(){const name=storeName.value.trim(),url=storeUrl.value.trim(),logo=storeImg.value.trim(),category=storeCategory.value;if(!name||!url)return alert('أدخل اسم المتجر والرابط.');const sb=await ensureCustomerSupabase(),{error}=await sb.rpc('save_global_store',{p_admin_id:getAdminId(),p_name:name,p_logo_url:logo,p_category:category,p_store_url:url,p_sort_order:0});if(error)return alert(error.message);storeName.value='';storeUrl.value='';storeImg.value='';await loadStoresAdmin()}
async function deleteStore(id){if(!confirm('حذف المتجر العالمي؟'))return;const sb=await ensureCustomerSupabase(),{error}=await sb.rpc('delete_global_store',{p_admin_id:getAdminId(),p_store_id:Number(decodeURIComponent(id))});if(error)return alert(error.message);await loadStoresAdmin()}
'''
admin=admin[:start]+new_store_code+admin[end:]
admin_path.write_text(admin,encoding='utf-8')

index_path=Path('index.html')
index=index_path.read_text(encoding='utf-8')
index=index.replace('images/n11.png','images/N11.png').replace('images/koton.png','images/KOTON.png')
index_path.write_text(index,encoding='utf-8')

js_path=Path('js/local-store-pricing.js')
js=js_path.read_text(encoding='utf-8')
marker='/* MESHWAR_GLOBAL_STORES_PUBLIC_V1 */'
if marker not in js:
    js += r'''

/* MESHWAR_GLOBAL_STORES_PUBLIC_V1 */
(function(){
  const SB_URL='https://hsmmbloouskqdnptiiad.supabase.co',SB_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
  const categoryLabels={comprehensive:'المتاجر الشاملة',fashion:'الأزياء والملابس',sports:'الرياضة',beauty:'التجميل والعناية',home:'المنزل'};
  const css=`
.logo-container{height:78px!important;min-height:78px!important;padding:0!important;background:transparent!important;border:1px solid rgba(212,175,55,.18)!important;box-shadow:none!important}
html.dark .logo-container{background:transparent!important;border-color:rgba(212,175,55,.24)!important}
.logo-container>.store-logo{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;object-fit:contain!important;padding:2px!important;box-sizing:border-box!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important}
.store-card:hover .store-logo{transform:scale(1.06)!important}
`;
  function install(){if(document.getElementById('meshwarGlobalStoresPublicV1'))return;const s=document.createElement('style');s.id='meshwarGlobalStoresPublicV1';s.textContent=css;document.head.appendChild(s)}
  function safeUrl(v){const s=String(v||'').trim();return /^(https?:\/\/|images\/)/i.test(s)?s:''}
  function grids(){const root=document.getElementById('internationalStoresSection'),out={};if(!root)return out;root.querySelectorAll('.section-title').forEach(h=>{const key=Object.keys(categoryLabels).find(k=>String(h.textContent||'').trim()===categoryLabels[k]);const g=h.nextElementSibling;if(key&&g?.classList.contains('grid-container'))out[key]=g});return out}
  function card(store){const c=document.createElement('div');c.className='store-card';const box=document.createElement('div');box.className='logo-container';const logo=safeUrl(store.logo_url);if(logo){const img=document.createElement('img');img.className='store-logo';img.src=logo;img.alt=String(store.name||'Store');img.addEventListener('error',()=>{const n=document.createElement('div');n.className='meshwar-store-name-fallback';n.textContent=String(store.name||'Store');box.replaceChildren(n)},{once:true});box.appendChild(img)}else{const n=document.createElement('div');n.className='meshwar-store-name-fallback';n.textContent=String(store.name||'Store');box.appendChild(n)}const h=document.createElement('h3');h.textContent=String(store.name||'');const a=document.createElement('a');a.className='store-link';a.textContent='تصفح';const u=safeUrl(store.store_url);if(u){a.href=u;a.target='_blank';a.rel='noopener noreferrer'}else{a.href='#';a.addEventListener('click',e=>e.preventDefault())}c.append(box,h,a);return c}
  async function load(){install();try{const r=await fetch(`${SB_URL}/rest/v1/global_stores?select=id,name,logo_url,category,store_url,sort_order,is_active&is_active=eq.true&order=sort_order.asc,id.asc`,{cache:'no-store',headers:{apikey:SB_KEY,Authorization:`Bearer ${SB_KEY}`}});if(!r.ok)return;const data=await r.json();if(!Array.isArray(data)||!data.length)return;const gs=grids();Object.values(gs).forEach(g=>g.replaceChildren());data.forEach(st=>{const g=gs[String(st.category||'comprehensive')]||gs.comprehensive;if(g)g.appendChild(card(st))})}catch(e){console.warn('Global stores cloud list unavailable; keeping static stores.',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
'''
js_path.write_text(js,encoding='utf-8')

category_map={'المتاجر الشاملة':'comprehensive','الأزياء والملابس':'fashion','الرياضة':'sports','التجميل والعناية':'beauty','المنزل':'home'}
intl=index[index.index('<section id="internationalStoresSection">'):]
headings=[(m.start(),category_map.get(m.group(1).strip(),'comprehensive')) for m in re.finditer(r'<h2 class="section-title">([^<]+)</h2>',intl)]
card_re=re.compile(r'<div class="store-card"><div class="logo-container"><img class="store-logo" src="([^"]*)" alt="([^"]*)"></div><h3>([^<]*)</h3><a class="store-link" href="([^"]*)"[^>]*>[^<]*</a></div>')
rows=[]
for i,m in enumerate(card_re.finditer(intl),1):
    cat='comprehensive'
    for pos,k in headings:
        if pos<m.start(): cat=k
        else: break
    logo,alt,name,url=m.groups();rows.append((name.strip() or alt.strip(),logo.strip(),cat,url.strip(),i))
if not rows: raise SystemExit('No static global store cards found for seed')
def q(s): return "'"+str(s).replace("'","''")+"'"
values=',\n'.join(f"({q(n)},{q(l)},{q(c)},{q(u)},{o},true)" for n,l,c,u,o in rows)
migration=f'''-- MeshWar global stores: public read + admin-verified write RPCs.
create table if not exists public.global_stores (
  id bigint generated by default as identity primary key,
  name text not null unique,
  logo_url text not null default '',
  category text not null default 'comprehensive' check (category in ('comprehensive','fashion','sports','beauty','home')),
  store_url text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.global_stores enable row level security;
revoke all on table public.global_stores from anon, authenticated;
grant select on table public.global_stores to anon, authenticated;
drop policy if exists global_stores_public_read on public.global_stores;
create policy global_stores_public_read on public.global_stores for select to anon, authenticated using (true);

create or replace function public.save_global_store(p_admin_id text,p_name text,p_logo_url text,p_category text,p_store_url text,p_sort_order integer default 0)
returns bigint language plpgsql security definer set search_path=public as $$
declare v_id bigint;
begin
  if not exists (select 1 from public.employees e where e.id::text=btrim(p_admin_id) and lower(btrim(coalesce(e.role::text,''))) in ('admin','أدمن','ادمن') and coalesce(e.is_active,true)=true) then raise exception 'Not authorized to manage global stores'; end if;
  if btrim(coalesce(p_name,''))='' or btrim(coalesce(p_store_url,''))='' then raise exception 'Store name and URL are required'; end if;
  if coalesce(p_category,'') not in ('comprehensive','fashion','sports','beauty','home') then raise exception 'Invalid store category'; end if;
  insert into public.global_stores(name,logo_url,category,store_url,sort_order,is_active,updated_at) values(btrim(p_name),btrim(coalesce(p_logo_url,'')),p_category,btrim(p_store_url),coalesce(p_sort_order,0),true,now())
  on conflict(name) do update set logo_url=excluded.logo_url,category=excluded.category,store_url=excluded.store_url,sort_order=excluded.sort_order,is_active=true,updated_at=now() returning id into v_id;
  return v_id;
end;$$;

create or replace function public.delete_global_store(p_admin_id text,p_store_id bigint)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not exists (select 1 from public.employees e where e.id::text=btrim(p_admin_id) and lower(btrim(coalesce(e.role::text,''))) in ('admin','أدمن','ادمن') and coalesce(e.is_active,true)=true) then raise exception 'Not authorized to manage global stores'; end if;
  delete from public.global_stores where id=p_store_id;
  return found;
end;$$;
revoke all on function public.save_global_store(text,text,text,text,text,integer) from public;
revoke all on function public.delete_global_store(text,bigint) from public;
grant execute on function public.save_global_store(text,text,text,text,text,integer) to anon, authenticated;
grant execute on function public.delete_global_store(text,bigint) to anon, authenticated;

insert into public.global_stores(name,logo_url,category,store_url,sort_order,is_active) values
{values}
on conflict(name) do update set logo_url=excluded.logo_url,category=excluded.category,store_url=excluded.store_url,sort_order=excluded.sort_order,is_active=excluded.is_active,updated_at=now();
'''
mp=Path('supabase/migrations/20260820_create_global_stores.sql')
mp.parent.mkdir(parents=True,exist_ok=True)
mp.write_text(migration,encoding='utf-8')
print(f'Seeded {len(rows)} global stores')
