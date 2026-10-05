-- G20 additive read-only option projection for campaign order composer.
begin;
create or replace function public.kinto_deals_v1_product_options_g20(p_campaign_id uuid)
returns jsonb language sql security definer set search_path=public,pg_temp as $g20$
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'options',jsonb_build_object('colors',coalesce(p.options->'colors','[]'::jsonb),'sizes',coalesce(p.options->'sizes','[]'::jsonb),'volumes',coalesce(p.options->'volumes','[]'::jsonb))) order by cp.created_at),'[]'::jsonb)
 from public.kinto_deals_v1_campaigns c
 join public.kinto_deals_v1_products cp on cp.campaign_id=c.id
 join public.local_products p on p.id=cp.product_id and p.store_id=c.store_id
 where c.id=p_campaign_id and c.status='approved' and c.merchant_published_at is not null and now()>=c.starts_at and now()<c.ends_at;
$g20$;
revoke all on function public.kinto_deals_v1_product_options_g20(uuid) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_product_options_g20(uuid) to anon,authenticated,service_role;
notify pgrst,'reload schema';
commit;

-- G20 UI consumes this projection only for option labels; canonical checkout validates the submitted selection.
