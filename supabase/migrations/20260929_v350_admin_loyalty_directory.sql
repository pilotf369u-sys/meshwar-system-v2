-- V350: authenticated admin rewards directory, read-only additions to V310 overview.
-- No order, checkout, shipping, trigger, accrual or coupon lifecycle changes.
create or replace function public.admin_loyalty_overview_v310(p_session_token text) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare aid text;
begin
 aid:=private.require_admin_session_v147(p_session_token);if coalesce(aid,'')='' then raise exception 'invalid admin session';end if;
 return jsonb_build_object(
 'wallets',coalesce((select jsonb_agg(to_jsonb(w)) from public.kinto_loyalty_wallets w),'[]'::jsonb),
 'coupons',coalesce((select jsonb_agg(jsonb_build_object('customer_id',customer_id,'store_id',store_id,'currency',currency,'status',case when status='used' then 'used' when expires_at<=now() then 'expired' else 'active' end,'points',points,'expires_at',expires_at,'used_order_id',used_order_id,'source_order_id',source_order_id)) from public.kinto_loyalty_coupons),'[]'::jsonb),
 'customers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'secondary_phone',secondary_phone,'code',code) order by id) from public.customers),'[]'::jsonb),
 'stores',coalesce((select jsonb_agg(jsonb_build_object('id',id,'store_name',store_name,'name',name,'phone',phone) order by id) from public.local_stores),'[]'::jsonb)
 );
end $$;
revoke all on function public.admin_loyalty_overview_v310(text) from public;
grant execute on function public.admin_loyalty_overview_v310(text) to anon,authenticated;
