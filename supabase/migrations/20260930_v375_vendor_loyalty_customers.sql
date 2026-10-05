-- V375: Vendor reward customer directory, strictly scoped by verified vendor store session.
-- Read-only. Does not alter earning, coupons, orders, invoices, auth or tracking.
create or replace function public.vendor_loyalty_customers_v375(p_session_token text)
returns jsonb
language plpgsql security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  sid text := private.require_vendor_session(p_session_token)::text;
begin
  return coalesce((
    with keys as (
      select customer_id,store_id,currency from public.kinto_loyalty_wallets where store_id=sid
      union
      select customer_id,store_id,currency from public.kinto_loyalty_coupons where store_id=sid
    )
    select jsonb_agg(jsonb_build_object(
      'customer_id',k.customer_id,'currency',k.currency,
      'progress_points',coalesce(w.progress_points,0),
      'available',coalesce(c.available,0),'used',coalesce(c.used,0),
      'expired',coalesce(c.expired,0),'admin',coalesce(c.admin,0)
    ) order by k.customer_id,k.currency)
    from keys k
    left join public.kinto_loyalty_wallets w
      on w.customer_id=k.customer_id and w.store_id=k.store_id and w.currency=k.currency
    left join lateral (
      select
        coalesce(sum(points) filter(where status='active' and expires_at>now() and coalesce(funded_by,'vendor')<>'kinto'),0) available,
        coalesce(sum(points) filter(where status='used' and coalesce(funded_by,'vendor')<>'kinto'),0) used,
        coalesce(sum(points) filter(where (status='expired' or (status='active' and expires_at<=now())) and coalesce(funded_by,'vendor')<>'kinto'),0) expired,
        coalesce(sum(points) filter(where funded_by='kinto'),0) admin
      from public.kinto_loyalty_coupons x
      where x.customer_id=k.customer_id and x.store_id=sid and x.currency=k.currency
    ) c on true
  ),'[]'::jsonb);
end $$;
revoke all on function public.vendor_loyalty_customers_v375(text) from public;
grant execute on function public.vendor_loyalty_customers_v375(text) to anon, authenticated;
