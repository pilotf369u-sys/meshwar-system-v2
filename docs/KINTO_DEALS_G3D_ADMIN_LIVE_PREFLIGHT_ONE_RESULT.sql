-- KINTO DEALS G3D: READ ONLY. ONE RESULT in Supabase SQL Editor.
-- Determine exact product image/barcode columns before building admin details RPC.
with required as (
 select 'local_products'::text table_name, 'id'::text column_name union all
 select 'local_products','store_id' union all
 select 'local_stores','id' union all
 select 'kinto_deals_v1_campaigns','terms_snapshot' union all
 select 'kinto_deals_v1_submissions','summary_snapshot'
), columns_found as (
 select table_name,jsonb_agg(jsonb_build_object('column',column_name,'type',data_type) order by ordinal_position) as cols
 from information_schema.columns
 where table_schema='public' and table_name in ('local_products','local_stores','kinto_deals_v1_campaigns','kinto_deals_v1_submissions')
 group by table_name
), endpoints as (
 select p.proname,pg_get_function_identity_arguments(p.oid) args,p.prosecdef definer
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('kinto_deals_v1_admin_inbox_g3','kinto_deals_v1_admin_decide_g3','kinto_deals_v1_vendor_review_feed_g3')
)
select
 (select jsonb_object_agg(table_name,cols) from columns_found) as relevant_columns,
 (select jsonb_agg(to_jsonb(endpoints) order by proname) from endpoints) as verified_endpoints,
 (select jsonb_agg(to_jsonb(r) order by table_name,column_name) from required r
   where not exists(select 1 from information_schema.columns c
    where c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name)) as missing_required_columns,
 (select enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled') as feature_enabled;
