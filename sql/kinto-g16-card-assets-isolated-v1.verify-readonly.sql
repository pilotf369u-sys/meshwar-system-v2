-- KINTO G16 card image proposal: read-only post-deployment verification.
-- Never writes to business, orders, invoices, payment, stock or any table.
-- Run only AFTER separately reviewed/installing isolated migration.
begin read only;
select to_regclass('public.kinto_g16_card_assets_v1') is not null as assets_table_exists,
       to_regclass('public.kinto_g16_card_image_challenges_v1') is not null as challenge_table_exists;
select c.relname, c.relrowsecurity,
       has_table_privilege('anon',c.oid,'SELECT') as anon_can_select,
       has_table_privilege('authenticated',c.oid,'SELECT') as authenticated_can_select,
       has_table_privilege('anon',c.oid,'INSERT') as anon_can_insert,
       has_table_privilege('authenticated',c.oid,'UPDATE') as authenticated_can_update
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('kinto_g16_card_assets_v1','kinto_g16_card_image_challenges_v1');
select p.proname,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_can_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_can_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('kinto_g16_card_asset_commit_v1','kinto_g16_employee_card_catalogue_v1');
select id,public,file_size_limit,allowed_mime_types
from storage.buckets where id='kinto-g16-card-images-v1';
select count(*) as approved_enabled_manual_methods
from public.kinto_payment_methods_g16
where method_type='manual' and is_enabled=true and destination_verified_at is not null;
rollback;
