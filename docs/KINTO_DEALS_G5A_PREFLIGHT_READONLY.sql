-- G5A READ-ONLY live database preflight. No DDL, no mutations.
-- Copy result JSON; do not share live session tokens or personal order data.
select jsonb_pretty(jsonb_build_object(
 'feature_off',coalesce((select not enabled from public.kinto_deals_v1_flags where key='merchant_deals_enabled'),false),
 'checkout_functions',(select coalesce(jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'security_definer',p.prosecdef,'definition',pg_get_functiondef(p.oid)) order by p.oid::regprocedure::text),'[]'::jsonb) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private') and p.proname in ('checkout_independent_vendor_orders_v101','checkout_independent_vendor_orders','customer_session_identity_v150','kinto_campaign_order_discount_v411','kinto_loyalty_order_v310','meshwar_local_cart_bundle_stock_lifecycle')),
 'order_triggers',(select coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid),'enabled',t.tgenabled) order by t.tgname),'[]'::jsonb) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname='orders' and not t.tgisinternal),
 'deal_redemption_constraints',(select coalesce(jsonb_agg(jsonb_build_object('name',con.conname,'definition',pg_get_constraintdef(con.oid))),'[]'::jsonb) from pg_constraint con where con.conrelid='public.kinto_deals_v1_redemptions'::regclass)
)) as g5a_preflight;
