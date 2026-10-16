// Runs after the shared product/assignment fixtures: real auth definitions, real session tables and existing guards.
import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
export async function verifyOrderPrivacy({db,id,admin,employee,branch,vendor,otherVendor,api}){
 let count=0;
 await db.exec(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_code text,ADD COLUMN IF NOT EXISTS customer_id text,ADD COLUMN IF NOT EXISTS customer_name text,ADD COLUMN IF NOT EXISTS customer_phone text,ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),ADD COLUMN IF NOT EXISTS shipping_company_name text,ADD COLUMN IF NOT EXISTS delivery_currency text,ADD COLUMN IF NOT EXISTS shipping_snapshot jsonb,ADD COLUMN IF NOT EXISTS parcel_image_url text;
 CREATE TABLE customer_review_sessions(customer_id uuid,token_hash bytea,expires_at timestamptz,revoked_at timestamptz,last_seen_at timestamptz);
 INSERT INTO customers(id,name,phone) VALUES('${id(601)}','Customer One','111'),('${id(602)}','Customer Two','222');
 INSERT INTO customer_review_sessions VALUES('${id(601)}',extensions.digest('customer-one','sha256'),now()+interval '1 day',null,null),('${id(602)}',extensions.digest('customer-two','sha256'),now()+interval '1 day',null,null);
 UPDATE couriers SET password=extensions.crypt('courier-pass',extensions.gen_salt('bf')) WHERE id=1;`);
 for(const x of JSON.parse(fs.readFileSync('ci/fixtures/customer-profile-definitions-20261016.json','utf8')).filter(x=>x.proname==='require_customer_review_session'))await db.exec(x.definition);
 // The unchanged checkout engine is represented by a delegate fixture: test identity and ACL here, not new pricing arithmetic.
 await db.exec(`CREATE FUNCTION public.checkout_independent_vendor_orders_v161(p_customer_id uuid,p_customer_name text,p_customer_phone text,p_customer_shipping jsonb,p_items jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN
 INSERT INTO public.orders(id,customer_id,customer_name,customer_phone,status,details) VALUES(gen_random_uuid(),p_customer_id::text,p_customer_name,p_customer_phone,'انتظار رد الموظف','{}');
 RETURN jsonb_build_object('customer_id',p_customer_id,'name',p_customer_name,'phone',p_customer_phone,'items',p_items,'shipping',p_customer_shipping); END $$;GRANT EXECUTE ON FUNCTION public.checkout_independent_vendor_orders_v161(uuid,text,text,jsonb,jsonb) TO anon,authenticated;`);
 const courier=(await api('courier_login_v149',['courier-phone','courier-pass']))[0].session_token;assert(courier);count++;
 for(let i=0;i<2;i++){await db.exec(fs.readFileSync('sql/kinto-order-privacy-session-v1.sql','utf8'));await db.exec(fs.readFileSync('sql/kinto-order-privacy-lockdown-v1.sql','utf8'))}
 await db.exec(`INSERT INTO orders(id,customer_id,customer_name,branch_id,courier_id,delivery_agent_id,status,total_price,currency,details) VALUES
 ('${id(701)}','${id(601)}','Customer One','${id(30)}','1','${id(200)}','انتظار رد الموظف',100,'USD','{"quantity":1,"notes":"keep"}'),
 ('${id(702)}','${id(602)}','Customer Two','${id(31)}','2','${id(201)}','انتظار رد الموظف',200,'USD','{}'),
 ('${id(703)}','${id(601)}','Customer One','${id(30)}','1','${id(200)}','مندوب',100,'USD','{"quantity":1,"private":"unchanged"}');`);
 async function direct(role,token,sql,args=[],apiRole='anon'){
  await db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify(token?{'x-kinto-role':role,'x-kinto-session':token}:{})]);await db.exec('SET ROLE '+apiRole);
  try{return await db.query(sql,args)}finally{await db.exec('RESET ROLE')}
 }
 async function deny(fn){await assert.rejects(fn,/DENIED|INVALID|DISABLED|SESSION|REQUIRED|permission denied|row-level security|USE_ORDER_SESSION_RPC/);count++}
 for(const apiRole of ['anon','authenticated']){
  assert.equal((await direct('',null,'SELECT id FROM orders',[],apiRole)).rows.length,0);count++;
  for(const [role,token]of [['admin','bad'],['customer','bad'],['courier','bad'],['vendor',vendor],['admin','customer-one']])await deny(()=>direct(role,token,'SELECT id FROM orders',[],apiRole));
  const own=(await direct('customer','customer-one','SELECT id FROM orders ORDER BY id',[],apiRole)).rows.map(x=>x.id);assert.deepEqual(own,[id(701),id(703)]);count++;
  assert.equal((await direct('customer','customer-two',`SELECT id FROM orders WHERE id='${id(701)}'`,[],apiRole)).rows.length,0);count++;
  assert.equal((await direct('customer','customer-two',`UPDATE orders SET status='ملغي من قبل العميل' WHERE id='${id(701)}' RETURNING id`,[],apiRole)).rows.length,0);count++;
  assert((await direct('admin',admin,'SELECT id FROM orders',[],apiRole)).rows.length>=3);count++;
  assert((await direct('employee',employee,'SELECT id FROM orders',[],apiRole)).rows.length>=3);count++;
  const branchRows=(await direct('branch',branch,'SELECT branch_id FROM orders',[],apiRole)).rows;assert(branchRows.length&&branchRows.every(x=>x.branch_id===id(30)));count++;
  const courierRows=(await direct('courier',courier,'SELECT courier_id,branch_id FROM orders',[],apiRole)).rows;assert(courierRows.length&&courierRows.every(x=>x.courier_id==='1'&&x.branch_id===id(30)));count++;
  for(const [role,token]of [['customer','customer-one'],['branch',branch],['courier',courier],['employee',employee],['admin',admin]]){
   await deny(()=>direct(role,token,`UPDATE orders SET customer_name='FORGED' WHERE id='${id(701)}'`,[],apiRole));
  }
  await deny(()=>direct('customer','customer-one',`UPDATE orders SET details='{"quantity":1,"notes":"forged"}' WHERE id='${id(701)}'`,[],apiRole));
  await deny(()=>direct('customer','customer-one',`UPDATE orders SET status='تم التسليم' WHERE id='${id(701)}'`,[],apiRole));
  await deny(()=>direct('courier',courier,`UPDATE orders SET details='{"private":"changed"}' WHERE id='${id(703)}'`,[],apiRole));
  await deny(()=>direct('branch',branch,`UPDATE orders SET status='تم التسليم' WHERE id='${id(701)}'`,[],apiRole));
  await deny(()=>direct('employee',employee,`UPDATE orders SET status='تم التسليم' WHERE id='${id(701)}'`,[],apiRole));
  await deny(()=>direct('customer','customer-one','SELECT cost_price FROM local_products',[],apiRole));
  await deny(()=>direct('customer','customer-one','SELECT * FROM local_products',[],apiRole));
  assert((await direct('',null,'SELECT id,product_name,stock_quantity,options FROM local_products',[],apiRole)).rows.length);count++;
 }
 await direct('customer','customer-one',`UPDATE orders SET details='{"quantity":2,"requested_quantity":2,"notes":"keep"}' WHERE id='${id(701)}'`);count++;
 await direct('customer','customer-one',`UPDATE orders SET status='ملغي من قبل العميل',rejection_reason='ملغي من قبل العميل' WHERE id='${id(701)}'`);count++;
 await deny(()=>direct('customer','customer-one',`UPDATE orders SET details='{"quantity":3,"requested_quantity":3,"notes":"keep"}' WHERE id='${id(701)}'`));
 await direct('courier',courier,`UPDATE orders SET details='{"quantity":1,"private":"unchanged","delivery_note":"note","delivery_proof_courier_id":"1"}' WHERE id='${id(703)}'`);count++;
 await direct('courier',courier,`UPDATE orders SET status='تم التسليم' WHERE id='${id(703)}'`);count++;
 await db.query("SELECT set_config('request.headers','{}',false)");
 // Verify the real read-only GET transaction, not merely a writable RPC simulation.
 await db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({'x-kinto-role':'customer','x-kinto-session':'customer-one'})]);
 await db.exec('BEGIN READ ONLY;SET LOCAL ROLE anon');try{assert.equal((await db.query('SELECT id FROM orders')).rows.length,2);count++}finally{await db.exec('ROLLBACK')}
 await db.query("SELECT set_config('request.headers','{}',false)");
 for(const [table,col,role,token]of [['customer_review_sessions','customer_id','customer','customer-one'],['employee_sessions_v143','employee_id','employee',employee],['branch_sessions_v148','branch_id','branch',branch],['courier_sessions_v149','courier_id','courier',courier]]){
  await db.query(`UPDATE ${table} SET revoked_at=now() WHERE token_hash=extensions.digest($1,'sha256')`,[token]);await deny(()=>direct(role,token,'SELECT id FROM orders'));
  await db.query(`UPDATE ${table} SET revoked_at=null,expires_at=now()-interval '1 second' WHERE token_hash=extensions.digest($1,'sha256')`,[token]);await deny(()=>direct(role,token,'SELECT id FROM orders'));
  await db.query(`UPDATE ${table} SET expires_at=now()+interval '1 day' WHERE token_hash=extensions.digest($1,'sha256')`,[token]);
 }
 await db.query(`UPDATE employees SET permissions='{"orders":false}' WHERE id=$1`,[id(2)]);await deny(()=>direct('employee',employee,'SELECT id FROM orders'));await db.query(`UPDATE employees SET permissions='{}' WHERE id=$1`,[id(2)]);
 await db.query(`UPDATE couriers SET is_active=false WHERE id=1`);await deny(()=>direct('courier',courier,'SELECT id FROM orders'));await db.query(`UPDATE couriers SET is_active=true WHERE id=1`);
 const submittedItems=[{store_id:id(1),product_id:id(1001),quantity:2,selected_options:{color:'orange'}}];
 await deny(()=>api('checkout_independent_vendor_orders_v161',[id(602),'Forged','999','{}',JSON.stringify(submittedItems)]));
 await deny(()=>api('kinto_checkout_session_v1',['bad','{}',JSON.stringify(submittedItems)]));
 const checked=(await api('kinto_checkout_session_v1',['customer-one',JSON.stringify({governorate:'Test'}),JSON.stringify(submittedItems)]))[0];
 assert.equal(checked.customer_id,id(601));assert.equal(checked.name,'Customer One');assert.equal(checked.phone,'111');assert.deepEqual(checked.items,submittedItems);count++;
 await direct('customer','customer-one',`INSERT INTO orders(id,customer_id,customer_name,customer_phone,status,total_price) VALUES('${id(705)}','${id(601)}','Forged','999','انتظار رد الموظف',0)`);
 const inserted=(await db.query('SELECT customer_name,customer_phone FROM orders WHERE id=$1',[id(705)])).rows[0];assert.equal(inserted.customer_name,'Customer One');assert.equal(inserted.customer_phone,'111');count++;
 await deny(()=>direct('customer','customer-one',`INSERT INTO orders(id,customer_id,status) VALUES('${id(706)}','${id(602)}','انتظار رد الموظف')`));
 // API session routes still run as their restricted definer owner after table RLS is active.
 await db.query("SELECT set_config('request.headers','{}',false)");
 const products=(await api('kinto_vendor_products_read_session_v1',[vendor]));assert(products.length&&products.every(x=>x.store_id===id(1)));count++;
 assert(!(await api('kinto_vendor_products_read_session_v1',[otherVendor])).some(x=>x.store_id===id(1)));count++;
 await db.query(`INSERT INTO orders(id,customer_id,status,total_price,currency,details) VALUES($1,$2,'تم التسديد',999,'USD',$3)`,[id(704),id(601),JSON.stringify({source:'local_cart_bundle',bundle_stock_lifecycle_state:'deducted',store_statuses:{[id(1)]:'مخزن الشركة',[id(2)]:'SECRET'},items:[{store_id:id(1),product_id:id(1001),quantity:1,line_total_local:10},{store_id:id(2),product_id:id(1002),quantity:1,line_total_local:989}]})]);
 await db.query(`INSERT INTO orders(id,customer_id,status,total_price,currency,details,delivery_fee,shipping_snapshot) VALUES($1,$2,'تم التسديد',7,'USD',$3,3,$4)`,[id(707),id(601),JSON.stringify({source:'local_cart_bundle',checkout_contract:'independent_vendor_orders',store_id:id(1),campaign_discount:3,items:[{store_id:id(1),product_id:id(1001),quantity:1,line_total_local:10}]}),JSON.stringify({company_name:'Retained',delivery_fee:3})]);
 const canonical=(await api('kinto_vendor_orders_read_session_v1',[vendor])).find(x=>x.id===id(707));assert.equal(canonical.total_price,7);assert.equal(canonical.delivery_fee,3);assert.equal(canonical.shipping_snapshot.company_name,'Retained');assert.equal(JSON.parse(canonical.details).campaign_discount,3);count++;
 const shared=(await api('kinto_vendor_orders_read_session_v1',[vendor])).find(x=>x.id===id(704));assert(shared);assert.equal(shared.total_price,10);assert(!JSON.stringify(shared).includes('SECRET'));assert(!JSON.stringify(shared).includes(id(1002)));count++;
 await api('kinto_vendor_legacy_status_session_v1',[vendor,id(704),'تم الشحن']);
 const saved=JSON.parse((await db.query('SELECT details FROM orders WHERE id=$1',[id(704)])).rows[0].details);assert.equal(saved.store_statuses[id(2)],'SECRET');assert.equal(saved.store_statuses[id(1)],'تم الشحن');count++;
 await deny(()=>api('kinto_vendor_legacy_status_session_v1',[vendor,id(702),'تم الشحن']));
 await api('kinto_save_staff_order_session_v1',['admin',admin,id(702),'انتظار رد الموظف',200,'USD',JSON.stringify({reference_order_no:'SAFE-AFTER-RLS'})]);count++;
 // Shipped header adapter + real SQL RLS, including role spoofing and URL filter attempts.
 let token='customer-one',role='customer',calls=[];
 const win={sessionStorage:{getItem:()=>JSON.stringify({token})},localStorage:{getItem:()=>null},location:{search:''},fetch:async(input,init)=>{
  const req=new Request(input,init);calls.push(req);const h=req.headers;
  try{const data=await direct(h.get('x-kinto-role'),h.get('x-kinto-session'),'SELECT id,customer_id FROM orders');return new Response(JSON.stringify(data.rows),{status:200})}catch(e){return new Response(JSON.stringify({message:e.message}),{status:403})}
 }};
 const context=vm.createContext({window:win,document:{currentScript:{dataset:{role}}},Request,Response,Headers,URL,URLSearchParams,Date,JSON,Error,String,Object,Number});vm.runInContext(fs.readFileSync('js/kinto-order-data-session-v1.js','utf8'),context);
 const res=await win.KintoOrderDataSessionV1.fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/orders?customer_id=eq.'+id(602));assert.equal(res.status,200);assert((await res.json()).every(x=>x.customer_id===id(601)));count++;
 await win.KintoOrderDataSessionV1.fetch('https://example.test/rest/v1/orders');assert(!calls.at(-1).headers.has('x-kinto-session'));count++;
 token='bad';assert.equal((await win.KintoOrderDataSessionV1.fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/orders')).status,403);count++;
 await db.query("SELECT set_config('request.headers','{}',false)");
 console.log(`PASS ${count} order privacy/cost checks: anon/authenticated denial, real hashed sessions, read-only GET, all role scopes, revoked/expired/disabled accounts, narrow updates, vendor projection and retained session saves`);
 return count;
}
