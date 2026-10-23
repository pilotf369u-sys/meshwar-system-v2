(()=>{'use strict';
 const configured=document.currentScript?.dataset.role||'staff',staff=configured==='staff';let busy=false;
 function embeddedStaff(){
  const root=document.querySelector(document.currentScript?.dataset.root||'#kintoWorldEmbedded');if(!root)return;
  let routes=[],directory={},loaded=false,loading=false,acting=false,sessionToken='';
  const states={routed:'محول — بانتظار الاستلام',received:'تم الاستلام',out_for_delivery:'جاري التوصيل',delivered:'تم التسليم'};
  const workspace=()=>window.KintoWorldWorkspaceV1;
  function el(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
  function mount(){
   let actor;try{actor=workspace().actor();}catch{return;}
   if(actor.token!==sessionToken)return;
   const orders=workspace().view().orders;
   for(const slot of root.querySelectorAll('.world-order-dispatch')){
    const o=orders.find(o=>o.id===slot.dataset.orderId);if(!o)continue;
    if(o.state!=='shipping'){slot.textContent='اختيار الفرع أو المندوب متاح هنا بعد تأكيد تم الشحن.';continue;}
    if(!loaded)continue;
    if(slot.closest('article').dataset.revision!==String(o.revision)){slot.textContent='تغير الطلب؛ حدّثه قبل تحويله.';continue;}
    const route=routes.find(r=>r.id===o.id),signature=JSON.stringify([o.id,o.revision,route?.fulfillment,directory]);if(slot.dataset.signature===signature)continue;
    slot.dataset.signature=signature;slot.replaceChildren(el('h3','الفرع والتوصيل لهذا الطلب'));
    const f=route?.fulfillment;if(f){slot.append(el('p',states[f.phase]||f.phase));const branch=(directory.branches||[]).find(x=>x.id===f.branch_id),courier=(directory.couriers||[]).find(x=>x.id===f.courier_id);if(branch)slot.append(el('p','الفرع: '+branch.name));if(courier)slot.append(el('p','المندوب: '+courier.name));}
    else slot.append(el('p','تم الشحن — اختر الفرع أو المندوب لاستلام هذه الشحنة.'));
    if(f&&!['routed','received'].includes(f.phase))continue;
    const select=document.createElement('select');select.setAttribute('aria-label','جهة تحويل '+o.reference);select.append(new Option('اختر الفرع أو المندوب',''));for(const b of directory.branches||[])select.append(new Option('فرع — '+b.name,'branch:'+b.id));for(const c of directory.couriers||[])select.append(new Option('مندوب — '+c.name,'courier:'+c.id));
    const button=el('button',f?'تغيير جهة التحويل':'تحويل هذا الطلب'),notice=el('p','');button.type='button';notice.setAttribute('role','status');slot.append(select,button,notice);
    button.onclick=async()=>{if(acting)return;if(!select.value){notice.textContent='اختر الفرع أو المندوب أولًا.';return;}acting=true;button.disabled=true;try{const a=workspace().actor();if(a.token!==sessionToken)throw Error('SESSION_CHANGED');const i=select.value.indexOf(':');await workspace().rpc('kinto_world_dispatch_action_v1',{p_role:a.role,p_session_token:a.token,p_order_id:o.id,p_expected_revision:o.revision,p_action:f?'reroute':'route',p_data:{target_role:select.value.slice(0,i),target_id:select.value.slice(i+1)}});notice.textContent='تم تحويل الطلب';await workspace().reload(true);await load();}catch(e){notice.textContent=e.message==='WORLD_REVISION_CONFLICT'?'تغير الطلب؛ حدّثه وراجع جهة التحويل.':'تعذر التحويل؛ راجع الحالة والجلسة ثم أعد المحاولة.';}finally{acting=false;button.disabled=false;}};
   }
  }
  async function load(){if(loading||!root.isConnected)return;loading=true;try{const a=workspace().actor(),args={p_role:a.role,p_session_token:a.token};const data=await Promise.all([workspace().rpc('kinto_world_dispatch_list_v1',args),workspace().rpc('kinto_world_dispatch_directory_v1',args)]);const current=workspace().actor();if(a.token!==current.token||a.role!==current.role)throw Error('SESSION_CHANGED');routes=data[0];directory=data[1];sessionToken=a.token;loaded=true;mount();}catch{loaded=false;for(const slot of root.querySelectorAll('.world-order-dispatch'))slot.textContent='تعذر تحميل جهة التحويل. حدّث الطلبات للمحاولة مجددًا.';}finally{loading=false;}}
  window.addEventListener('kinto-world-orders-loaded',load);window.addEventListener('kinto-world-view-changed',mount);load();
 }
 if(staff){embeddedStaff();return;}
 const section=document.createElement('details');section.id='worldDispatchMailbox';section.open=staff;section.dir='rtl';
 section.innerHTML='<summary>طلبات المتاجر العالمية — الفرع والتوصيل <span data-count></span></summary><button type="button" data-refresh>تحديث</button><p data-notice role="status"></p><div data-orders></div>';
 const style=document.createElement('style');style.textContent='#worldDispatchMailbox{margin:20px 0;padding:18px;background:#0a2f23;color:#fff;border:1px solid #bda064;border-radius:18px;font:15px/1.8 system-ui,sans-serif}#worldDispatchMailbox summary{cursor:pointer;color:#f3d58b;font-weight:700}#worldDispatchMailbox article{margin:14px 0;padding:16px;background:#123f30;border-radius:14px}#worldDispatchMailbox button,#worldDispatchMailbox select{font:inherit;min-height:44px;padding:8px 14px;border-radius:10px;margin:6px;border:1px solid #bda064;background:#f0d28a;color:#0a2f23}#worldDispatchMailbox p{margin:6px 0;overflow-wrap:anywhere}';document.head.append(style);
 const anchor=staff?document.querySelector(document.currentScript?.dataset.root||'main'):document.getElementById(configured==='branch'?'branchOrdersSection':'ordersGrid');if(!anchor)return;if(staff)anchor.append(section);else anchor.before(section);
 const list=section.querySelector('[data-orders]'),notice=section.querySelector('[data-notice]');
 const states={routed:'محول — بانتظار الاستلام',received:'تم الاستلام',out_for_delivery:'جاري التوصيل',delivered:'تم التسليم'};
 function actor(){if(staff)return window.KintoWorldWorkspaceV1.actor();const helper=configured==='branch'?window.KintoBranchSessionV148:window.KintoCourierSessionV149;const session=helper?.read();if(!session?.token)throw Error('سجّل الدخول أولًا');return{role:configured,token:session.token};}
 async function rpc(name,args){if(staff)return window.KintoWorldWorkspaceV1.rpc(name,args);const r=await fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/'+name,{method:'POST',credentials:'omit',cache:'no-store',headers:{apikey:'sb_publishable_6_IDhNRdtxboDuCfBeAulQ_RRrBqpFH','Content-Type':'application/json'},body:JSON.stringify(args)});const data=await r.json();if(!r.ok)throw Error(data.message||'تعذر التنفيذ');return data;}
 function el(tag,text){const e=document.createElement(tag);e.textContent=text;return e;}
 function button(card,o,action,label,data={}){const b=el('button',label);b.type='button';b.onclick=()=>perform(o,action,data);card.append(b);}
 function targets(card,o,action,directory){const options=[];if(['route','reroute'].includes(action))for(const b of directory.branches||[])options.push({value:'branch:'+b.id,name:'فرع — '+(b.name||'الفرع')});for(const c of directory.couriers||[])options.push({value:'courier:'+c.id,name:'توصيل — '+(c.name||'موظف التوصيل')});const select=document.createElement('select');select.setAttribute('aria-label','جهة التحويل');select.append(new Option('اختر جهة التحويل',''));for(const x of options)select.append(new Option(x.name,x.value));card.append(select);const b=el('button',['route','reroute'].includes(action)?'تحويل الطلب':'تحويل إلى موظف التوصيل');b.type='button';b.onclick=()=>{if(!select.value){notice.textContent='اختر جهة التحويل';return;}const i=select.value.indexOf(':');perform(o,action,{target_role:select.value.slice(0,i),target_id:select.value.slice(i+1)});};card.append(b);}
 function card(o){const c=document.createElement('article');c.append(el('h3',o.reference));for(const p of o.request?.items||[])c.append(el('p',p.title+' × '+p.quantity));if(o.request?.contact)c.append(el('p',o.request.contact.name+' — '+o.request.contact.phone),el('p',o.request.contact.address));c.append(el('p',o.paid?'مدفوع مسبقًا — لا تحصيل عند التسليم':'راجع حالة التسديد'));return c;}
 async function perform(o,action,data){if(busy)return;busy=true;try{const a=actor();await rpc('kinto_world_dispatch_action_v1',{p_role:a.role,p_session_token:a.token,p_order_id:o.id,p_expected_revision:o.revision,p_action:action,p_data:data});notice.textContent='تم تحديث الطلب';}catch(e){notice.textContent=e.message==='WORLD_REVISION_CONFLICT'?'تغير الطلب؛ أعد تحميله وراجعه.':'تعذر تحديث الطلب. راجع حالته وصلاحيتك ثم حاول مجددًا.';}finally{busy=false;await load();if(staff)window.KintoWorldWorkspaceV1.reload();}}
 async function load(){if(busy)return;busy=true;try{const a=actor(),args={p_role:a.role,p_session_token:a.token};const routed=await rpc('kinto_world_dispatch_list_v1',args);const directory=a.role==='courier'?{}:await rpc('kinto_world_dispatch_directory_v1',args);list.replaceChildren();section.querySelector('[data-count]').textContent='('+routed.filter(o=>o.fulfillment.phase!=='delivered').length+')';
 if(staff){const all=await rpc('kinto_world_list_v1',args),assigned=new Set(routed.map(o=>o.id));for(const o of all.filter(o=>o.state==='shipping'&&!assigned.has(o.id))){const c=card({...o,paid:o.payment?.status==='confirmed'});c.append(el('p','جاهز للتحويل إلى الفرع أو التوصيل'));targets(c,o,'route',directory);list.append(c);}}
 for(const o of routed){const c=card(o),f=o.fulfillment;c.append(el('p',states[f.phase]||f.phase));if(staff&&['routed','received'].includes(f.phase))targets(c,o,'reroute',directory);if(a.role==='branch'&&f.phase==='routed'&&!f.courier_id)button(c,o,'receive','تأكيد استلام الفرع');if(a.role==='branch'&&f.phase==='received'&&!f.courier_id)targets(c,o,'assign_courier',directory);if(a.role==='courier'&&f.phase==='routed')button(c,o,'receive','تأكيد استلام الشحنة');if(a.role==='courier'&&f.phase==='received')button(c,o,'start_delivery','بدء التوصيل');if(a.role==='courier'&&f.phase==='out_for_delivery')button(c,o,'deliver','تم التسليم');list.append(c);}
 if(!list.children.length)list.append(el('p','لا توجد طلبات عالمية محوّلة إليك حاليًا.'));notice.textContent='';
 }catch(e){notice.textContent='تعذر تحميل الطلبات العالمية. أعد المحاولة.';}finally{busy=false;}}
 section.querySelector('[data-refresh]').onclick=load;if(staff)window.addEventListener('kinto-world-orders-loaded',load);section.addEventListener('toggle',()=>{if(section.open)load();});load();
})();
