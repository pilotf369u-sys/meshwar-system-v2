/* KINTO standalone store header. Loaded by store.html only. */
const SUPABASE_URL='https://hsmmbloouskqdnptiiad.supabase.co';
const SUPABASE_KEY='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
const account=document.getElementById('kintoStoreAccount');
const accountLabel=document.getElementById('kintoStoreAccountLabel');
const logout=document.getElementById('kintoStoreLogout');
const greeting=document.querySelector('#kintoStoreCustomerState .store-customer-greeting');
const code=document.getElementById('kintoStoreCustomerCode');

function storedCustomer(){
  let id=String(localStorage.getItem('meshwar_customer_id')||localStorage.getItem('viewingCustomerId')||'').trim(),name='';
  try{const user=JSON.parse(localStorage.getItem('loggedInUser')||'{}');id=id||String(user?.id||'').trim();name=String(user?.name||'').trim()}catch{}
  return{id,name};
}
async function supabaseClient(){
  if(window.KintoSupabase)return window.KintoSupabase;
  if(!window.KintoSupabaseReady)window.KintoSupabaseReady=import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm').then(({createClient})=>window.KintoSupabase||(window.KintoSupabase=createClient(SUPABASE_URL,SUPABASE_KEY)));
  return window.KintoSupabaseReady;
}
function showCustomer(id,name){
  if(!id)return;
  account.href='dashboard.html?customerId='+encodeURIComponent(id);
  accountLabel.textContent='حسابي';
  greeting.textContent=name?'أهلاً بك يا '+name:'أهلاً بك يا عزيزي العميل';
  code.textContent='Customer Code: '+id;
  code.hidden=false;
  logout.hidden=false;
}
async function syncCustomer(){
  const stored=storedCustomer();let authUser=null;
  try{const client=await supabaseClient(),{data,error}=await client.auth.getSession();if(error)throw error;authUser=data?.session?.user||null}catch(error){console.warn('KINTO store header session sync failed:',error)}
  const id=String(authUser?.user_metadata?.customer_id||authUser?.app_metadata?.customer_id||stored.id||authUser?.id||'').trim();
  const name=String(authUser?.user_metadata?.name||authUser?.user_metadata?.full_name||stored.name||'').trim();
  showCustomer(id,name);
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
