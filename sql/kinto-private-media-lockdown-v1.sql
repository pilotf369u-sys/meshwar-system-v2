-- Only two private buckets used through existing service-role Edge Functions.
-- No object, bucket, public-media or application data changes.
BEGIN;
DO $$ BEGIN
 IF (SELECT count(*) FROM storage.buckets WHERE id IN ('kinto-customer-notice-media','kinto-merchant-campaign-ads') AND public IS FALSE)<>2 THEN RAISE EXCEPTION 'PRIVATE_MEDIA_BUCKET_CONFIG_CHANGED'; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role' AND rolbypassrls) THEN RAISE EXCEPTION 'PRIVATE_MEDIA_SERVICE_ROLE_REQUIRED'; END IF;
 IF NOT has_table_privilege('service_role','storage.objects','SELECT') OR NOT has_table_privilege('service_role','storage.objects','INSERT') OR NOT has_table_privilege('service_role','storage.objects','UPDATE') OR NOT has_table_privilege('service_role','storage.objects','DELETE') THEN RAISE EXCEPTION 'PRIVATE_MEDIA_SERVICE_GRANTS_REQUIRED'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass) THEN RAISE EXCEPTION 'STORAGE_RLS_REQUIRED'; END IF;
END $$;
CREATE POLICY kinto_private_media_select_guard_v1 ON storage.objects AS RESTRICTIVE
FOR SELECT TO anon,authenticated USING(bucket_id NOT IN ('kinto-customer-notice-media','kinto-merchant-campaign-ads'));
CREATE POLICY kinto_private_media_insert_guard_v1 ON storage.objects AS RESTRICTIVE
FOR INSERT TO anon,authenticated WITH CHECK(bucket_id NOT IN ('kinto-customer-notice-media','kinto-merchant-campaign-ads'));
CREATE POLICY kinto_private_media_update_guard_v1 ON storage.objects AS RESTRICTIVE
FOR UPDATE TO anon,authenticated
USING(bucket_id NOT IN ('kinto-customer-notice-media','kinto-merchant-campaign-ads'))
WITH CHECK(bucket_id NOT IN ('kinto-customer-notice-media','kinto-merchant-campaign-ads'));
CREATE POLICY kinto_private_media_delete_guard_v1 ON storage.objects AS RESTRICTIVE
FOR DELETE TO anon,authenticated USING(bucket_id NOT IN ('kinto-customer-notice-media','kinto-merchant-campaign-ads'));
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname IN ('kinto_private_media_select_guard_v1','kinto_private_media_insert_guard_v1','kinto_private_media_update_guard_v1','kinto_private_media_delete_guard_v1') AND NOT polpermissive)<>4 THEN RAISE EXCEPTION 'PRIVATE_MEDIA_GUARDS_INCOMPLETE'; END IF;
END $$;
COMMIT;
