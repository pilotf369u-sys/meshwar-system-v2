\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create schema private;
create table orders(id uuid primary key,customer_id text,courier_id text,delivery_agent_id text,branch_id text);
create table couriers(id text primary key,courier_uuid uuid);
create table order_customer_receipts_v60(order_id uuid primary key,customer_id text,confirmed_at timestamptz);
insert into couriers values ('courier-a','00000000-0000-4000-8000-00000000000a'),('courier-b','00000000-0000-4000-8000-00000000000b');
create function private.kinto_staff_actor_v1(role text,token text) returns jsonb language plpgsql as $$begin
 if role!='courier' or token is null or token not in ('courier-a','courier-b') then raise exception 'COURIER_SESSION_INVALID' using errcode='42501';end if;
 return jsonb_build_object('role',role,'id',token,'branch_id','branch-a');
end$$;
create function private.kinto_order_visible_v1(o jsonb,a jsonb) returns boolean language sql as $$
 select coalesce(a->>'id' is not null and a->>'role'='courier'
 and (o->>'courier_id'=a->>'id' or o->>'delivery_agent_id'=a->>'courier_uuid')
 and (coalesce(o->>'branch_id','')='' or o->>'branch_id'=a->>'branch_id'),false)
$$;
\i sql/courier-customer-receipts-v1.sql
insert into orders select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'customer',
case when n in(3,8) then 'courier-b' when n=2 then null else 'courier-a' end,
case when n=2 then '00000000-0000-4000-8000-00000000000a' else null end,
case when n in(4,8) then 'branch-b' when n=5 then null else 'branch-a' end from generate_series(1,8)n;
insert into order_customer_receipts_v60 select id,case when right(id::text,1)='7' then 'wrong-customer' else customer_id end,now() from orders where right(id::text,1)<>'6';
create temp table before_data as select (select jsonb_agg(o) from orders o) orders,(select jsonb_agg(r) from order_customer_receipts_v60 r) receipts;
set role anon;
do $$declare ids uuid[];actual uuid[];begin
 select array_agg(('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid) into ids from generate_series(1,8)n;
 select array_agg(order_id order by order_id) into actual from courier_customer_receipts_v1('courier-a',ids);
 if actual is distinct from array[ids[1],ids[2],ids[5]] then raise exception 'COURIER_A_ISOLATION %',actual;end if;
 select array_agg(order_id order by order_id) into actual from courier_customer_receipts_v1('courier-b',ids);
 if actual is distinct from array[ids[3]] then raise exception 'COURIER_B_ISOLATION %',actual;end if;
 if exists(select 1 from courier_customer_receipts_v1('courier-a',null)) then raise exception 'NULL_IDS';end if;
 begin perform * from courier_customer_receipts_v1('invalid',ids);raise exception 'AUTH_BYPASS';exception when insufficient_privilege then null;end;
 begin perform * from courier_customer_receipts_v1('courier-a',array_fill(ids[1],array[101]));raise exception 'LIMIT_BYPASS';exception when invalid_parameter_value then null;end;
end$$;
reset role;
do $$begin
 if (select orders from before_data) is distinct from (select jsonb_agg(o) from orders o) or (select receipts from before_data) is distinct from (select jsonb_agg(r) from order_customer_receipts_v60 r) then raise exception 'DATA_CHANGED';end if;
end$$;
