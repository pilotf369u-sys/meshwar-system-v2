/* KINTO standalone store header. Loaded by store.html only. */
const SUPABASE_URL='https://hsmmbloouskqdnptiiad.supabase.co';
const SUPABASE_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
const account=document.getElementById('kintoStoreAccount');
const accountLabel=document.getElementById('kintoStoreAccountLabel');
const logout=document.getElementById('kintoStoreLogout');
const greeting=document.querySelector('#kintoStoreCustomerState .store-customer-greeting');
const code=document.getElementById('kintoStoreCustomerCode');

function storedCustomer(){
  let id=String(localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId')||'').trim(),name='',customerCode='';
  try{const user=JSON.parse(localStorage.getItem('loggedInUser')||'{}');id=id||String(user?.id||'').trim();name=String(user?.name||'').trim();customerCode=String(user?.code||user?.customer_code||'').trim()}catch{}
  return{id,name,customerCode};
}
async function supabaseClient(){
  if(window.KintoSupabase)return window.KintoSupabase;
  if(!window.KintoSupabaseReady)window.KintoSupabaseReady=import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(({createClient})=>window.KintoSupabase||(window.KintoSupabase=createClient(SUPABASE_URL,SUPABASE_KEY)));
  return window.KintoSupabaseReady;
}
function safeCustomerCode(value){
  const candidate=String(value||'').trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)?'':candidate;
}
async function customerProfile(client,id){
  if(!id)return null;
  try{const{data,error}=await client.from('customers').select('id,name,code').eq('id',id).maybeSingle();if(error)throw error;return data||null}catch(error){console.warn('KINTO store customer profile lookup failed:',error);return null}
}
function showCustomer(id,name,customerCode){
  if(!id)return;
  account.href='dashboard.html?customerId='+encodeURIComponent(id);
  accountLabel.textContent='حسابي';
  greeting.textContent=name?'أهلاً بك يا '+name:'أهلاً بك يا عزيزي العميل';
  const visibleCode=safeCustomerCode(customerCode);
  code.textContent=visibleCode?'Customer Code: '+visibleCode:'';
  code.hidden=!visibleCode;
  logout.hidden=false;
}
async function syncCustomer(){
  const stored=storedCustomer();let authUser=null,client=null;
  try{client=await supabaseClient();const{data,error}=await client.auth.getSession();if(error)throw error;authUser=data?.session?.user||null}catch(error){console.warn('KINTO store header session sync failed:',error)}
  const id=String(authUser?.user_metadata?.customer_id||authUser?.app_metadata?.customer_id||stored.id||authUser?.id||'').trim();
  const profile=client?await customerProfile(client,id):null;
  const name=String(profile?.name||authUser?.user_metadata?.name||authUser?.user_metadata?.full_name||stored.name||'').trim();
  const customerCode=String(profile?.code||authUser?.user_metadata?.customer_code||authUser?.app_metadata?.customer_code||stored.customerCode||'').trim();
  showCustomer(id,name,customerCode);
}
logout?.addEventListener('click',async()=>{
  logout.disabled=true;
  try{const client=await supabaseClient();await client.auth.signOut({scope:'local'})}catch(error){console.warn('KINTO store sign-out warning:',error)}finally{
    ['meshwar_customer_id','loggedInUser','viewingCustomerId'].forEach(key=>{localStorage.removeItem(key);sessionStorage.removeItem(key)});
    for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i);if(/^sb-.*-auth-token$/i.test(String(key||'')))localStorage.removeItem(key)}
    location.replace('index.html');
  }
});
syncCustomer();
