-- Emergency only; restores prior unsafe API endpoints/storage behavior.
BEGIN;
DROP POLICY IF EXISTS kinto_site_hero_insert_guard_v1 ON storage.objects;
DROP POLICY IF EXISTS kinto_site_hero_update_guard_v1 ON storage.objects;
DROP POLICY IF EXISTS kinto_site_hero_delete_guard_v1 ON storage.objects;
GRANT EXECUTE ON FUNCTION public.save_site_settings(text,jsonb),public.admin_create_hero_upload(uuid,text,text) TO anon,authenticated;
COMMIT;
