/* Session-bound customer reads. No direct table fallback or role guessing from stored accounts. */
(function(global){
 'use strict';
 const configuredRole=document.currentScript?.dataset.role||'customer';
 const versions={admin:147,employee:143,branch:148,courier:149};
 const url='https://hsmmbloouskqdnptiiad.supabase.co',key='sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH';
 function stored(storage,key){try{return JSON.parse(storage.getItem(key)||'null')}catch{return null}}
 function session(){
  let role=configuredRole,value;
  if(role==='manifest'||role==='report'){const q=new URLSearchParams(location.search);role=q.get('adminId')?'admin':q.get('employeeId')?'employee':q.get('branchId')?'branch':'';}
  if(role==='customer-view'){
   const q=new URLSearchParams(location.search),delegated=stored(sessionStorage,'kinto_staff_customer_view_v151'),viewedBy=q.get('viewedBy');
   if(['admin','employee'].includes(viewedBy)){
    if(delegated?.role!==viewedBy||String(delegated.customerId)!==q.get('customerId')||!Number.isFinite(Number(delegated.createdAt))||Date.now()-Number(delegated.createdAt)>300000)throw Error('CUSTOMER_DIRECTORY_DELEGATION_INVALID');
    role=viewedBy;value=delegated;
   }else role='customer';
  }
  if(!value){
   if(versions[role])value=stored(sessionStorage,`kinto_${role}_session_v${versions[role]}`);
   else if(role==='vendor')value=stored(sessionStorage,'meshwar_vendor_session_v95');
   else if(role==='customer'){
    if(localStorage.getItem('kinto_customer_logged_out_v150')==='1')throw Error('CUSTOMER_SESSION_REQUIRED');
    value=stored(sessionStorage,'kinto_customer_review_session_v132')||stored(localStorage,'kinto_customer_session_v150');
   }else throw Error('CUSTOMER_DIRECTORY_ROLE_REQUIRED');
  }
  if(!value?.token||(value.expiresAt&&Date.parse(value.expiresAt)<=Date.now()))throw Error('CUSTOMER_DIRECTORY_SESSION_REQUIRED');
  return {role,token:String(value.token)};
 }
 async function request(sb,args){
  if(sb)return sb.rpc('kinto_customer_directory_session_v1',args);
  const response=await fetch(url+'/rest/v1/rpc/kinto_customer_directory_session_v1',{method:'POST',cache:'no-store',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(args)});
  const body=await response.json();return response.ok?{data:body,error:null}:{data:null,error:body};
 }
 function from(sb){
  let fields='*',filters=[],search='',order='id',ascending=true,limit=2000,offset=0,mode='many',promise;
  const chain={select(value='*'){fields=value;return chain},eq(field,value){filters.push({field,op:'eq',value});return chain},in(field,value){filters.push({field,op:'in',value});return chain},not(field,op,value){if(op!=='is'||value!==null)throw Error('CUSTOMER_DIRECTORY_FILTER_INVALID');filters.push({field,op:'not_null'});return chain},or(expression){
   const clauses=String(expression).split(','),terms=clauses.map(clause=>{const match=clause.match(/^(name|phone|secondary_phone|code|email)\.ilike\.%([\s\S]*)%$/);if(!match)throw Error('CUSTOMER_DIRECTORY_SEARCH_INVALID');return match[2]});
   if(!terms.length||terms.some(x=>x!==terms[0]))throw Error('CUSTOMER_DIRECTORY_SEARCH_INVALID');search=terms[0];return chain;
  },order(field,options={}){order=field;ascending=options.ascending!==false;return chain},limit(value){limit=value;return chain},range(start,end){offset=start;limit=end-start+1;return chain},single(){mode='single';return chain},maybeSingle(){mode='maybe';return chain},then(resolve,reject){promise??=execute();return promise.then(resolve,reject)}};
  async function execute(){try{
   const s=session(),{data,error}=await request(sb,{p_role:s.role,p_session_token:s.token,p_filters:filters,p_search:search,p_order:order,p_ascending:ascending,p_limit:limit,p_offset:offset});
   if(error)return {data:null,error,count:null};if(!Array.isArray(data?.rows)||!Number.isSafeInteger(data.count)||data.count<0)return {data:null,error:{message:'CUSTOMER_DIRECTORY_RESPONSE_INVALID'},count:null};
   let rows=data.rows;if(fields!=='*'){const keys=fields.split(',').map(x=>x.trim());rows=rows.map(row=>Object.fromEntries(keys.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]])))}
   if(mode!=='many'){if(rows.length>1||(mode==='single'&&rows.length!==1))return {data:null,error:{code:'PGRST116',message:'CUSTOMER_DIRECTORY_ROW_COUNT_INVALID'},count:data.count};return {data:rows[0]||null,error:null,count:data.count}}
   return {data:rows,error:null,count:data.count};
  }catch(error){return {data:null,error,count:null}}}
  return chain;
 }
 global.KintoCustomerDirectoryV1=Object.freeze({from,session});
})(window);
