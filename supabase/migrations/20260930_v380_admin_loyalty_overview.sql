-- V380 — align admin reward read model with the proven employee V361 shape.
-- Read-only overview only. Admin grant/write path remains untouched.
create or replace function public.admin_loyalty_overview_v310(p_session_token text) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare aid text;
begin
 aid:=private.require_admin_session_v147(p_session_token);
 if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
 return jsonb_build_object(
  'wallets',coalesce((select jsonb_agg(to_jsonb(w)) from public.kinto_loyalty_wallets w),'[]'::jsonb),
  'coupons',coalesce((select jsonb_agg(jsonb_build_object(
    'customer_id',customer_id,'store_id',store_id,'currency',currency,
    'status',case when status='used' then 'used' when expires_at<=now() then 'expired' else 'active' end,
    'points',points,'expires_at',expires_at,'funded_by',funded_by
  )) from public.kinto_loyalty_coupons),'[]'::jsonb)
 );
end $$;
revoke all on function public.admin_loyalty_overview_v310(text) from public;
grant execute on function public.admin_loyalty_overview_v310(text) to anon,authenticated;
