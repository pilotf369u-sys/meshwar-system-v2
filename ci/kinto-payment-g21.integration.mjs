// G21 SQL integration on an isolated PGlite database or a local native PostgreSQL test DB.
// It installs the actual G21 migration, the actual V161 adapter, V401 coupon RPC,
// G20 coupon guard, and V93 stock lifecycle. All rows/accounts are synthetic.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
let db;
let native=false;
let connectSibling;
if(process.env.KINTO_TEST_DATABASE_URL){
  const u=new URL(process.env.KINTO_TEST_DATABASE_URL);
  assert(['localhost','127.0.0.1'].includes(u.hostname)&&u.pathname==='/kinto_test','ISOLATED_LOCAL_TEST_DATABASE_REQUIRED');
  const pg=await import(process.env.KINTO_PG_MODULE||'pg');
  const Client=pg.Client||pg.default.Client;
  const bootstrap=new Client({connectionString:u.href}); await bootstrap.connect();
  await bootstrap.query('CREATE DATABASE kinto_payment_g21_test'); await bootstrap.end();
  u.pathname='/kinto_payment_g21_test'; const c=new Client({connectionString:u.href}); await c.connect();
  connectSibling=app=>new Client({connectionString:u.href,application_name:app});
  db={exec:s=>c.query(s),query:(s,a)=>c.query(s,a),close:()=>c.end()}; native=true;
}else{
  const {PGlite}=await import(process.env.KINTO_PGLITE_MODULE||'@electric-sql/pglite');
  db=new PGlite();
}
const read=p=>fs.readFileSync(p,'utf8');
const migration='supabase/migrations/20261018220000_kinto_payment_confirmation_g21.sql';
const rollback='supabase/rollback/20261018220000_kinto_payment_confirmation_g21_ROLLBACK.sql';
const v401=read('supabase/migrations/20260930_v401_campaign_cross_store_redemption.sql');
const v401Function=v401.slice(0,v401.indexOf('-- V401 customer read model'));
const g20c=read('supabase/migrations/20261018213000_kinto_stock_reservations_g20c.sql');
const couponGuard=g20c.slice(g20c.indexOf('create or replace function private.kinto_coupon_reservation_guard_g20()'),g20c.indexOf('create or replace function public.kinto_stock_reserve_g20('));
await db.exec(read('tests/sql/kinto-payment-g21-fixture.sql'));

// The real V161 SECURITY DEFINER adapter is installed. Its V101 delegate is a
// deterministic synthetic stand-in that inserts the same canonical per-store
// order contract without relying on the historical checkout's unrelated schema.
await db.exec(`create or replace function public.checkout_independent_vendor_orders_v101(
  p_customer_id uuid,p_customer_name text,p_customer_phone text,p_customer_shipping jsonb,p_items jsonb
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $v101_test$
declare v_group uuid:=gen_random_uuid(); v_store record; v_item jsonb; v_items jsonb; v_id uuid; v_currency text; v_total numeric; v_result jsonb:='[]'::jsonb; v_count integer:=0;
begin
  if jsonb_typeof(p_customer_shipping)<>'object' or jsonb_typeof(p_items)<>'array' then raise exception 'V101_INPUT_INVALID'; end if;
  insert into public.test_v101_calls(customer_id,customer_name,customer_phone,shipping,items)
    values(p_customer_id,p_customer_name,p_customer_phone,p_customer_shipping,p_items);
  for v_store in select distinct (x->>'store_id')::uuid sid from jsonb_array_elements(p_items) x order by sid loop
    v_count:=v_count+1;
    if current_setting('test.v101_fail_after_store',true)='1' and v_count=2 then raise exception 'INJECTED_V101_SECOND_STORE_FAILURE'; end if;
    select s.exchange_target_currency,sum(ceil(ceil(coalesce(p.discount_price,p.base_price)/(1-coalesce(s.commission_rate,10)/100))*s.exchange_rate/1000)*1000*(x->>'quantity')::integer)
      into v_currency,v_total
      from jsonb_array_elements(p_items) x join local_products p on p.id=(x->>'product_id')::uuid and p.store_id=(x->>'store_id')::uuid
      join local_stores s on s.id=p.store_id where s.id=v_store.sid group by s.exchange_target_currency;
    select jsonb_agg(jsonb_build_object('product_id',x->>'product_id','store_id',x->>'store_id','quantity',(x->>'quantity')::integer,
      'selected_options',coalesce(x->'selected_options','{}'::jsonb),'unit_price_local',ceil(ceil(coalesce(p.discount_price,p.base_price)/(1-coalesce(s.commission_rate,10)/100))*s.exchange_rate/1000)*1000,
      'line_total_local',ceil(ceil(coalesce(p.discount_price,p.base_price)/(1-coalesce(s.commission_rate,10)/100))*s.exchange_rate/1000)*1000*(x->>'quantity')::integer,
      'currency',coalesce(nullif(s.exchange_target_currency,''),s.default_currency,'IQD')) order by ord)
      into v_items from jsonb_array_elements(p_items) with ordinality q(x,ord) join local_products p on p.id=(x->>'product_id')::uuid join local_stores s on s.id=p.store_id where s.id=v_store.sid;
    v_id:=gen_random_uuid();
    insert into orders(id,customer_id,customer_name,customer_phone,status,total_price,currency,details)
    values(v_id,p_customer_id,p_customer_name,p_customer_phone,'بانتظار الدفع',v_total,v_currency,
      jsonb_build_object('source','local_cart_bundle','checkout_contract','independent_vendor_orders','checkout_group_id',v_group,
        'store_id',v_store.sid,'items',v_items,'quantity',(select sum((z->>'quantity')::integer) from jsonb_array_elements(v_items) z),
        'customer_total_local',v_total)::text);
    v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_id,'store_id',v_store.sid,'currency',v_currency,'total_price',v_total));
  end loop;
  return jsonb_build_object('checkout_group_id',v_group,'orders',v_result);
end $v101_test$;`);
await db.exec(read('supabase/migrations/20261009_v161_new_orders_vendor_finance.sql'));
await db.exec(v401Function);
await db.exec(couponGuard);
const variantLifecycle=read('supabase/migrations/20260821_local_store_variant_stock_lifecycle.sql');
const variantStart=variantLifecycle.indexOf('create or replace function public.meshwar_adjust_variant_stock(');
const variantEnd=variantLifecycle.indexOf('\n$$;',variantStart)+4;
await db.exec(variantLifecycle.slice(variantStart,variantEnd));
await db.exec(read('supabase/migrations/20260821_local_store_matrix_combination_stock.sql').split('create or replace function public.meshwar_local_stock_status_lifecycle()')[0]);
await db.exec(read('supabase/migrations/20260902_local_cart_bundle_variant_stock_fix_v93.sql'));
await db.exec(read(migration));
await db.exec(read(migration));
const couponPatchCount=(await db.query("select regexp_count(pg_get_functiondef('public.customer_apply_coupon_v310(text,text,bigint)'::regprocedure),'kinto_coupon_reservations_g20') n")).rows[0].n;
assert.equal(couponPatchCount,1,'reapplying G21 must not duplicate the V401 live-hold predicate');

const customer='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const storeA='cccccccc-cccc-cccc-cccc-ccccccccccc1';
const storeB='cccccccc-cccc-cccc-cccc-ccccccccccc2';
const productA='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1';
const productB='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2';
const nowFuture="now()+interval '1 day'";
const key=(store,product,options={color:'أحمر',size:'M'})=>({store_id:store,product_id:product,quantity:1,selected_options:options});
const pricing={pricing_version:'iqd_ceil_1000_v1',vendor_price_usd:10000,commission_rate:0,exchange_rate:1};
const line=(store,product,options={color:'أحمر',size:'M'})=>({...key(store,product,options),unit_price_minor:10000,currency:'IQD',pricing_snapshot:pricing});
let checks=0;
async function test(name,fn){
  await db.exec(`delete from kinto_payment_order_links_g21; delete from orders; delete from test_v101_calls; delete from kinto_loyalty_ledger;
    delete from kinto_coupon_reservations_g20; delete from kinto_stock_reservation_lines_g20;
    delete from kinto_stock_reservations_g20; delete from kinto_payment_financial_events_g18;
    delete from kinto_payment_gateway_events_g18; delete from kinto_payment_intents_g18; delete from kinto_payment_quotes_g20;
    delete from kinto_loyalty_coupons; delete from local_products; delete from local_stores; delete from customers;
    delete from private.kinto_paid_transition_permits_v1; delete from private.kinto_payment_stock_permits_g21;`);
  await db.exec("select set_config('test.v101_fail_after_store','',false)");
  await db.query('insert into customers(id,name,phone) values($1,$2,$3)',[customer,'Synthetic Customer','07700000000']);
  await fn(); console.log('PASS '+name); checks++;
}
async function seedProduct(id,store,{stock=1,variant=1,matrix=1}={}){
  await db.query(`insert into local_stores(id,store_name,status,commission_rate,exchange_rate,exchange_target_currency,default_currency)
    values($1,'synthetic','active',0,1,'IQD','IQD') on conflict(id) do nothing`,[store]);
  await db.query(`insert into local_products(id,store_id,product_name,base_price,stock_quantity,options)
    values($1,$2,'fixture',10000,$3,$4)`,[id,store,stock,{variant_stock:{color:{'أحمر':variant}},matrix_stock:{'أحمر_M':matrix}}]);
}
async function quoteAndReservation({lines,storeSubtotals,couponIds={},couponSelection={},customerId=customer,expires='1 day'}){
  const stores=storeSubtotals.map(([sid,amount])=>({store_id:sid,currency:'IQD',subtotal_minor:amount}));
  const quoteId=(await db.query(`insert into kinto_payment_quotes_g20(customer_id,currency,amount,quote_snapshot,status,expires_at)
    values($1,'IQD',$2,$3,'reserved',${nowFuture}) returning id`,[customerId,storeSubtotals.reduce((s,x)=>s+x[1],0)-Object.values(couponSelection).reduce((a,b)=>a+b,0),{
      electronic_eligible:true,lines,stores,coupon_ids:couponIds,coupon_selection:couponSelection
    }])).rows[0].id;
  const reservationId=(await db.query(`insert into kinto_stock_reservations_g20(quote_id,customer_id,idempotency_key,status,expires_at)
    values($1,$2,$3,'active',${nowFuture}) returning id`,[quoteId,customerId,'reservation-'+quoteId])).rows[0].id;
  for(const l of lines){await db.query('insert into kinto_stock_reservation_lines_g20(reservation_id,product_id,selected_options,matrix_key,quantity) values($1,$2,$3,$4,$5)',[reservationId,l.product_id,l.selected_options,'أحمر_M',l.quantity]);}
  for(const ids of Object.values(couponIds)) for(const id of ids){await db.query(`insert into kinto_coupon_reservations_g20(reservation_id,coupon_id,status,expires_at) values($1,$2,'active',${nowFuture})`,[reservationId,id]);}
  return {quoteId,reservationId};
}
async function intentAndEvent({quoteId,amount,provider='test-gateway',customerId=customer}){
  const id=(await db.query(`insert into kinto_payment_intents_g18(customer_id,quote_id,provider_key,provider_environment,provider_adapter_version,
    amount_minor,currency,status,idempotency_key,reservation_expires_at) values($1,$2,$3,'sandbox','fixture-v1',$4,'IQD','captured',$5,${nowFuture}) returning id`,
    [customerId,quoteId,provider,amount,'intent-key-'+quoteId])).rows[0].id;
  await db.exec("select set_config('request.jwt.claim.role','service_role',false)");
  const recorded=await db.query(`select kinto_payment_record_verified_event_g21($1,$2,$3,'captured',$4,true,'provider-ref-'||$3,$5,'IQD') result`,
    [id,provider,'event-'+quoteId,'a'.repeat(64),amount]);
  return {intentId:id,eventId:recorded.rows[0].result.event_id};
}
async function finalize(q,amount){const payment=await intentAndEvent({quoteId:q.quoteId,amount});return {payment,result:(await db.query('select kinto_payment_finalize_g21($1) result',[payment.eventId])).rows[0].result};}

await test('real V161 signature and V401 customer session contract are installed',async()=>{
  assert.equal((await db.query("select to_regprocedure('public.checkout_independent_vendor_orders_v161(uuid,text,text,jsonb,jsonb)') as fn")).rows[0].fn,'checkout_independent_vendor_orders_v161(uuid,text,text,jsonb,jsonb)');
  const args=(await db.query("select pg_get_function_arguments('public.checkout_independent_vendor_orders_v161(uuid,text,text,jsonb,jsonb)'::regprocedure) args")).rows[0].args;
  assert.match(args,/p_customer_id uuid.*p_customer_name text.*p_customer_phone text.*p_customer_shipping jsonb.*p_items jsonb/);
  await assert.rejects(()=>db.query(`select customer_apply_coupon_v310('bad','missing',1000)`),/CUSTOMER_SESSION_INVALID/);
  assert.equal((await db.query("select has_function_privilege('anon','public.kinto_payment_finalize_g21(bigint)','EXECUTE') ok")).rows[0].ok,false);
});

await test('manual paid transition is blocked by a live last-piece hold, then V47 deducts once',async()=>{
  await seedProduct(productA,storeA,{stock:1,variant:1,matrix:1});
  const q=await quoteAndReservation({lines:[line(storeA,productA)],storeSubtotals:[[storeA,10000]]});
  const orderId='dddddddd-dddd-dddd-dddd-ddddddddddd1';
  await db.query(`insert into orders(id,customer_id,status,total_price,currency,details) values($1,$2,'بانتظار الدفع',10000,'IQD',$3)`,
    [orderId,customer,JSON.stringify({source:'local_cart_bundle',store_id:storeA,items:[{...key(storeA,productA)}]})]);
  await db.exec('begin');
  await db.query('insert into private.kinto_paid_transition_permits_v1(transaction_id,order_id) values(txid_current(),$1)',[orderId]);
  await assert.rejects(()=>db.exec("update orders set status='تم التسديد' where id='dddddddd-dddd-dddd-dddd-ddddddddddd1'"),/PAYMENT_STOCK_HELD_FOR_ELECTRONIC_CHECKOUT/);
  await db.exec('rollback');
  await db.query("update kinto_stock_reservations_g20 set status='expired',expires_at=now()-interval '1 second' where id=$1",[q.reservationId]);
  await db.exec('begin');
  await db.query('insert into private.kinto_paid_transition_permits_v1(transaction_id,order_id) values(txid_current(),$1)',[orderId]);
  await db.exec("update orders set status='تم التسديد' where id='dddddddd-dddd-dddd-dddd-ddddddddddd1'");
  await db.exec('commit');
  let p=(await db.query('select stock_quantity,options from local_products where id=$1',[productA])).rows[0];
  assert.equal(p.stock_quantity,0);assert.equal(p.options.variant_stock.color['أحمر'],0);assert.equal(p.options.matrix_stock['أحمر_M'],0);
  await db.exec("update orders set status='تم التسديد' where id='dddddddd-dddd-dddd-dddd-ddddddddddd1'");
  p=(await db.query('select stock_quantity,options from local_products where id=$1',[productA])).rows[0];
  assert.equal(p.stock_quantity,0);assert.equal(p.options.variant_stock.color['أحمر'],0);assert.equal(p.options.matrix_stock['أحمر_M'],0);
});

if(native) await test('native PostgreSQL row-lock race serializes manual last-piece approval against electronic capture',async()=>{
  await seedProduct(productA,storeA,{stock:1,variant:1,matrix:1});
  const q=await quoteAndReservation({lines:[line(storeA,productA)],storeSubtotals:[[storeA,10000]]});
  const payment=await intentAndEvent({quoteId:q.quoteId,amount:10000});
  const manualOrder='dddddddd-dddd-dddd-dddd-ddddddddddd4';
  await db.query(`insert into orders(id,customer_id,status,total_price,currency,details) values($1,$2,'بانتظار الدفع',10000,'IQD',$3)`,
    [manualOrder,customer,JSON.stringify({source:'local_cart_bundle',store_id:storeA,items:[{...key(storeA,productA)}]})]);
  const manual=connectSibling('g21-manual-last-piece');const electronic=connectSibling('g21-electronic-last-piece');
  await manual.connect();await electronic.connect();
  try{
    await electronic.query("select set_config('request.jwt.claim.role','service_role',false)");
    await manual.query('begin');await manual.query('select id from local_products where id=$1 for update',[productA]);
    const pending=electronic.query('select kinto_payment_finalize_g21($1) result',[payment.eventId]);
    let waiting=false;
    for(let i=0;i<40;i++){
      const r=await manual.query(`select exists(select 1 from pg_stat_activity where application_name='g21-electronic-last-piece' and wait_event_type='Lock') waiting`);
      if(r.rows[0].waiting){waiting=true;break;} await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert(waiting,'electronic finalizer should wait for the shared product row lock');
    await manual.query('insert into private.kinto_paid_transition_permits_v1(transaction_id,order_id) values(txid_current(),$1)',[manualOrder]);
    await assert.rejects(()=>manual.query("update orders set status='تم التسديد' where id=$1",[manualOrder]),/PAYMENT_STOCK_HELD_FOR_ELECTRONIC_CHECKOUT/);
    await manual.query('rollback');
    const done=(await pending).rows[0].result;assert.equal(done.status,'processed');
    assert.equal((await db.query('select status from orders where id=$1',[manualOrder])).rows[0].status,'بانتظار الدفع');
    assert.equal((await db.query("select count(*)::int n from orders where status='تم التسديد'")).rows[0].n,1);
    const p=(await db.query('select stock_quantity,options from local_products where id=$1',[productA])).rows[0];
    assert.equal(p.stock_quantity,0);assert.equal(p.options.variant_stock.color['أحمر'],0);assert.equal(p.options.matrix_stock['أحمر_M'],0);
  }finally{await manual.end();await electronic.end();}
});

await test('electronic capture excludes its own hold and invokes V161/V93 exactly once',async()=>{
  await seedProduct(productA,storeA,{stock:1,variant:1,matrix:1});
  const q=await quoteAndReservation({lines:[line(storeA,productA)],storeSubtotals:[[storeA,10000]]});
  const {result}=await finalize(q,10000);
  assert.equal(result.ok,true);assert.equal(result.status,'processed');assert.equal(result.orders.length,1);
  const row=(await db.query('select status,details from orders where id=$1',[result.orders[0].order_id])).rows[0];
  assert.equal(row.status,'تم التسديد');assert.equal(JSON.parse(row.details).vendor_finance_version,'v161');
  const p=(await db.query('select stock_quantity,options from local_products where id=$1',[productA])).rows[0];
  assert.equal(p.stock_quantity,0);assert.equal(p.options.variant_stock.color['أحمر'],0);assert.equal(p.options.matrix_stock['أحمر_M'],0);
  assert.equal((await db.query('select status from kinto_stock_reservations_g20 where id=$1',[q.reservationId])).rows[0].status,'consumed');
  assert.equal((await db.query('select count(*)::int n from kinto_payment_order_links_g21')).rows[0].n,1);
  const v101=(await db.query('select customer_id,customer_name,customer_phone,shipping,items from test_v101_calls')).rows[0];
  assert.equal(v101.customer_id,customer);assert.equal(v101.customer_name,'Synthetic Customer');assert.equal(v101.customer_phone,'07700000000');
  assert.deepEqual(v101.shipping,{});assert.equal(v101.items[0].product_id,productA);assert.equal(v101.items[0].store_id,storeA);
  assert.equal(v101.items[0].quantity,1);assert.deepEqual(v101.items[0].selected_options,{color:'أحمر',size:'M'});
});

await test('V161 second-store creation failure rolls back the first store order and keeps capture evidence',async()=>{
  await seedProduct(productA,storeA,{stock:3,variant:3,matrix:3});
  await seedProduct(productB,storeB,{stock:3,variant:3,matrix:3});
  const q=await quoteAndReservation({lines:[line(storeA,productA),line(storeB,productB)],storeSubtotals:[[storeA,10000],[storeB,10000]]});
  await db.exec("select set_config('test.v101_fail_after_store','1',false)");
  const {payment,result}=await finalize(q,20000);
  assert.equal(result.status,'reconciliation_required');assert.equal(result.orders_created,false);
  assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from kinto_payment_gateway_events_g18 where id=$1',[payment.eventId])).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from kinto_payment_financial_events_g18 where intent_id=$1 and event_kind=\'reconciliation\'',[payment.intentId])).rows[0].n,1);
  for(const id of [productA,productB]){const p=(await db.query('select stock_quantity,options from local_products where id=$1',[id])).rows[0];assert.equal(p.stock_quantity,3);assert.equal(p.options.matrix_stock['أحمر_M'],3);}
});

await test('V401 skips a live electronic coupon hold but still consumes a separate eligible coupon',async()=>{
  await seedProduct(productA,storeA,{stock:4,variant:4,matrix:4});
  const manualOrder='dddddddd-dddd-dddd-dddd-ddddddddddd2';
  await db.query(`insert into orders(id,customer_id,status,total_price,currency,details) values($1,$2,'بانتظار الدفع',20000,'IQD',$3)`,
    [manualOrder,customer,JSON.stringify({store_id:storeA})]);
  const held=(await db.query(`insert into kinto_loyalty_coupons(customer_id,store_id,currency,points,status,expires_at)
    values($1,$2,'IQD',1000,'active',${nowFuture}) returning id`,[customer,storeA])).rows[0].id;
  const free=(await db.query(`insert into kinto_loyalty_coupons(customer_id,store_id,currency,points,status,expires_at)
    values($1,$2,'IQD',1000,'active',${nowFuture}) returning id`,[customer,storeA])).rows[0].id;
  const q=await quoteAndReservation({lines:[line(storeA,productA)],storeSubtotals:[[storeA,10000]]});
  await db.query(`insert into kinto_coupon_reservations_g20(reservation_id,coupon_id,status,expires_at)
    values($1,$2,'active',${nowFuture})`,[q.reservationId,held]);
  const applied=(await db.query('select customer_apply_coupon_v310($1,$2,1000) result',['customer-token',manualOrder])).rows[0].result;
  assert.equal(applied.ok,true);
  assert.equal((await db.query('select status from kinto_loyalty_coupons where id=$1',[held])).rows[0].status,'active');
  assert.equal((await db.query('select status,used_order_id from kinto_loyalty_coupons where id=$1',[free])).rows[0].status,'used');
  assert.equal((await db.query('select count(*)::int n from kinto_loyalty_ledger where order_id=$1',[manualOrder])).rows[0].n,1);
});

await test('expired coupon reservation is released before a new hold and expired holds do not block manual redemption',async()=>{
  await seedProduct(productA,storeA,{stock:2,variant:2,matrix:2});
  const coupon=(await db.query(`insert into kinto_loyalty_coupons(customer_id,store_id,currency,points,status,expires_at)
    values($1,$2,'IQD',1000,'active',${nowFuture}) returning id`,[customer,storeA])).rows[0].id;
  const manualCoupon=(await db.query(`insert into kinto_loyalty_coupons(customer_id,store_id,currency,points,status,expires_at)
    values($1,$2,'IQD',1000,'active',${nowFuture}) returning id`,[customer,storeA])).rows[0].id;
  const qa=await quoteAndReservation({lines:[line(storeA,productA)],storeSubtotals:[[storeA,10000]]});
  await db.query("insert into kinto_coupon_reservations_g20(reservation_id,coupon_id,status,expires_at) values($1,$2,'active',now()-interval '1 second')",[qa.reservationId,coupon]);
  await db.query("insert into kinto_coupon_reservations_g20(reservation_id,coupon_id,status,expires_at) values($1,$2,'active',now()-interval '1 second')",[qa.reservationId,manualCoupon]);
  const qb=await quoteAndReservation({lines:[line(storeA,productA)],storeSubtotals:[[storeA,10000]]});
  await db.query("insert into kinto_coupon_reservations_g20(reservation_id,coupon_id,status,expires_at) values($1,$2,'active',now()+interval '1 hour')",[qb.reservationId,coupon]);
  assert.equal((await db.query('select status from kinto_coupon_reservations_g20 where reservation_id=$1 and coupon_id=$2',[qa.reservationId,coupon])).rows[0].status,'expired');
  const orderId='dddddddd-dddd-dddd-dddd-ddddddddddd3';
  await db.query(`insert into orders(id,customer_id,status,total_price,currency,details) values($1,$2,'بانتظار الدفع',20000,'IQD',$3)`,[orderId,customer,JSON.stringify({store_id:storeA})]);
  const result=(await db.query('select customer_apply_coupon_v310($1,$2,1000) result',['customer-token',orderId])).rows[0].result;
  assert.equal(result.ok,true);assert.equal((await db.query('select status from kinto_loyalty_coupons where id=$1',[manualCoupon])).rows[0].status,'used');
});

await test('late capture keeps the verified event and routes an expired reservation to reconciliation',async()=>{
  await seedProduct(productA,storeA,{stock:2,variant:2,matrix:2});
  const q=await quoteAndReservation({lines:[line(storeA,productA)],storeSubtotals:[[storeA,10000]]});
  await db.query("update kinto_stock_reservations_g20 set expires_at=now()-interval '1 second' where id=$1",[q.reservationId]);
  const {payment,result}=await finalize(q,10000);
  assert.equal(result.status,'reconciliation_required');assert.equal(result.orders_created,false);
  assert.equal((await db.query('select processing_status from kinto_payment_gateway_events_g18 where id=$1',[payment.eventId])).rows[0].processing_status,'reconciliation_required');
  assert.equal((await db.query("select count(*)::int n from kinto_payment_financial_events_g18 where event_kind='reconciliation'")).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,0);
});

await test('second-store canonical failure rolls back all orders, V47 stock and coupon use but preserves payment for reconciliation',async()=>{
  await seedProduct(productA,storeA,{stock:2,variant:2,matrix:2});
  await seedProduct(productB,storeB,{stock:2,variant:2,matrix:2});
  const coupon=(await db.query(`insert into kinto_loyalty_coupons(customer_id,store_id,currency,points,status,expires_at)
    values($1,$2,'IQD',1000,'active',${nowFuture}) returning id`,[customer,storeA])).rows[0].id;
  const lines=[line(storeA,productA),line(storeB,productB)];
  const q=await quoteAndReservation({lines,storeSubtotals:[[storeA,10000],[storeB,10000]],couponIds:{[storeA]:[coupon]},couponSelection:{[storeA]:1000}});
  await db.query("update local_products set options=jsonb_set(options,'{matrix_stock,\"أحمر_M\"}','0'::jsonb) where id=$1",[productB]);
  await db.exec("select set_config('test.v101_fail_after_store','',false)");
  const {payment,result}=await finalize(q,19000);
  assert.equal(result.ok,false);assert.equal(result.status,'reconciliation_required');assert.equal(result.orders_created,false);
  assert.equal((await db.query('select count(*)::int n from orders')).rows[0].n,0);
  assert.equal((await db.query('select status from kinto_loyalty_coupons where id=$1',[coupon])).rows[0].status,'active');
  assert.equal((await db.query("select count(*)::int n from kinto_loyalty_ledger where event_type='redeem'")).rows[0].n,0);
  for(const id of [productA,productB]){const p=(await db.query('select stock_quantity,options from local_products where id=$1',[id])).rows[0];assert.equal(p.stock_quantity,2);assert.equal(p.options.variant_stock.color['أحمر'],2);}
  assert.equal((await db.query('select processing_status from kinto_payment_gateway_events_g18 where id=$1',[payment.eventId])).rows[0].processing_status,'reconciliation_required');
  assert.equal((await db.query('select status from kinto_payment_intents_g18 where id=$1',[payment.intentId])).rows[0].status,'reconciliation_required');
  assert.equal((await db.query("select count(*)::int n from kinto_payment_financial_events_g18 where event_kind='reconciliation'")).rows[0].n,1);
});

await test('duplicate event replay does not create another order or deduct inventory twice',async()=>{
  await seedProduct(productA,storeA,{stock:1,variant:1,matrix:1});
  const q=await quoteAndReservation({lines:[line(storeA,productA)],storeSubtotals:[[storeA,10000]]});
  const {payment,result}=await finalize(q,10000);assert.equal(result.ok,true);
  const duplicate=(await db.query('select kinto_payment_finalize_g21($1) result',[payment.eventId])).rows[0].result;
  assert.equal(duplicate.duplicate,true);
  assert.equal((await db.query('select count(*)::int n from kinto_payment_order_links_g21 where intent_id=$1',[payment.intentId])).rows[0].n,1);
  const p=(await db.query('select stock_quantity,options from local_products where id=$1',[productA])).rows[0];
  assert.equal(p.stock_quantity,0);assert.equal(p.options.variant_stock.color['أحمر'],0);assert.equal(p.options.matrix_stock['أحمر_M'],0);
});

await test('G21 rollback restores actual V401 selector and retains payment audit rows',async()=>{
  const before=(await db.query("select position('kinto_coupon_reservations_g20' in pg_get_functiondef('public.customer_apply_coupon_v310(text,text,bigint)'::regprocedure)) n")).rows[0].n;
  assert(before>0);
  const quoteId=(await db.query(`insert into kinto_payment_quotes_g20(customer_id,currency,amount,quote_snapshot,expires_at)
    values($1,'IQD',1000,'{}'::jsonb,${nowFuture}) returning id`,[customer])).rows[0].id;
  const intentId=(await db.query(`insert into kinto_payment_intents_g18(customer_id,quote_id,provider_key,provider_environment,
    provider_adapter_version,amount_minor,currency,idempotency_key) values($1,$2,'fixture-gateway','sandbox','v1',1000,'IQD','rollback-audit-key') returning id`,[customer,quoteId])).rows[0].id;
  await db.query(`insert into kinto_payment_gateway_events_g18(provider_key,provider_event_id,intent_id,event_type,event_fingerprint,amount_minor,currency)
    values('fixture-gateway','rollback-audit-event',$1,'captured',$2,1000,'IQD')`,[intentId,'b'.repeat(64)]);
  await db.exec(read(rollback));
  const after=(await db.query("select position('kinto_coupon_reservations_g20' in pg_get_functiondef('public.customer_apply_coupon_v310(text,text,bigint)'::regprocedure)) n")).rows[0].n;
  assert.equal(after,0);
  assert.equal((await db.query("select to_regprocedure('public.kinto_payment_finalize_g21(bigint)') fn")).rows[0].fn,null);
  assert.equal((await db.query("select to_regclass('public.kinto_payment_order_links_g21') r")).rows[0].r,'kinto_payment_order_links_g21');
  assert.equal((await db.query('select count(*)::int n from kinto_payment_intents_g18')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from kinto_payment_gateway_events_g18')).rows[0].n,1);
});

console.log(`${checks} isolated ${native?'PostgreSQL':'PGlite PostgreSQL'} integration scenarios passed`);
await db.close();
