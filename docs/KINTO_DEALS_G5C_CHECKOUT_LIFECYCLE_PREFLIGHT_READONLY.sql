-- G5C checkout/lifecycle inspection. READ ONLY: catalog definitions, no live order rows.
select jsonb_pretty(jsonb_build_object(
 'feature_off',coalesce((select not enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false),
 'checkout_definitions',(
  select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
   'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text),'[]'::jsonb)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('checkout_independent_vendor_orders_v101','checkout_independent_vendor_orders')),
 'segment_creation_trigger',(
  select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),
   'function_definition',pg_get_functiondef(t.tgfoid)) order by t.tgname),'[]'::jsonb)
  from pg_trigger t where t.tgrelid='public.orders'::regclass and not t.tgisinternal
   and (t.tgname ilike '%segment%' or t.tgname ilike '%v94%')),
 'order_status_routines',(
  select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
   'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text),'[]'::jsonb)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private')
   and p.proname in ('meshwar_independent_vendor_order_guard',
    'meshwar_local_cart_bundle_stock_lifecycle','meshwar_local_stock_status_lifecycle',
    'kinto_loyalty_order_v310','v94_orders_segment_trigger')),
 'order_status_columns',(
  select coalesce(jsonb_agg(jsonb_build_object('column',a.attname,
   'type',format_type(a.atttypid,a.atttypmod),'default',pg_get_expr(d.adbin,d.adrelid))
   order by a.attnum),'[]'::jsonb)
  from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid='public.orders'::regclass and a.attnum>0 and not a.attisdropped
   and (a.attname ilike '%status%' or a.attname ilike '%payment%' or a.attname ilike '%cancel%')),
 'order_status_enum_types',(
  select coalesce(jsonb_agg(jsonb_build_object('type',n.nspname||'.'||t.typname,
   'labels',(select coalesce(jsonb_agg(e.enumlabel order by e.enumsortorder),'[]'::jsonb)
    from pg_enum e where e.enumtypid=t.oid)) order by t.typname),'[]'::jsonb)
  from pg_type t join pg_namespace n on n.oid=t.typnamespace
  where n.nspname='public' and t.typtype='e' and
   (t.typname ilike '%order%' or t.typname ilike '%status%'))
)) as g5c_checkout_lifecycle_preflight;
