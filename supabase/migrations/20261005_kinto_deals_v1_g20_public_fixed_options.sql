-- G20: public campaign detail may expose only merchant-frozen option choices.
begin;
create or replace function public.kinto_deals_v1_public_fixed_options_g20(p_campaign_id uuid)
returns jsonb language sql stable security definer
set search_path=public,private,pg_temp as $g20$
 select coalesce(jsonb_object_agg(cp.product_id::text,cp.selected_options),'{}'::jsonb)
 from public.kinto_deals_v1_campaigns c
 join public.kinto_deals_v1_products cp on cp.campaign_id=c.id
 where c.id=p_campaign_id
  and exists(select 1 from public.kinto_deals_v1_public_feed_g7(c.store_id) f
             where f.campaign_id=c.id);
$g20$;
revoke all on function public.kinto_deals_v1_public_fixed_options_g20(uuid) from public;
grant execute on function public.kinto_deals_v1_public_fixed_options_g20(uuid) to anon,authenticated,service_role;
commit;
