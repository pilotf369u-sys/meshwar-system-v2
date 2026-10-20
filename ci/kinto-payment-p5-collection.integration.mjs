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
  create table public.orders(
    id uuid primary key default gen_random_uuid(),customer_id text not null,
    order_code text not null,currency text not null,delivery_payment_type text not null default 'cod_full',
    details jsonb not null default '{}',created_at timestamptz not null default now()
  );
  create function private.require_customer_review_session(text) returns uuid
    language sql security definer as $$ select case when $1='valid-customer-session' then '${customer}'::uuid else null end $$;
  grant select,insert,update on private.kinto_payment_finalize_permits_p5,private.kinto_payments_p5,public.orders to public;
  grant execute on function private.require_customer_review_session(text) to public;
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
insert into public.orders(customer_id,order_code,currency) values('${customer}','KN-MANUAL','IQD');
insert into private.kinto_payments_p5(attempt_id,kp_number,customer_id,payment_kind,status,amount,currency,order_ids)
  values('${oldAttempt}','KP-OLD','${customer}','cart','paid',217000,'IQD',array[(select id from public.orders where order_code='KN-MANUAL')]);
insert into private.kinto_payments_p5(attempt_id,kp_number,customer_id,payment_kind,status,amount,currency)
  values('00000000-0000-0000-0000-000000000205','KP-OTHER','${other}','cart','paid',999,'IQD');
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
assert.equal(list.payments.some(x=>x.kp_number==='KP-OTHER'),false,'payment history remains scoped to the customer session');
row=(await db.query("select delivery_payment_type from public.orders where order_code='KN-MANUAL'")).rows[0];
assert.equal(row.delivery_payment_type,'cod_full','legacy invoice projection is read-only; order data is unchanged');

console.log('PASS P5 collection SQL integration: cart finalizer stamps goods-paid, campaign/manual/other-customer remain unchanged, payment history identifies legacy cart invoices without writing orders.');
await db.close();
