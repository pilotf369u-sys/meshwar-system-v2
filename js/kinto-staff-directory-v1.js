/* Session-bound read-only staff directory. No fallback to table access. */
(function(global){
 'use strict';
 const configuredRole=document.currentScript?.dataset.role||'';
 const versions={admin:147,employee:143,branch:148,courier:149};
 function role(){if(configuredRole!=='report'&&configuredRole!=='manifest')return configuredRole;const q=new URLSearchParams(location.search);if(q.get('adminId'))return 'admin';if(q.get('employeeId'))return 'employee';if(q.get('branchId'))return 'branch';throw new Error('STAFF_ROLE_REQUIRED')}
 function session(actorRole=role()){
  if(!versions[actorRole])throw new Error('STAFF_ROLE_REQUIRED');
  let value;try{value=JSON.parse(sessionStorage.getItem(`kinto_${actorRole}_session_v${versions[actorRole]}`)||'null')}catch{}
  if(!value?.token||(value.expiresAt&&Date.parse(value.expiresAt)<=Date.now()))throw new Error('STAFF_SESSION_REQUIRED');
  return {actorRole,token:String(value.token)};
 }
 async function identity(sb,actorRole,routeId){const s=session(actorRole),{data,error}=await sb.rpc(`${actorRole}_session_identity_v${versions[actorRole]}`,{p_session_token:s.token});if(error)throw error;const actor=data?.[actorRole];if(!data?.ok||!actor)throw new Error('STAFF_SESSION_INVALID');if(routeId&&String(actor.id)!==String(routeId))throw new Error('STAFF_SESSION_ROUTE_MISMATCH');return actor}
 function from(sb,table){
  if(!['employees','branches','couriers'].includes(table))throw new Error('DIRECTORY_TABLE_NOT_ALLOWED');
  let fields='*',filters=[],order='id',ascending=true,limit=2000,mode='many',promise;
  const chain={select(value='*'){fields=value;return chain},eq(field,value){filters.push({field,op:'eq',value});return chain},neq(field,value){filters.push({field,op:'neq',value});return chain},in(field,value){filters.push({field,op:'in',value});return chain},order(field,options={}){order=field;ascending=options.ascending!==false;return chain},limit(value){limit=value;return chain},single(){mode='single';return chain},maybeSingle(){mode='maybe';return chain},then(resolve,reject){promise??=execute();return promise.then(resolve,reject)}};
  async function execute(){try{const s=session();const {data,error}=await sb.rpc('kinto_staff_directory_session_v1',{p_role:s.actorRole,p_session_token:s.token,p_table:table,p_filters:filters,p_order:order,p_ascending:ascending,p_limit:limit});if(error)return {data:null,error};if(!Array.isArray(data))return {data:null,error:{message:'DIRECTORY_RESPONSE_INVALID'}};let rows=data;if(fields!=='*'){const keys=fields.split(',').map(x=>x.trim());rows=rows.map(row=>Object.fromEntries(keys.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]])))}if(mode!=='many'){if(rows.length>1||(mode==='single'&&rows.length!==1))return {data:null,error:{code:'PGRST116',message:'DIRECTORY_ROW_COUNT_INVALID'}};return {data:rows[0]||null,error:null}}return {data:rows,error:null}}catch(error){return {data:null,error}}}
  return chain;
 }
 const watchers=new Map();
 function watch(sb,table,onChange){const key=role()+':'+table;watchers.get(key)?.();let signature=null,running=false,stopped=false;
  async function poll(){if(stopped||running||document.hidden)return;running=true;try{const {data,error}=await from(sb,table);if(error)return;const next=JSON.stringify(data);if(signature!==null&&signature!==next)await onChange();signature=next}catch(error){console.warn('Staff directory refresh unavailable',error)}finally{running=false}}
  const timer=setInterval(poll,10000),visible=()=>{if(!document.hidden)poll()};document.addEventListener('visibilitychange',visible);global.addEventListener('pagehide',stop,{once:true});
  function stop(){stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);global.removeEventListener('pagehide',stop);if(watchers.get(key)===stop)watchers.delete(key)}
  watchers.set(key,stop);poll();return stop;
 }
 global.KintoStaffDirectoryV1=Object.freeze({from,identity,session,watch});
})(window);
