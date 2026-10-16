-- Emergency only: removes new protections and reopens prior direct write risk.
BEGIN;
DROP POLICY IF EXISTS kinto_product_media_insert_guard_v1 ON storage.objects;
DROP POLICY IF EXISTS kinto_product_media_update_guard_v1 ON storage.objects;
DROP POLICY IF EXISTS kinto_product_media_delete_guard_v1 ON storage.objects;
COMMIT;
