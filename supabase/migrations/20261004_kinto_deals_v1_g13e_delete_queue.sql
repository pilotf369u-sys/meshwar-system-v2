-- G13E: preserve cleanup work when a campaign is removed.
begin;
create or replace function public.kinto_deals_v1_queue_deleted_ad_g13()
returns trigger language plpgsql security definer
set search_path=public,private,pg_temp as $fn$
begin
 insert into public.kinto_deals_v1_ad_cleanup_g13(object_path,campaign_id)
 values(old.object_path,old.campaign_id)
 on conflict(object_path) do nothing;
 return old;
end;$fn$;
drop trigger if exists kinto_deals_v1_queue_deleted_ad_g13 on public.kinto_deals_v1_ad_assets_g13;
create trigger kinto_deals_v1_queue_deleted_ad_g13
 before delete on public.kinto_deals_v1_ad_assets_g13
 for each row execute function public.kinto_deals_v1_queue_deleted_ad_g13();
revoke all on function public.kinto_deals_v1_queue_deleted_ad_g13() from public,anon,authenticated;
commit;
