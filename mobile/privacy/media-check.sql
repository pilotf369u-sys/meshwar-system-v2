-- Disposable tests only. Storage calls are tested separately with a fake service, never production.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.orders VALUES('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','تم التسليم','{}');
INSERT INTO public.product_reviews(id,customer_id,order_id,store_id,product_reference,product_name_snapshot,rating)VALUES('00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000010','TEST-other','TEST other owner',5);
INSERT INTO public.product_review_images(id,review_id,storage_path,mime_type,byte_size,sort_order)
 SELECT '00000000-0000-4000-8000-000000000061',id,'reviews/'||id||'/test-owned.png','image/png',12,0 FROM public.product_reviews WHERE customer_id='00000000-0000-4000-8000-000000000002';
INSERT INTO public.product_review_images(id,review_id,storage_path,mime_type,byte_size,sort_order)
 SELECT '00000000-0000-4000-8000-000000000062',id,'database://test-owned','image/png',12,1 FROM public.product_reviews WHERE customer_id='00000000-0000-4000-8000-000000000002';
INSERT INTO public.product_review_images(id,review_id,storage_path,mime_type,byte_size,sort_order)VALUES('00000000-0000-4000-8000-000000000063','00000000-0000-4000-8000-000000000050','reviews/00000000-0000-4000-8000-000000000050/test-other.png','image/png',12,0);
INSERT INTO public.product_review_image_payloads VALUES('00000000-0000-4000-8000-000000000062',decode('010203','hex'));
CREATE TEMP TABLE media_preserved AS SELECT (SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)orders,(SELECT to_jsonb(c)FROM public.customers c WHERE code='TEST-A')other_customer,(SELECT to_jsonb(i)FROM public.product_review_images i WHERE id='00000000-0000-4000-8000-000000000063')other_image;
SELECT public.kinto_privacy_admin_v1('test-admin','deletions',(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000002'),'verify','TEST media ownership verified');
SELECT public.test_denied(format('SELECT public.kinto_privacy_media_prepare_v1(%L,%L,%L)','test-admin',(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000002'),(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000002')),'PRIVACY_MEDIA_POLICY_REQUIRED');
INSERT INTO private.kinto_privacy_media_policy_v1 VALUES(true,true,private.kinto_erasure_signature_v1());
SELECT public.test_assert(NOT has_function_privilege('anon','public.kinto_privacy_media_claim_v1(text,uuid)','EXECUTE'),'anonymous cannot claim media paths');
SELECT public.test_assert(NOT has_function_privilege('authenticated','public.kinto_privacy_media_finish_v1(text,uuid,uuid,uuid,boolean)','EXECUTE'),'customer JWT cannot acknowledge deletion');
SELECT public.test_denied(format('SELECT public.kinto_privacy_media_claim_v1(%L,%L)','test-TEST-A',(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000002')),'ADMIN_SESSION_INVALID');
SELECT id AS target_request FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000002' \gset
SET ROLE service_role;
SELECT public.kinto_privacy_media_prepare_v1('test-admin',:'target_request'::uuid,:'target_request'::uuid);
RESET ROLE;
-- Exactly two target-owner images; no other customer's image enters the manifest.
SELECT public.test_assert((SELECT count(*)FROM private.kinto_privacy_media_jobs_v1)=2,'manifest scoped to verified customer');
SELECT public.test_assert((SELECT public.kinto_privacy_media_prepare_v1('test-admin',request_id,request_id)->>'prepared'FROM private.kinto_privacy_media_jobs_v1 LIMIT 1)='0','repeat preparation idempotent');
UPDATE private.kinto_privacy_media_jobs_v1 SET created_at=now()-interval '1 minute'WHERE kind='storage';
SAVEPOINT changed_source;
UPDATE public.product_review_images SET storage_path='reviews/unknown/changed.png'WHERE id='00000000-0000-4000-8000-000000000061';
SELECT public.test_assert((SELECT public.kinto_privacy_media_claim_v1('test-admin',request_id)->>'held'FROM private.kinto_privacy_media_jobs_v1 LIMIT 1)='true','changed source held before storage access');
ROLLBACK TO changed_source;
CREATE TEMP TABLE claimed AS SELECT public.kinto_privacy_media_claim_v1('test-admin',request_id)job FROM private.kinto_privacy_media_jobs_v1 LIMIT 1;
SELECT public.test_assert((SELECT job->>'kind'FROM claimed)='storage','storage item claimed');
SAVEPOINT expired_lease;
UPDATE private.kinto_privacy_media_jobs_v1 SET lease_until=now()-interval '1 second'WHERE id=(SELECT(job->>'id')::uuid FROM claimed);
SELECT public.test_denied(format('SELECT public.kinto_privacy_media_finish_v1(%L,%L,%L,%L,true)','test-admin',(SELECT request_id FROM private.kinto_privacy_media_jobs_v1 LIMIT 1),(SELECT job->>'id'FROM claimed),(SELECT job->>'lease'FROM claimed)),'PRIVACY_MEDIA_LEASE_INVALID');
SELECT public.test_assert((SELECT public.kinto_privacy_media_claim_v1('test-admin',request_id)->>'lease'FROM private.kinto_privacy_media_jobs_v1 WHERE id=(SELECT(job->>'id')::uuid FROM claimed))<>(SELECT job->>'lease'FROM claimed),'expired lease reclaimed with a new secret');
ROLLBACK TO expired_lease;
SAVEPOINT attempt_limit;
UPDATE private.kinto_privacy_media_jobs_v1 SET state='pending',attempts=3 WHERE id=(SELECT(job->>'id')::uuid FROM claimed);
SELECT public.test_assert((SELECT public.kinto_privacy_media_claim_v1('test-admin',request_id)->>'held'FROM private.kinto_privacy_media_jobs_v1 WHERE id=(SELECT(job->>'id')::uuid FROM claimed))='true','retries bounded before more Storage calls');
ROLLBACK TO attempt_limit;

SELECT public.test_denied($q$DELETE FROM public.product_review_images WHERE id='00000000-0000-4000-8000-000000000061'$q$,'PRIVACY_MEDIA_IN_PROGRESS');
SELECT public.test_denied($q$UPDATE public.product_review_images SET storage_path='changed.png'WHERE id='00000000-0000-4000-8000-000000000061'$q$,'PRIVACY_MEDIA_IN_PROGRESS');
SELECT public.test_denied($q$SELECT public.kinto_deletion_request_v1('test-TEST-B','cancel')$q$,'PRIVACY_DELETION_ALREADY_STARTED');
SELECT public.test_denied(format('SELECT public.kinto_privacy_media_finish_v1(%L,%L,%L,%L,true)','test-admin',(SELECT request_id FROM private.kinto_privacy_media_jobs_v1 LIMIT 1),(SELECT job->>'id'FROM claimed),'00000000-0000-4000-8000-000000000000'),'PRIVACY_MEDIA_LEASE_INVALID');
-- Failure preserves source and payload and makes the item retryable.
SELECT public.kinto_privacy_media_finish_v1('test-admin',(SELECT request_id FROM private.kinto_privacy_media_jobs_v1 LIMIT 1),(SELECT(job->>'id')::uuid FROM claimed),(SELECT(job->>'lease')::uuid FROM claimed),false);
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.product_review_images WHERE id='00000000-0000-4000-8000-000000000061'),'failed storage removal preserves source');
UPDATE claimed SET job=public.kinto_privacy_media_claim_v1('test-admin',(SELECT request_id FROM private.kinto_privacy_media_jobs_v1 LIMIT 1));
-- Synthetic service acknowledgement only. This SQL test never calls Storage.
SELECT public.kinto_privacy_media_finish_v1('test-admin',(SELECT request_id FROM private.kinto_privacy_media_jobs_v1 LIMIT 1),(SELECT(job->>'id')::uuid FROM claimed),(SELECT(job->>'lease')::uuid FROM claimed),true);
SELECT public.test_assert((SELECT public.kinto_privacy_media_finish_v1('test-admin',request_id,(SELECT(job->>'id')::uuid FROM claimed),(SELECT(job->>'lease')::uuid FROM claimed),true)->>'duplicate'FROM private.kinto_privacy_media_jobs_v1 WHERE state='removed')='true','repeat completion idempotent');
UPDATE claimed SET job=public.kinto_privacy_media_claim_v1('test-admin',(SELECT request_id FROM private.kinto_privacy_media_jobs_v1 LIMIT 1));
SELECT public.test_assert((SELECT job->>'kind'FROM claimed)='database','legacy DB payload planned separately');
SELECT public.kinto_privacy_media_finish_v1('test-admin',(SELECT request_id FROM private.kinto_privacy_media_jobs_v1 LIMIT 1),(SELECT(job->>'id')::uuid FROM claimed),(SELECT(job->>'lease')::uuid FROM claimed),true);
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.product_review_image_payloads WHERE image_id='00000000-0000-4000-8000-000000000062'),'owned legacy image bytes actually removed by image cascade');
SELECT public.test_assert((SELECT count(*)FROM private.kinto_privacy_media_jobs_v1 WHERE state='removed'AND object_path IS NULL)=2,'completed queue sheds source paths');
SELECT public.test_assert((SELECT orders FROM media_preserved)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'all orders unchanged');
SELECT public.test_assert((SELECT other_image FROM media_preserved)=(SELECT to_jsonb(i)FROM public.product_review_images i WHERE id='00000000-0000-4000-8000-000000000063'),'other customer image untouched');
SELECT public.test_assert((SELECT other_customer FROM media_preserved)=(SELECT to_jsonb(c)FROM public.customers c WHERE code='TEST-A'),'other customer untouched');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000002'AND status='deleted'),'media completion does not claim account deletion');
ROLLBACK;
SELECT 'PASS_PRIVACY_MEDIA_SQL: disabled default, service-only paths, verified owner, source freeze, cancellation race guard, retry/lease/idempotency, DB bytes removed, other owner and orders preserved, no false account completion';
