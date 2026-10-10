const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
const db=new PGlite();await db.exec(`create schema private;create role anon;create role authenticated;
create table orders(id uuid primary key,customer_id uuid,order_code text,reference_order_no text,created_at timestamptz,status text,details jsonb,delivery_payment_type text,branch_id uuid,shipping_company_name text);
create table customers(id uuid primary key,name text,phone text,secondary_phone text,country text,state text,address text,password_hash text,wallet_balance numeric);
create table branches(id uuid primary key,name text);
create table order_store_segments(id uuid primary key,order_id uuid,store_id uuid,payment_confirmed boolean,store_name_snapshot text,customer_snapshot jsonb,items_snapshot jsonb,updated_at timestamptz);
create function private.require_vendor_session(token text) returns uuid language plpgsql as $$begin if token='valid' then return '00000000-0000-0000-0000-000000000001'::uuid;end if;if token='foreign' then return '00000000-0000-0000-0000-000000000002'::uuid;end if;raise exception 'INVALID_SESSION';end$$;
create function private.v94_jsonb_object(v jsonb) returns jsonb language sql immutable as $$select case when jsonb_typeof(v)='object' then v else '{}'::jsonb end$$;
insert into customers values('10000000-0000-0000-0000-000000000001','عمر','07700000000','07800000000','العراق','بغداد','عنوان كامل','SECRET',5000);
insert into branches values('10000000-0000-0000-0000-000000000002','فرع بغداد');
insert into orders values('10000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','KN-000101','SIP-101',now(),'تم التسليم','{"parcels_count":2,"items":[{"product_name":"FOREIGN STORE"}]}','product_paid_delivery_cod','10000000-0000-0000-0000-000000000002','شركة توصيل');
insert into order_store_segments values('10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',true,'متجر الاختبار','{"address":"العنوان المثبت"}','[{"product_name":"أول","quantity":1},{"product_name":"ثان","quantity":2},{"product_name":"ثالث","quantity":3}]',now());`);
await db.exec(fs.readFileSync('supabase/migrations/20261010_v167_vendor_shipping_label.sql','utf8'));
const snapshot=async()=> (await db.query("select to_jsonb(s) value from order_store_segments s")).rows;
const before=await snapshot();const query=token=>db.query("select vendor_shipping_label_v167($1,'10000000-0000-0000-0000-000000000004') label",[token]);const label=(await query('valid')).rows[0].label;
assert.equal(label.customer.province,'بغداد');assert.equal(label.customer.address,'العنوان المثبت');assert.equal(label.customer.secondary_phone,'07800000000');assert.equal(label.order.parcels_count,2);assert.equal(label.order.delivery_payment_type,'product_paid_delivery_cod');assert.equal(label.branch_name,'فرع بغداد');assert.equal(label.order.items.reduce((n,i)=>n+i.quantity,0),6);assert.equal(label.store_name,'متجر الاختبار');assert.ok(!JSON.stringify(label).includes('SECRET'));assert.ok(!JSON.stringify(label).includes('wallet'));assert.ok(!JSON.stringify(label).includes('FOREIGN STORE'));assert.deepEqual(await snapshot(),before);
await assert.rejects(query('foreign'),/ORDER_SEGMENT_NOT_FOUND/);await assert.rejects(query('invalid'),/INVALID_SESSION/);await db.exec('update order_store_segments set payment_confirmed=false');await assert.rejects(query('valid'),/ORDER_SEGMENT_NOT_FOUND/);
for(const file of ['vendor-dashboard-v2.html','employee-dashboard.html','admin-dashboard.html','branch-dashboard.html']){for(const m of fs.readFileSync(file,'utf8').matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)){if(!/src=/.test(m[1]))new (Object.getPrototypeOf(async function(){}).constructor)(m[2]);}}
await db.close();console.log('V167: read-only scoped labels, snapshot priority, province, payment, parcels, products, session isolation, no private customer fields; four dashboards parse.');
})().catch(e=>{console.error(e);process.exit(1)});
