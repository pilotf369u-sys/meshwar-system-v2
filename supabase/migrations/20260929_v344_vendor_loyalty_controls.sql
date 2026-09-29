-- V344: Vendor-only settings and aggregate rewards overview for the current store.
-- This migration does not modify checkout, order triggers, coupons, or customer balances.
create or replace function public.vendor_loyalty_overview_v344(p_session_token text)
returns jsonb
language plpgsql security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  sid text := private.require_vendor_session(p_session_token)::text;
  settings public.kinto_store_loyalty_settings%rowtype;
  cap numeric;
begin
  select * into settings from public.kinto_store_loyalty_settings where store_id = sid;
  select max_store_earn_rate into cap from public.kinto_loyalty_settings where id = 1;
  return jsonb_build_object(
    'enabled',coalesce(settings.enabled,true),
    'earn_rate',coalesce(settings.earn_rate,.01),
    'max_earn_rate',coalesce(cap,.10),
    'updated_at',settings.updated_at,
    'progress',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'customers',customers,'points',points))
      from (select currency,count(*) customers,sum(progress_points) points from public.kinto_loyalty_wallets
        where store_id=sid group by currency) w),'[]'::jsonb),
    'coupons',coalesce((select jsonb_agg(jsonb_build_object('currency',currency,'category',category,'count',coupon_count,'points',points))
      from (select currency,
          case when source_order_id is null then 'admin'
               when status='used' then 'used'
               when expires_at<=now() then 'expired'
               else 'available' end category,
          count(*) coupon_count,sum(points) points
        from public.kinto_loyalty_coupons where store_id=sid
        group by currency,category) q),'[]'::jsonb)
  );
end $$;
revoke all on function public.vendor_loyalty_overview_v344(text) from public;
grant execute on function public.vendor_loyalty_overview_v344(text) to anon, authenticated;

create or replace function public.vendor_save_loyalty_v344(
  p_session_token text, p_expected_updated_at timestamptz, p_enabled boolean, p_earn_rate numeric
)
returns jsonb
language plpgsql security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  sid text := private.require_vendor_session(p_session_token)::text;
  current_settings public.kinto_store_loyalty_settings%rowtype;
  cap numeric;
  created_sid text;
begin
  select max_store_earn_rate into cap from public.kinto_loyalty_settings where id=1;
  if p_enabled is null or p_earn_rate is null or p_earn_rate < 0
     or p_earn_rate > least(coalesce(cap,.10),.10)
     or (p_enabled and p_earn_rate=0) then
    raise exception 'LOYALTY_SETTINGS_INVALID' using errcode='22023';
  end if;
  insert into public.kinto_store_loyalty_settings(store_id)
    values(sid) on conflict(store_id) do nothing returning store_id into created_sid;
  select * into current_settings from public.kinto_store_loyalty_settings
    where store_id=sid for update;
  if (created_sid is not null and p_expected_updated_at is not null)
     or (created_sid is null and current_settings.updated_at is distinct from p_expected_updated_at) then
    raise exception 'LOYALTY_SETTINGS_VERSION_CONFLICT' using errcode='40001';
  end if;
  -- The delivery trigger reads enabled/rate only for future accruals. Issued coupons remain usable.
  update public.kinto_store_loyalty_settings
    set enabled=p_enabled,earn_rate=p_earn_rate,updated_by=sid,
        updated_at=greatest(clock_timestamp(),current_settings.updated_at+interval '1 microsecond')
    where store_id=sid;
  return public.vendor_loyalty_overview_v344(p_session_token);
end $$;
revoke all on function public.vendor_save_loyalty_v344(text,timestamptz,boolean,numeric) from public;
grant execute on function public.vendor_save_loyalty_v344(text,timestamptz,boolean,numeric) to anon, authenticated;
