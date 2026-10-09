-- V161: canonical vendor finance snapshots for newly created independent orders only.
-- Existing orders and historical settlements are intentionally untouched.
begin;

create or replace function private.v161_stamp_new_vendor_finance()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare d jsonb:=private.v94_jsonb_object(to_jsonb(new.details)); r numeric; sid uuid;
begin
 if current_setting('app.v161_finance_checkout',true)<>'on'
    or coalesce(d->>'checkout_contract','')<>'independent_vendor_orders' then return new; end if;
 sid:=private.v94_uuid(d->>'store_id');
 select commission_rate into r from public.local_stores where id=sid;
 if sid is null or r is null or r<0 or r>=100 then raise exception 'V161_STORE_COMMISSION_INVALID'; end if;
 d:=d||jsonb_build_object('vendor_finance_version','v161',
   'vendor_finance_snapshot',jsonb_build_object('version','v161','commission_rate',r,'gross_amount',coalesce(new.total_price,0),'commission_amount',round(coalesce(new.total_price,0)*r/100,2),'other_deductions',0,'net_amount',round(coalesce(new.total_price,0)*(1-r/100),2),'currency',coalesce(new.currency,'IQD'),'captured_at',now(),'vendor_payment_status','pending'));
 new.details:=d::text; return new;
end $$;
drop trigger if exists trg_v161_stamp_new_vendor_finance on public.orders;
create trigger trg_v161_stamp_new_vendor_finance before insert on public.orders for each row execute procedure private.v161_stamp_new_vendor_finance();

create or replace function private.v161_sync_new_vendor_finance_segment()
returns trigger language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare d jsonb:=private.v94_jsonb_object(to_jsonb(new.details)); s jsonb;
begin
 s:=d->'vendor_finance_snapshot';
 if coalesce(d->>'vendor_finance_version','')<>'v161' or jsonb_typeof(s)<>'object' then return new; end if;
 update public.order_store_segments set commission_snapshot=s, vendor_payment_status=coalesce(s->>'vendor_payment_status','pending'), updated_at=now() where order_id=new.id;
 return new;
end $$;
drop trigger if exists trg_v161_sync_new_vendor_finance_segment on public.orders;
create trigger trg_v161_sync_new_vendor_finance_segment after insert or update of details on public.orders for each row execute procedure private.v161_sync_new_vendor_finance_segment();

create or replace function public.checkout_independent_vendor_orders_v161(p_customer_id uuid,p_customer_name text,p_customer_phone text,p_customer_shipping jsonb,p_items jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
begin
 perform set_config('app.v161_finance_checkout','on',true);
 return public.checkout_independent_vendor_orders_v101(p_customer_id,p_customer_name,p_customer_phone,p_customer_shipping,p_items);
end $$;
revoke all on function public.checkout_independent_vendor_orders_v161(uuid,text,text,jsonb,jsonb) from public;
grant execute on function public.checkout_independent_vendor_orders_v161(uuid,text,text,jsonb,jsonb) to anon,authenticated;
notify pgrst,'reload schema';
commit;