\set ON_ERROR_STOP on
create role anon;
create role authenticated;
create schema private;
create table public.orders(id uuid primary key,customer_id text,branch_id text,status text);
create table public.order_customer_receipts_v60(order_id uuid primary key,customer_id text,confirmed_at timestamptz);
create function private.kinto_staff_actor_v1(role text,token text) returns jsonb language plpgsql as $$begin
 if token!='valid' or token is null then raise exception 'SESSION_INVALID' using errcode='42501';end if;
 return jsonb_build_object('role',role,'id','branch-a');
end$$;
create function private.kinto_order_visible_v1(o jsonb,a jsonb) returns boolean language sql as $$select case a->>'role' when 'admin' then true when 'employee' then true when 'branch' then o->>'branch_id'=a->>'id' else false end$$;
\i sql/staff-customer-receipts-v1.sql
insert into orders values
('00000000-0000-4000-8000-000000000001','customer-a','branch-a','تم التسليم'),
('00000000-0000-4000-8000-000000000002','customer-a','branch-b','تم التسليم'),
('00000000-0000-4000-8000-000000000003','customer-a','branch-a','تم التسليم'),
('00000000-0000-4000-8000-000000000004','customer-a','branch-a','تم التسليم');
insert into order_customer_receipts_v60 values
('00000000-0000-4000-8000-000000000001','customer-a',now()),
('00000000-0000-4000-8000-000000000002','customer-a',now()),
('00000000-0000-4000-8000-000000000004','different-customer',now());
create temp table snapshots as select (select jsonb_agg(o) from orders o) orders,(select jsonb_agg(r) from order_customer_receipts_v60 r) receipts;
set role anon;
do $$declare ids uuid[]:=array['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004']::uuid[];n int;r text;begin
 foreach r in array array['admin','employee','branch'] loop
 select count(*) into n from staff_customer_receipts_v1(r,'valid',ids);
 if n!=(case when r='branch' then 1 else 2 end) then raise exception 'WRONG_VISIBILITY % %',r,n;end if;
 end loop;
 if exists(select 1 from staff_customer_receipts_v1('branch','valid',null)) then raise exception 'NULL_IDS';end if;
 begin perform * from staff_customer_receipts_v1('employee','invalid',ids);raise exception 'AUTH_BYPASS';exception when insufficient_privilege then null;end;
 begin perform * from staff_customer_receipts_v1('courier','valid',ids);raise exception 'ROLE_BYPASS';exception when insufficient_privilege then null;end;
 begin perform * from staff_customer_receipts_v1(null,'valid',ids);raise exception 'NULL_ROLE_BYPASS';exception when insufficient_privilege then null;end;
 begin perform * from staff_customer_receipts_v1('employee','valid',array_fill(ids[1],array[101]));raise exception 'LIMIT_BYPASS';exception when invalid_parameter_value then null;end;
end$$;
reset role;
do $$begin
 if (select orders from snapshots) is distinct from (select jsonb_agg(o) from orders o) or (select receipts from snapshots) is distinct from (select jsonb_agg(r) from order_customer_receipts_v60 r) then raise exception 'DATA_CHANGED';end if;
end$$;
