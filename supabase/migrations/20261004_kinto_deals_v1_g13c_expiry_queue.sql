-- G13C: queue expired merchant ad objects; physical deletion remains server-side.
-- Safe to rerun. Public feed remains unchanged until final integration.
begin;
create or replace function public.kinto_deals_v1_queue_expired_ads_g13()
returns integer language plpgsql volatile security definer
set search_path=public,private,pg_temp as $fn$
declare n integer;
begin
 insert into public.kinto_deals_v1_ad_cleanup_g13(object_path,campaign_id)
 select a.object_path,a.campaign_id
 from public.kinto_deals_v1_ad_assets_g13 a
 join public.kinto_deals_v1_campaigns c on c.id=a.campaign_id
 where c.ends_at<=statement_timestamp()
 on conflict(object_path) do nothing;
 get diagnostics n=row_count;
 return n;
end;$fn$;
revoke all on function public.kinto_deals_v1_queue_expired_ads_g13() from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_queue_expired_ads_g13() to service_role;
commit;
