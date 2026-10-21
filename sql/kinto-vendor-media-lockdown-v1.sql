-- Only after all three vendor upload paths migrate and real upload smoke succeeds.
BEGIN;
CREATE POLICY kinto_product_media_insert_guard_v1 ON storage.objects AS RESTRICTIVE
FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'product-images' OR private.vendor_media_upload_allowed_v1(bucket_id,name,metadata));
CREATE POLICY kinto_product_media_update_guard_v1 ON storage.objects AS RESTRICTIVE
FOR UPDATE TO anon,authenticated USING(bucket_id<>'product-images') WITH CHECK(bucket_id<>'product-images');
CREATE POLICY kinto_product_media_delete_guard_v1 ON storage.objects AS RESTRICTIVE
FOR DELETE TO anon,authenticated USING(bucket_id<>'product-images');
COMMIT;
