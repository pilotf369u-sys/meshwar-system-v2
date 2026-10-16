-- Emergency only: restore the prior direct API access and reopen its risk.
BEGIN;
DROP POLICY IF EXISTS kinto_private_media_select_guard_v1 ON storage.objects;
DROP POLICY IF EXISTS kinto_private_media_insert_guard_v1 ON storage.objects;
DROP POLICY IF EXISTS kinto_private_media_update_guard_v1 ON storage.objects;
DROP POLICY IF EXISTS kinto_private_media_delete_guard_v1 ON storage.objects;
COMMIT;
