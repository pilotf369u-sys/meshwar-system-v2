-- KINTO IQD 250 — production preflight, READ ONLY, ZERO writes.
-- Run in Supabase SQL Editor and inspect output before drafting a server migration.
-- This SQL does not execute checkout or change any product, order, or payment state.
with target(signature, role) as (
  values
  ('public.kinto_checkout_session_v1(text,jsonb,jsonb)','manual entry'),
  ('public.checkout_independent_vendor_orders_v161(uuid,text,text,jsonb,jsonb)','manual finance wrapper'),
  ('public.checkout_independent_vendor_orders_v101(uuid,text,text,text,jsonb)','legacy candidate (intentionally checked)'),
  ('public.checkout_independent_vendor_orders_v101(uuid,text,text,jsonb,jsonb)','manual shipping wrapper'),
  ('public.checkout_independent_vendor_orders(uuid,text,text,jsonb)','canonical base'),
  ('private.kinto_payment_p5_quote_v1(uuid,jsonb,jsonb)','P5 quote candidate'),
  ('private.kinto_payment_p5_quote_v1(text,jsonb,jsonb)','P5 quote candidate'),
  ('private.kinto_deals_v1_gift_line_g5e(uuid)','gift candidate')
)
select role,signature,
       to_regprocedure(signature) is not null as installed,
       case when to_regprocedure(signature) is not null
         then md5(pg_get_functiondef(to_regprocedure(signature))) else null end as definition_md5,
       case when to_regprocedure(signature) is not null
         then (pg_get_functiondef(to_regprocedure(signature)) ilike '%/ 1000%') else null end as contains_thousand_rounding,
       case when to_regprocedure(signature) is not null
         then (pg_get_functiondef(to_regprocedure(signature)) ilike '%/ 250%') else null end as contains_250_rounding,
       case when to_regprocedure(signature) is not null
         then (pg_get_functiondef(to_regprocedure(signature)) ilike '%ceil(%') else null end as contains_any_ceiling
from target order by role,signature;

-- Find overloaded function signatures whose deployed arguments differ from source.
select n.nspname as schema_name,p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       md5(pg_get_functiondef(p.oid)) as definition_md5
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in (
 'kinto_checkout_session_v1','checkout_independent_vendor_orders','checkout_independent_vendor_orders_v101','checkout_independent_vendor_orders_v161'
)) or (n.nspname='private' and (
 p.proname like 'kinto_payment_p5_quote%' or p.proname like '%gift%line%'
))
order by n.nspname,p.proname,identity_arguments;
