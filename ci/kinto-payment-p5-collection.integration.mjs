import fs from 'node:fs';
import assert from 'node:assert/strict';
const pgliteModule=process.env.KINTO_PGLITE_MODULE||'@electric-sql/pglite';
const native=Boolean(process.env.KINTO_TEST_DATABASE_URL);
let db;
if(native){
  const url=new URL(process.env.KINTO_TEST_DATABASE_URL);
  assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/kinto_test','ISOLATED_LOCAL_TEST_DATABASE_REQUIRED');
  const pg=await import(process.env.KINTO_PG_MODULE||'pg'),Client=pg.Client||pg.default.Client;
  const bootstrap=new Client({connectionString:url.href});await bootstrap.connect();await bootstrap.query('CREATE DATABASE kinto_payment_p5_collection_test');await bootstrap.end();
  url.pathname='/kinto_payment_p5_collection_test';const c=new Client({connectionString:url.href});await c.connect();
  db={exec:s=>c.query(s),query:(s,a)=>c.query(s,a),close:()=>c.end()};
}else{const {PGlite}=await import(pgliteModule);db=new PGlite()}
const customer='00000000-0000-0000-0000-000000000101';
const other='00000000-0000-0000-0000-000000000102';
const cartAttempt='00000000-0000-0000-0000-000000000201';
const campaignAttempt='00000000-0000-0000-0000-000000000202';
const oldAttempt='00000000-0000-0000-0000-000000000203';
const settledAttempt='00000000-0000-0000-0000-000000000204';
const failedAttempt='00000000-0000-0000-0000-000000000205';
const pendingAttempt='00000000-0000-0000-0000-000000000206';
const otherStoreAttempt='00000000-0000-0000-0000-000000000207';
const otherCustomerAttempt='00000000-0000-0000-0000-000000000208';
const manualPaidAttempt='00000000-0000-0000-0000-000000000209';
const currentPaidAttempt='00000000-0000-0000-0000-000000000210';
const mixedStoreAttempt='00000000-0000-0000-0000-000000000211';
const malformedDetailsAttempt='00000000-0000-0000-0000-000000000212';
const vendorStore='00000000-0000-0000-0000-000000000301';
const otherStore='00000000-0000-0000-0000-000000000302';
const vendorProduct='00000000-0000-0000-0000-000000000401';
const otherProduct='00000000-0000-0000-0000-000000000402';
await db.exec(`
  create schema private; create schema auth;
  do $$ begin
    if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
    if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  end $$;
  create table private.kinto_payment_finalize_permits_p5(
    transaction_id bigint not null,attempt_id uuid not null,customer_id text not null
  );
  create table private.kinto_payments_p5(
    attempt_id uuid primary key,kp_number text not null,customer_id text not null,
    payment_kind text not null,status text not null,amount numeric not null,currency text not null,
    order_ids uuid[] not null default '{}',created_at timestamptz not null default now()
  );
  create table private.kinto_payment_attempts_p4(
    id uuid primary key,customer_id text not null,status text not null
  );
  create table public.orders(
    id uuid primary key default gen_random_uuid(),customer_id text not null,
    order_code text not null,status text not null default 'تم التسديد',currency text not null,delivery_payment_type text not null default 'cod_full',
    details text not null default '{}',created_at timestamptz not null default now()
  );
  create table public.local_products(id uuid primary key,store_id uuid not null);
  insert into public.local_products values('${vendorProduct}','${vendorStore}'),('${otherProduct}','${otherStore}');
  create function private.v94_uuid(text) returns uuid language plpgsql immutable as $$ begin return nullif($1,'')::uuid;exception when others then return null;end $$;
  create function private.require_customer_review_session(text) returns uuid
    language sql security definer as $$ select case when $1='valid-customer-session' then '${customer}'::uuid else null end $$;
  grant execute on function private.require_customer_review_session(text) to public;
  create function private.require_vendor_session(text) returns uuid
    language plpgsql security definer as $$ begin
      if $1='valid-vendor-session' then return '${vendorStore}'::uuid; end if;
      if $1='other-vendor-session' then return '${otherStore}'::uuid; end if;
      raise exception 'VENDOR_SESSION_INVALID' using errcode='28000';
    end $$;
`);

await db.exec(fs.readFileSync('supabase/migrations/20261020123000_kinto_payment_p5_goods_paid_collection.sql','utf8'));

// Exact P5 finalizer context: only a pending cart payment for this customer and tx may stamp the order.
await db.exec(`begin;
  insert into private.kinto_payments_p5(attempt_id,kp_number,customer_id,payment_kind,status,amount,currency)
    values('${cartAttempt}','KP-CART','${customer}','cart','pending',217000,'IQD');
  insert into private.kinto_payment_finalize_permits_p5 values(txid_current(),'${cartAttempt}','${customer}');
  insert into public.orders(customer_id,order_code,currency,details)
    values('${customer}','KN-CART','IQD','{"source":"local_cart_bundle"}');
commit;`);
let row=(await db.query("select delivery_payment_type from public.orders where order_code='KN-CART'")).rows[0];
assert.equal(row.delivery_payment_type,'product_paid_delivery_cod');

// Direct campaigns, manual orders, other customers, and non-pending records remain untouched.
await db.exec(`begin;
  insert into private.kinto_payments_p5(attempt_id,kp_number,customer_id,payment_kind,status,amount,currency)
    values('${campaignAttempt}','KP-CAMPAIGN','${customer}','campaign','pending',100,'IQD');
  insert into private.kinto_payment_finalize_permits_p5 values(txid_current(),'${campaignAttempt}','${customer}');
  insert into public.orders(customer_id,order_code,currency) values('${customer}','KN-CAMPAIGN','IQD');
commit;
begin;
  insert into private.kinto_payments_p5(attempt_id,kp_number,customer_id,payment_kind,status,amount,currency)
    values('${settledAttempt}','KP-SETTLED','${customer}','cart','paid',100,'IQD');
  insert into private.kinto_payment_finalize_permits_p5 values(txid_current(),'${settledAttempt}','${customer}');
  insert into public.orders(customer_id,order_code,currency) values('${customer}','KN-SETTLED-REPLAY','IQD');
commit;
insert into public.orders(customer_id,order_code,currency,details) values
  ('${customer}','KN-LEGACY-ELECTRONIC','IQD','{"source":"local_cart_bundle","checkout_contract":"independent_vendor_orders","multi_store":false,"store_id":"${vendorStore}","items":[{"product_id":"${vendorProduct}","store_id":"${vendorStore}"}]}'),
  ('${customer}','KN-CURRENT-ELECTRONIC','IQD','{"source":"local_store","store_id":"${vendorStore}","items":[{"product_id":"${vendorProduct}","store_id":"${vendorStore}"}]}'),
  ('${customer}','KN-FORGED-GOODS-PAID','IQD','{"source":"local_store","store_id":"${vendorStore}","items":[{"product_id":"${vendorProduct}","store_id":"${vendorStore}"}]}'),
  ('${customer}','KN-MIXED-STORE-DATA','IQD','{"source":"local_store","store_id":"${vendorStore}","items":[{"product_id":"${vendorProduct}","store_id":"${vendorStore}"},{"product_id":"${otherProduct}","store_id":"${otherStore}"}]}'),
  ('${customer}','KN-MALFORMED-DETAILS','IQD','{'),
  ('${customer}','KN-MANUAL','IQD','{"source":"local_store","store_id":"${vendorStore}","items":[{"product_id":"${vendorProduct}","store_id":"${vendorStore}"}]}'),
  ('${customer}','KN-OTHER-STORE','IQD','{"source":"local_store","store_id":"${otherStore}","items":[{"product_id":"${otherProduct}","store_id":"${otherStore}"}]}'),
  ('${other}','KN-OTHER-CUSTOMER','IQD','{"source":"local_store","store_id":"${vendorStore}","items":[{"product_id":"${vendorProduct}","store_id":"${vendorStore}"}]}'),
  ('${customer}','KN-PENDING-KP','IQD','{"source":"local_store","store_id":"${vendorStore}","items":[{"product_id":"${vendorProduct}","store_id":"${vendorStore}"}]}'),
  ('${customer}','KN-FAILED-KP','IQD','{"source":"local_store","store_id":"${vendorStore}","items":[{"product_id":"${vendorProduct}","store_id":"${vendorStore}"}]}');
update public.orders set delivery_payment_type='product_paid_delivery_cod' where order_code in ('KN-CURRENT-ELECTRONIC','KN-FORGED-GOODS-PAID');
insert into private.kinto_payment_attempts_p4(id,customer_id,status) values
  ('${oldAttempt}','${customer}','succeeded'),
  ('${settledAttempt}','${customer}','succeeded'),
  ('${otherStoreAttempt}','${customer}','succeeded'),
  ('${otherCustomerAttempt}','${other}','succeeded'),
  ('${manualPaidAttempt}','${customer}','succeeded'),
  ('${currentPaidAttempt}','${customer}','succeeded'),
  ('${mixedStoreAttempt}','${customer}','succeeded'),
  ('${malformedDetailsAttempt}','${customer}','succeeded'),
  ('${failedAttempt}','${customer}','failed'),
  ('${pendingAttempt}','${customer}','pending');
insert into private.kinto_payments_p5(attempt_id,kp_number,customer_id,payment_kind,status,amount,currency,order_ids)
  values
  ('${oldAttempt}','KP-OLD','${customer}','cart','paid',217000,'IQD',array[(select id from public.orders where order_code='KN-LEGACY-ELECTRONIC')]),
  ('${currentPaidAttempt}','KP-CURRENT','${customer}','cart','paid',217000,'IQD',array[(select id from public.orders where order_code='KN-CURRENT-ELECTRONIC')]),
  ('${mixedStoreAttempt}','KP-MIXED-STORE','${customer}','cart','paid',217000,'IQD',array[(select id from public.orders where order_code='KN-MIXED-STORE-DATA')]),
  ('${malformedDetailsAttempt}','KP-MALFORMED-DETAILS','${customer}','cart','paid',217000,'IQD',array[(select id from public.orders where order_code='KN-MALFORMED-DETAILS')]),
  ('${manualPaidAttempt}','KP-MANUAL-WRONG-KIND','${customer}','campaign','paid',217000,'IQD',array[(select id from public.orders where order_code='KN-MANUAL')]),
  ('${otherStoreAttempt}','KP-OTHER-STORE','${customer}','cart','paid',217000,'IQD',array[(select id from public.orders where order_code='KN-OTHER-STORE')]),
  ('${otherCustomerAttempt}','KP-OTHER-CUSTOMER','${other}','cart','paid',217000,'IQD',array[(select id from public.orders where order_code='KN-OTHER-CUSTOMER')]),
  ('${pendingAttempt}','KP-PENDING','${customer}','cart','pending',217000,'IQD',array[(select id from public.orders where order_code='KN-PENDING-KP')]),
  ('${failedAttempt}','KP-FAILED','${customer}','cart','failed',217000,'IQD',array[(select id from public.orders where order_code='KN-FAILED-KP')]);
insert into private.kinto_payment_finalize_permits_p5 values(txid_current(),'${cartAttempt}','${customer}');
insert into public.orders(customer_id,order_code,currency) values('${other}','KN-OTHER','IQD');`);
const unaffected=(await db.query("select order_code,delivery_payment_type from public.orders where order_code in ('KN-CAMPAIGN','KN-MANUAL','KN-OTHER','KN-SETTLED-REPLAY') order by order_code")).rows;
assert.deepEqual(unaffected.map(x=>x.delivery_payment_type),['cod_full','cod_full','cod_full','cod_full']);

// The session-scoped history function returns a cart discriminator for a paid legacy row without writing it.
await db.exec(`create schema if not exists auth;`);
const list=(await db.query("select public.kinto_payments_p5_list_v1('valid-customer-session',1) as value")).rows[0].value;
const oldPayment=list.payments.find(x=>x.kp_number==='KP-OLD');
assert.equal(oldPayment.payment_kind,'cart');
assert.equal(oldPayment.orders[0].invoice.delivery_payment_type,'cod_full');
assert.equal(list.payments.some(x=>x.kp_number==='KP-OTHER-CUSTOMER'),false,'payment history remains scoped to the customer session');
row=(await db.query("select delivery_payment_type from public.orders where order_code='KN-MANUAL'")).rows[0];
assert.equal(row.delivery_payment_type,'cod_full','legacy invoice projection is read-only; order data is unchanged');

await db.exec(fs.readFileSync('supabase/migrations/20261020210000_kinto_vendor_paid_electronic_invoice_v1.sql','utf8'));
const legacyOrder=(await db.query("select id from public.orders where order_code='KN-LEGACY-ELECTRONIC'")).rows[0].id;
const currentOrder=(await db.query("select id from public.orders where order_code='KN-CURRENT-ELECTRONIC'")).rows[0].id;
const forgedGoodsPaidOrder=(await db.query("select id from public.orders where order_code='KN-FORGED-GOODS-PAID'")).rows[0].id;
const mixedStoreOrder=(await db.query("select id from public.orders where order_code='KN-MIXED-STORE-DATA'")).rows[0].id;
const malformedDetailsOrder=(await db.query("select id from public.orders where order_code='KN-MALFORMED-DETAILS'")).rows[0].id;
const otherStoreOrder=(await db.query("select id from public.orders where order_code='KN-OTHER-STORE'")).rows[0].id;
const manualOrder=(await db.query("select id from public.orders where order_code='KN-MANUAL'")).rows[0].id;
const scoped=(await db.query("select order_id from public.vendor_paid_electronic_invoice_orders_v1('valid-vendor-session',$1::uuid[])",[ [legacyOrder,currentOrder,forgedGoodsPaidOrder,mixedStoreOrder,malformedDetailsOrder,otherStoreOrder,manualOrder] ])).rows.map(x=>x.order_id).sort();
assert.deepEqual(scoped,[currentOrder,legacyOrder].sort(),'invalid TEXT JSON is safely ignored while only old and current paid orders are projected');
assert.equal((await db.query("select count(*)::int n from public.vendor_paid_electronic_invoice_orders_v1('other-vendor-session',$1::uuid[])",[[legacyOrder]])).rows[0].n,0,'different vendor cannot infer another store payment');
await assert.rejects(db.query("select * from public.vendor_paid_electronic_invoice_orders_v1('invalid-vendor-session',$1::uuid[])",[[legacyOrder]]),/VENDOR_SESSION_INVALID/);
const acl=(await db.query("select has_function_privilege('authenticated','public.vendor_paid_electronic_invoice_orders_v1(text,uuid[])','EXECUTE') as auth_exec,has_table_privilege('anon','private.kinto_payments_p5','SELECT') as anon_payment_read")).rows[0];
assert.equal(acl.auth_exec,true);assert.equal(acl.anon_payment_read,false,'vendors receive only the narrow RPC projection, not KP ledger access');
await assert.rejects(db.query("select * from public.vendor_paid_electronic_invoice_orders_v1('valid-vendor-session',array_fill('00000000-0000-0000-0000-000000000001'::uuid,array[501]))"),/VENDOR_INVOICE_ORDER_LIMIT_EXCEEDED/);
await db.exec('set role anon');
const anonScoped=(await db.query("select order_id from public.vendor_paid_electronic_invoice_orders_v1('valid-vendor-session',$1::uuid[])",[[legacyOrder]])).rows.map(x=>x.order_id);
assert.deepEqual(anonScoped,[legacyOrder],'public RPC requires and validates the vendor session even under anon PostgREST role');
await assert.rejects(db.query('select * from private.kinto_payments_p5'),/permission denied/);
await db.exec('reset role');
assert.equal((await db.query("select delivery_payment_type from public.orders where order_code='KN-LEGACY-ELECTRONIC'")).rows[0].delivery_payment_type,'cod_full','legacy association remains read-only');
console.log('PASS vendor invoice ACL: only exact paid cart KP + succeeded attempt, exact customer/order, and authenticated owning store are projected; manual, campaign, other-store/customer, pending, and failed rows stay hidden.');

console.log('PASS P5 collection SQL integration: cart finalizer stamps goods-paid, campaign/manual/other-customer remain unchanged, payment history identifies legacy cart invoices without writing orders.');
await db.close();
