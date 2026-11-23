-- KINTO IQD 250: LIVE FUNCTION PRICING EXPRESSION INSPECTION
-- READ ONLY. No checkout execution; no CREATE/ALTER/UPDATE/DELETE.
-- Shows only nearby text around each "ceil(" from installed functions, not full bodies.
with selected as (
 select n.nspname as schema_name,p.proname as function_name,
        pg_get_function_identity_arguments(p.oid) as arguments,
        pg_get_functiondef(p.oid) as body
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='public' and p.proname in (
   'checkout_independent_vendor_orders','checkout_independent_vendor_orders_v101',
   'checkout_independent_vendor_orders_v161','kinto_checkout_session_v1'
 )) or (n.nspname='private' and p.proname in (
   'kinto_payment_p5_quote_v1','kinto_deals_v1_gift_line_g5e'
 ))
), located as (
 select s.schema_name,s.function_name,s.arguments,
        i as occurrence,regexp_instr(s.body,'ceil[[:space:]]*[(]',1,i,0,'i') as at_pos,s.body
 from selected s cross join generate_series(1,12) as i
)
select schema_name,function_name,arguments,occurrence,
       substr(body,greatest(1,at_pos-110),least(450,length(body))) as nearby_expression
from located
where at_pos>0
order by schema_name,function_name,arguments,occurrence;

-- Exact live-function summary. SHA fingerprint is not a replacement for body inspection.
select n.nspname as schema_name,p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments,
       md5(pg_get_functiondef(p.oid)) as definition_md5,
       pg_get_functiondef(p.oid) ilike '%iqd_ceil_1000_v1%' as uses_old_pricing_snapshot_tag,
       pg_get_functiondef(p.oid) ilike '%iqd_ceil_250_v2%' as uses_new_pricing_snapshot_tag
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='public' and p.proname in (
 'checkout_independent_vendor_orders','checkout_independent_vendor_orders_v101',
 'checkout_independent_vendor_orders_v161','kinto_checkout_session_v1'))
or (n.nspname='private' and p.proname in (
 'kinto_payment_p5_quote_v1','kinto_deals_v1_gift_line_g5e'))
order by schema_name,function_name,arguments;
