-- G5C follow-up: READ-ONLY order linkage and redemption guard metadata.
-- No customer rows, order rows, tokens, DDL or DML.
select jsonb_pretty(jsonb_build_object(
 'feature_off',coalesce((select not enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false),
 'order_store_related_columns',(
  select coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'type',format_type(a.atttypid,a.atttypmod))
   order by a.attnum),'[]'::jsonb)
  from pg_attribute a where a.attrelid='public.orders'::regclass and a.attnum>0 and not a.attisdropped
   and (a.attname ilike '%store%' or a.attname ilike '%vendor%' or a.attname ilike '%customer%'
    or a.attname ilike '%segment%' or a.attname ilike '%reference%' or a.attname ilike '%group%')),
 'store_segment_tables',(
  select coalesce(jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,
   'columns',(select coalesce(jsonb_agg(jsonb_build_object('column',a.attname,'type',format_type(a.atttypid,a.atttypmod))
    order by a.attnum),'[]'::jsonb) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))
   order by c.relname),'[]'::jsonb)
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p')
   and (c.relname ilike '%segment%' or c.relname ilike '%order_store%')),
 'redemption_store_guard',(
  select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
   'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text),'[]'::jsonb)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='kinto_deals_v1_validate_related_store'),
 'checkout_signatures',(
  select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
   'arguments',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid))
   order by p.oid::regprocedure::text),'[]'::jsonb)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('checkout_independent_vendor_orders_v101','checkout_independent_vendor_orders')),
 'order_status_metadata',(
  select coalesce(jsonb_agg(jsonb_build_object('trigger',t.tgname,'definition',pg_get_triggerdef(t.oid))
   order by t.tgname),'[]'::jsonb)
  from pg_trigger t where t.tgrelid='public.orders'::regclass and not t.tgisinternal
   and (t.tgname ilike '%status%' or pg_get_triggerdef(t.oid) ilike '%status%'))
)) as g5c_order_linkage_preflight;
