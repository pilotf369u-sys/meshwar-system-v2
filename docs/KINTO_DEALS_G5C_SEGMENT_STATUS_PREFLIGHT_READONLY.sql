-- G5C final segment/payment linkage preflight. READ ONLY; no order/customer rows.
select jsonb_pretty(jsonb_build_object(
 'feature_off',coalesce((select not enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false),
 'segment_sync_definition',(
  select pg_get_functiondef('private.v94_sync_order_segments(uuid)'::regprocedure)),
 'order_segment_triggers',(
  select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,
   'definition',pg_get_triggerdef(t.oid),'function',pg_get_functiondef(t.tgfoid))
   order by t.tgname),'[]'::jsonb)
  from pg_trigger t where t.tgrelid='public.order_store_segments'::regclass and not t.tgisinternal),
 'payment_related_routines',(
  select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
   'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text),'[]'::jsonb)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and
  (p.proname ilike '%payment%confirm%' or p.proname ilike '%order%cancel%'
   or p.proname ilike '%order%status%' or p.proname ilike '%store%status%')
  and p.prokind='f'),
 'segment_status_columns',(
  select coalesce(jsonb_agg(jsonb_build_object('column',a.attname,
   'type',format_type(a.atttypid,a.atttypmod),'default',pg_get_expr(d.adbin,d.adrelid))
   order by a.attnum),'[]'::jsonb)
  from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid='public.order_store_segments'::regclass and a.attnum>0 and not a.attisdropped
   and (a.attname ilike '%status%' or a.attname ilike '%payment%')),
 'redemption_constraints',(
  select coalesce(jsonb_agg(jsonb_build_object('name',con.conname,
   'definition',pg_get_constraintdef(con.oid)) order by con.conname),'[]'::jsonb)
  from pg_constraint con where con.conrelid='public.kinto_deals_v1_redemptions'::regclass)
)) as g5c_segment_status_preflight;
