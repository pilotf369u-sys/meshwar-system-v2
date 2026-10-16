/* Explicit transport for vendor product writes; public reads use the original fetch. */
(()=>{'use strict';
const root=window,origin='https://hsmmbloouskqdnptiiad.supabase.co';
function forWindow(win){const native=win.fetch.bind(win);return async function productFetch(input,init){
 const request=new Request(input,init),url=new URL(request.url),method=request.method.toUpperCase();
 if(url.origin!==origin||url.pathname!=='/rest/v1/local_products'||['GET','HEAD','OPTIONS'].includes(method))return native(input,init);
 try{
  if(!['POST','PATCH','DELETE'].includes(method))throw Error('PRODUCT_METHOD_DENIED');
  const session=JSON.parse(win.sessionStorage.getItem('meshwar_vendor_session_v95')||'null');
  if(!session?.token||(session.expiresAt&&Date.parse(session.expiresAt)<=Date.now()))throw Error('VENDOR_SESSION_REQUIRED');
  if(url.searchParams.has('on_conflict'))throw Error('PRODUCT_UPSERT_DENIED');
  const filters=[];let id=null;
  for(const [field,expression]of url.searchParams){
   if(['select','order','limit','offset','columns'].includes(field))continue;
   const dot=expression.indexOf('.'),op=expression.slice(0,dot),value=expression.slice(dot+1);
   if(dot<0||!['eq','is'].includes(op))throw Error('PRODUCT_FILTER_INVALID');
   const parsed=op==='is'&&value==='null'?null:field==='options'?JSON.parse(value):value;
   filters.push({field,op,value:parsed});if(field==='id'&&op==='eq')id=value;
  }
  let patch=method==='DELETE'?{}:await request.clone().json();
  if(Array.isArray(patch)){if(patch.length!==1)throw Error('PRODUCT_SINGLE_ROW_REQUIRED');patch=patch[0]}
  const args={p_session_token:session.token,p_action:{POST:'insert',PATCH:'update',DELETE:'delete'}[method],p_id:id,p_patch:patch,p_filters:filters};
  const headers=new Headers(request.headers);headers.delete('prefer');headers.set('Content-Type','application/json');headers.set('Accept','application/json');
  const response=await native(origin+'/rest/v1/rpc/kinto_vendor_product_write_session_v1',{method:'POST',headers,body:JSON.stringify(args),signal:request.signal});
  if(!response.ok)return response;
  const rows=await response.json(),select=url.searchParams.get('select');
  const representation=String(request.headers.get('Prefer')||'').includes('return=representation')||Boolean(select);
  if(!representation)return new Response(null,{status:204});
  let result=Array.isArray(rows)?rows:[];
  if(select&&select!=='*'){const fields=select.split(',');if(fields.some(x=>!/^\w+$/.test(x)))throw Error('PRODUCT_SELECT_INVALID');result=result.map(row=>Object.fromEntries(fields.filter(k=>k in row).map(k=>[k,row[k]])))}
  const object=String(request.headers.get('Accept')||'').includes('vnd.pgrst.object');
  if(object&&result.length!==1)return new Response(JSON.stringify({code:'PGRST116',message:'Expected one product row',details:'The result contains '+result.length+' rows'}),{status:406,headers:{'Content-Type':'application/json'}});
  return new Response(JSON.stringify(object?result[0]:result),{status:method==='POST'?201:200,headers:{'Content-Type':'application/json','Content-Range':`0-${Math.max(0,result.length-1)}/${result.length}`}});
 }catch(error){return new Response(JSON.stringify({message:error.message||'PRODUCT_WRITE_FAILED'}),{status:400,headers:{'Content-Type':'application/json'}})}
}}
root.KintoVendorProductsV1={forWindow,fetch:forWindow(root)};
})();
