\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create schema private;
create table orders(id uuid primary key,customer_id text,details json);
create table order_store_segments(order_id uuid,store_id uuid,payment_confirmed boolean);
create table order_customer_receipts_v60(order_id uuid primary key,customer_id text,confirmed_at timestamptz);
create function private.require_vendor_session(token text) returns uuid language plpgsql as $$begin
 if token='store-a' then return '00000000-0000-4000-8000-00000000000a'::uuid;
 elsif token='store-b' then return '00000000-0000-4000-8000-00000000000b'::uuid;
 else raise exception 'VENDOR_SESSION_INVALID' using errcode='42501';end if;
end$$;
create function private.v94_jsonb_object(v jsonb) returns jsonb language plpgsql as $$begin
 if jsonb_typeof(v)='string' then v:=(v#>>'{}')::jsonb;end if;
 return case when jsonb_typeof(v)='object' then v else '{}'::jsonb end;
exception when others then return '{}'::jsonb;end$$;
\i sql/vendor-customer-receipts-v1.sql
insert into orders select ('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'customer',case n
 when 1 then '{"source":"local_store","store_id":"00000000-0000-4000-8000-00000000000a"}'::json
 when 2 then '{"source":"local_store","store_id":"00000000-0000-4000-8000-00000000000b"}'::json
 when 3 then '{"source":"local_cart_bundle","items":[{"store_id":"00000000-0000-4000-8000-00000000000a"},{"store_id":"00000000-0000-4000-8000-00000000000b"}]}'::json
 when 6 then '{"source":"local_store","store_id":"00000000-0000-4000-8000-00000000000a"}'::json
 when 7 then '{"source":"local_store","store_id":"00000000-0000-4000-8000-00000000000a"}'::json
 when 8 then '{"source":"local_cart_bundle","checkout_contract":"independent_vendor_orders","items":[{"store_id":"00000000-0000-4000-8000-00000000000a"}]}'::json
 else '{}'::json end from generate_series(1,8) n;
insert into order_store_segments values
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-00000000000a',true),
('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-00000000000a',false);
insert into order_customer_receipts_v60 select id,case when right(id::text,1)='7' then 'wrong-customer' else customer_id end,now() from orders where right(id::text,1)<>'6';
create temp table before_data as select (select jsonb_agg(o) from orders o) orders,(select jsonb_agg(r) from order_customer_receipts_v60 r) receipts;
set role anon;
do $$declare ids uuid[];actual uuid[];begin
 select array_agg(('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid) into ids from generate_series(1,8) n;
 select array_agg(order_id order by order_id) into actual from vendor_customer_receipts_v1('store-a',ids);
 if actual is distinct from array[ids[1],ids[3],ids[4],ids[8]] then raise exception 'STORE_A_ISOLATION %',actual;end if;
 select array_agg(order_id order by order_id) into actual from vendor_customer_receipts_v1('store-b',ids);
 if actual is distinct from array[ids[2],ids[3]] then raise exception 'STORE_B_ISOLATION %',actual;end if;
 if exists(select 1 from vendor_customer_receipts_v1('store-a',null)) then raise exception 'NULL_IDS';end if;
 begin perform * from vendor_customer_receipts_v1('invalid',ids);raise exception 'AUTH_BYPASS';exception when insufficient_privilege then null;end;
 begin perform * from vendor_customer_receipts_v1('store-a',array_fill(ids[1],array[101]));raise exception 'LIMIT_BYPASS';exception when invalid_parameter_value then null;end;
end$$;
reset role;
do $$begin
 if (select orders from before_data) is distinct from (select jsonb_agg(o) from orders o) or (select receipts from before_data) is distinct from (select jsonb_agg(r) from order_customer_receipts_v60 r) then raise exception 'DATA_CHANGED';end if;
end$$;
