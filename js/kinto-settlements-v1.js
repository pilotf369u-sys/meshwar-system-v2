/* Atomic session-bound settlement operations. No direct table/marker fallback. */
(function(global){
 'use strict';
 async function rpc(sb,name,args){const session=global.KintoStaffDirectoryV1.session();if(!['admin','branch'].includes(session.actorRole))throw Error('SETTLEMENT_ROLE_REQUIRED');const {data,error}=await sb.rpc(name,{p_role:session.actorRole,p_session_token:session.token,...args});if(error)throw error;if(!data?.ok)throw Error('تعذر تأكيد عملية التقفيل.');return data}
 const request=(sb,type,branchId,courierId,ids,basis='collection')=>rpc(sb,'kinto_request_settlements_session_v1',{p_type:type,p_branch_id:String(branchId),p_courier_id:courierId?String(courierId):null,p_order_ids:ids,p_basis:basis});
 const decide=(sb,id,action)=>rpc(sb,'kinto_decide_settlement_session_v1',{p_settlement_id:String(id),p_action:action});
 const cash=(sb,courierId,ids,notes)=>rpc(sb,'kinto_cash_settle_courier_session_v1',{p_courier_id:String(courierId),p_order_ids:ids,p_notes:notes||''});
 function from(sb,table){
  if(!['settlements','delivery_settlements'].includes(table))throw Error('SETTLEMENT_DIRECTORY_TABLE_INVALID');
  let fields='*',filters=[],order='id',ascending=true,limit=2000,offset=0,mode='many',promise;
  const chain={select(value='*'){fields=value;return chain},eq(field,value){filters.push({field,op:'eq',value});return chain},in(field,value){filters.push({field,op:'in',value});return chain},gte(field,value){filters.push({field,op:'gte',value});return chain},lte(field,value){filters.push({field,op:'lte',value});return chain},order(field,options={}){order=field;ascending=options.ascending!==false;return chain},range(start,end){offset=start;limit=end-start+1;return chain},limit(value){limit=value;return chain},single(){mode='single';return chain},maybeSingle(){mode='maybe';return chain},then(resolve,reject){promise??=execute();return promise.then(resolve,reject)}};
  async function execute(){try{
   const s=global.KintoStaffDirectoryV1.session(),{data,error}=await sb.rpc('kinto_settlements_directory_session_v1',{p_role:s.actorRole,p_session_token:s.token,p_table:table,p_filters:filters,p_order:order,p_ascending:ascending,p_limit:limit,p_offset:offset});
   if(error)return {data:null,error,count:null};if(!Array.isArray(data?.rows)||!Number.isSafeInteger(data.count))throw Error('SETTLEMENT_DIRECTORY_RESPONSE_INVALID');
   let rows=data.rows;if(fields!=='*'){const keys=fields.split(',').map(x=>x.trim());rows=rows.map(row=>Object.fromEntries(keys.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]])))}
   if(mode!=='many'){if(rows.length>1||(mode==='single'&&rows.length!==1))throw Error('SETTLEMENT_DIRECTORY_ROW_COUNT_INVALID');return {data:rows[0]||null,error:null,count:data.count}}
   return {data:rows,error:null,count:data.count};
  }catch(error){return {data:null,error,count:null}}}
  return chain;
 }
 const watchers=new Map();
 function watch(sb,table,onChange){watchers.get(table)?.();let signature=null,busy=false,stopped=false;
  async function poll(){if(stopped||busy||document.hidden)return;busy=true;try{const {data,error}=await from(sb,table);if(error)return;const next=JSON.stringify(data);if(signature!==null&&signature!==next)await onChange();signature=next}catch(error){console.warn('Settlement refresh unavailable',error)}finally{busy=false}}
  const timer=setInterval(poll,10000),visible=()=>{if(!document.hidden)poll()};document.addEventListener('visibilitychange',visible);global.addEventListener('pagehide',stop,{once:true});
  function stop(){stopped=true;clearInterval(timer);document.removeEventListener('visibilitychange',visible);global.removeEventListener('pagehide',stop);if(watchers.get(table)===stop)watchers.delete(table)}
  watchers.set(table,stop);poll();return stop;
 }
 global.KintoSettlementsV1=Object.freeze({request,decide,cash,from,watch});
})(window);
