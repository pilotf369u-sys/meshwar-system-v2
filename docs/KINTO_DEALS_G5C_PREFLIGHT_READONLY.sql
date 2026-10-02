-- G5C READ-ONLY preflight. No DDL/DML. Run in Supabase SQL Editor.
-- Outputs metadata and routine definitions ONLY. No customer rows, session tokens or order data.
select jsonb_pretty(jsonb_build_object(
 'feature_off',coalesce((select not enabled from public.kinto_deals_v1_flags
  where key='merchant_deals_enabled'),false),
 'server_version',current_setting('server_version'),
 'redemptions_columns',(
  select coalesce(jsonb_agg(jsonb_build_object(
   'column',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid))
   order by a.attnum),'[]'::jsonb)
  from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
  where a.attrelid='public.kinto_deals_v1_redemptions'::regclass and a.attnum>0 and not a.attisdropped),
 'redemptions_indexes',(
  select coalesce(jsonb_agg(jsonb_build_object('name',i.indexname,'definition',i.indexdef)
   order by i.indexname),'[]'::jsonb)
  from pg_indexes i where i.schemaname='public' and i.tablename='kinto_deals_v1_redemptions'),
 'redemptions_constraints',(
  select coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid))
   order by c.conname),'[]'::jsonb)
  from pg_constraint c where c.conrelid='public.kinto_deals_v1_redemptions'::regclass),
 'redemptions_triggers',(
  select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,
   'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled)
   order by t.tgname),'[]'::jsonb)
  from pg_trigger t where t.tgrelid='public.kinto_deals_v1_redemptions'::regclass and not t.tgisinternal),
 'campaign_constraints',(
  select coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid))
   order by c.conname),'[]'::jsonb)
  from pg_constraint c where c.conrelid='public.kinto_deals_v1_campaigns'::regclass),
 'orders_columns_needed_for_reservation',(
  select coalesce(jsonb_agg(jsonb_build_object('column',a.attname,
   'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull)
   order by a.attnum),'[]'::jsonb)
  from pg_attribute a where a.attrelid='public.orders'::regclass
   and a.attname in ('id','customer_id','store_id','status','details','total_price','created_at')
   and a.attnum>0 and not a.attisdropped),
 'customer_session_signature',(
  select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
   'return_type',pg_get_function_result(p.oid),'definition',pg_get_functiondef(p.oid))
   order by p.oid::regprocedure::text),'[]'::jsonb)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private' and p.proname='require_customer_review_session'),
 'cancellation_statuses',(
  select coalesce(jsonb_agg(jsonb_build_object('name',c.conname,'definition',pg_get_constraintdef(c.oid))
   order by c.conname),'[]'::jsonb)
  from pg_constraint c where c.conrelid='public.orders'::regclass
   and pg_get_constraintdef(c.oid) ilike '%status%'),
 'existing_redemption_routines',(
  select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
   'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text),'[]'::jsonb)
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.proname like 'kinto_deals_v1_%'
   and (p.proname ilike '%redeem%' or p.proname ilike '%reserv%' or p.proname ilike '%release%'))
)) as g5c_preflight;
