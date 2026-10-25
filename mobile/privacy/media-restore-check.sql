-- Simulated restoration of Storage *metadata*, no actual files or provider backups.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE storage.objects(bucket_id text,name text,PRIMARY KEY(bucket_id,name));
SELECT public.kinto_privacy_admin_v1('test-admin','deletions',(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000002'),'verify','TEST media restore evidence');
SELECT id AS restore_request FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000002' \gset
SELECT id AS restore_review FROM public.product_reviews WHERE customer_id='00000000-0000-4000-8000-000000000002' \gset
INSERT INTO public.product_review_images(id,review_id,storage_path,mime_type,byte_size)VALUES('00000000-0000-4000-8000-000000000091',:'restore_review','reviews/'||:'restore_review'||'/restore-only.png','image/png',12);
INSERT INTO private.product_review_upload_tickets_v150(id,review_id,customer_id,storage_path,mime_type,byte_size,used_at)VALUES('00000000-0000-4000-8000-000000000090',:'restore_review','00000000-0000-4000-8000-000000000002','reviews/'||:'restore_review'||'/restore-only.png','image/png',12,now());
CREATE TEMP TABLE media_restore_preserved AS SELECT jsonb_agg(to_jsonb(o)ORDER BY id)orders FROM public.orders o;
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
INSERT INTO private.kinto_privacy_media_policy_v1 VALUES(true,true,private.kinto_erasure_signature_v1());
SELECT public.kinto_privacy_media_prepare_v1('test-admin',:'restore_request',:'restore_request');
CREATE TEMP TABLE restore_claim AS SELECT public.kinto_privacy_media_claim_v1('test-admin',:'restore_request')job;
SELECT public.kinto_privacy_media_finish_v1('test-admin',:'restore_request',(SELECT(job->>'id')::uuid FROM restore_claim),(SELECT(job->>'lease')::uuid FROM restore_claim),false);
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM private.kinto_privacy_media_ledger_v1),'failed removal emits no completed media evidence');
UPDATE restore_claim SET job=public.kinto_privacy_media_claim_v1('test-admin',:'restore_request');
-- Positive acknowledgement here is synthetic; actual worker separately verifies Storage absence.
SELECT public.kinto_privacy_media_finish_v1('test-admin',:'restore_request',(SELECT(job->>'id')::uuid FROM restore_claim),(SELECT(job->>'lease')::uuid FROM restore_claim),true);
SELECT public.kinto_privacy_media_prepare_v1('test-admin',:'restore_request',:'restore_request');
UPDATE restore_claim SET job=public.kinto_privacy_media_claim_v1('test-admin',:'restore_request');
SELECT public.test_assert((SELECT job->>'source_type'FROM restore_claim)='upload_ticket','completed image leaves its used ticket for safe follow-up cleanup');
SELECT public.kinto_privacy_media_finish_v1('test-admin',:'restore_request',(SELECT(job->>'id')::uuid FROM restore_claim),(SELECT(job->>'lease')::uuid FROM restore_claim),true);
SELECT public.test_assert((SELECT count(*)FROM private.kinto_privacy_media_ledger_v1)=1,'image/ticket on same path produce one minimal evidence row');
SELECT public.test_assert(NOT has_function_privilege('anon','private.kinto_privacy_media_ledger_export_v1(bigint,integer)','EXECUTE'),'media evidence has no anonymous export');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(private.kinto_privacy_media_ledger_export_v1())x WHERE x?'path'OR x?'object_path'OR x?'customer_id'OR x?'session_token'),'media export has no raw object path or account/session identity');
SELECT public.test_assert(jsonb_array_length(private.kinto_privacy_restore_media_matches_v1((SELECT jsonb_build_array(path_hash)FROM private.kinto_privacy_media_ledger_v1))->'matched_hashes')=0,'no restored metadata yet');
-- Metadata-only row from another bucket must not falsely match a review-image key.
INSERT INTO storage.objects VALUES('product-images','reviews/'||:'restore_review'||'/restore-only.png');
SELECT public.test_assert(jsonb_array_length(private.kinto_privacy_restore_media_matches_v1((SELECT jsonb_build_array(path_hash)FROM private.kinto_privacy_media_ledger_v1))->'matched_hashes')=0,'bucket forms part of media identity');
INSERT INTO storage.objects VALUES('product-review-images','reviews/'||:'restore_review'||'/restore-only.png');
SELECT public.test_assert(jsonb_array_length(private.kinto_privacy_restore_media_matches_v1((SELECT jsonb_build_array(path_hash)FROM private.kinto_privacy_media_ledger_v1))->'matched_hashes')=1,'external path hash detects restored media metadata without a surviving review/ticket');
SELECT public.test_assert(private.kinto_privacy_restore_media_matches_v1((SELECT jsonb_build_array(path_hash)FROM private.kinto_privacy_media_ledger_v1))->>'restore_authorized'='false','media detector never authorizes restore');
SELECT public.test_denied($q$SELECT private.kinto_privacy_restore_media_matches_v1('[]')$q$,'EXTERNAL_MEDIA_LEDGER_REQUIRED');
SELECT public.test_assert((SELECT count(*)FROM storage.objects)=2,'restore detector changes no Storage metadata');
SELECT public.test_assert((SELECT orders FROM media_restore_preserved)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'orders unchanged');
ROLLBACK;
SELECT 'PASS_PRIVACY_MEDIA_RESTORE: failure has no false tombstone, completed image/ticket deduplicated, private hashed export, restored Storage metadata detected by bucket/key hash without source rows; no automatic restore authorization or metadata changes';
