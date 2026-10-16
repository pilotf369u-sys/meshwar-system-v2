-- FINAL separate stage after migrated UI and real admin smoke verification.
BEGIN;
REVOKE ALL ON FUNCTION public.save_site_settings(text,jsonb),public.admin_create_hero_upload(uuid,text,text) FROM PUBLIC,anon,authenticated;
-- Restrictive policies AND with existing permissive policies: broad allow_all
-- can no longer bypass the ticket gate in this bucket. Other buckets unchanged.
CREATE POLICY kinto_site_hero_insert_guard_v1 ON storage.objects AS RESTRICTIVE
FOR INSERT TO anon,authenticated
WITH CHECK(bucket_id<>'site-hero-media' OR public.meshwar_can_upload_hero_object(name));
CREATE POLICY kinto_site_hero_update_guard_v1 ON storage.objects AS RESTRICTIVE
FOR UPDATE TO anon,authenticated
USING(bucket_id<>'site-hero-media') WITH CHECK(bucket_id<>'site-hero-media');
CREATE POLICY kinto_site_hero_delete_guard_v1 ON storage.objects AS RESTRICTIVE
FOR DELETE TO anon,authenticated USING(bucket_id<>'site-hero-media');
DO $$ BEGIN
 IF has_function_privilege('anon','public.save_site_settings(text,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.save_site_settings(text,jsonb)','EXECUTE') OR has_function_privilege('anon','public.admin_create_hero_upload(uuid,text,text)','EXECUTE') OR has_function_privilege('authenticated','public.admin_create_hero_upload(uuid,text,text)','EXECUTE') THEN RAISE EXCEPTION 'SITE_LEGACY_EXECUTE_REMAINS'; END IF;
END $$;
COMMIT;
