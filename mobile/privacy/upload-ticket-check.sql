-- Synthetic ticket metadata and service acknowledgement only. No actual Storage API.
\set ON_ERROR_STOP on
BEGIN;
SELECT public.kinto_privacy_admin_v1('test-admin','deletions',(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000002'),'verify','TEST completed upload cleanup');
SELECT id AS ticket_request FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000002' \gset
SELECT id AS ticket_review FROM public.product_reviews WHERE customer_id='00000000-0000-4000-8000-000000000002' \gset
INSERT INTO public.orders VALUES('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','تم التسليم','{}');
INSERT INTO public.product_reviews(id,customer_id,order_id,store_id,product_reference,product_name_snapshot,rating)VALUES('00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000010','TEST-ticket-other','TEST other owner',5);
INSERT INTO private.product_review_upload_tickets_v150(id,review_id,customer_id,storage_path,mime_type,byte_size,expires_at,used_at)VALUES
 ('00000000-0000-4000-8000-000000000080',:'ticket_review','00000000-0000-4000-8000-000000000002','reviews/'||:'ticket_review'||'/used-only.png','image/png',12,now()-interval '1 hour',now()-interval '2 hours'),
 ('00000000-0000-4000-8000-000000000081',:'ticket_review','00000000-0000-4000-8000-000000000002','reviews/'||:'ticket_review'||'/unused-only.png','image/png',12,now()-interval '1 hour',NULL),
 ('00000000-0000-4000-8000-000000000082','00000000-0000-4000-8000-000000000050','00000000-0000-4000-8000-000000000001','reviews/00000000-0000-4000-8000-000000000050/other.png','image/png',12,now()-interval '1 hour',now()-interval '2 hours');
CREATE TEMP TABLE ticket_preserved AS SELECT
 (SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)orders,
 (SELECT to_jsonb(t)FROM private.product_review_upload_tickets_v150 t WHERE id='00000000-0000-4000-8000-000000000082')other_ticket,
 (SELECT to_jsonb(t)FROM private.product_review_upload_tickets_v150 t WHERE id='00000000-0000-4000-8000-000000000081')unused_ticket;
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
INSERT INTO private.kinto_privacy_media_policy_v1 VALUES(true,true,private.kinto_erasure_signature_v1());
SELECT public.test_assert(public.kinto_privacy_media_prepare_v1('test-admin',:'ticket_request',:'ticket_request')->>'prepared'='2','only target tickets prepared');
SELECT public.test_assert((SELECT state FROM private.kinto_privacy_media_jobs_v1 WHERE source_id='00000000-0000-4000-8000-000000000081')='held','unused expired ticket is not evidence of finished upload');
SAVEPOINT shared_after_prepare;
INSERT INTO public.product_review_images(review_id,storage_path,mime_type,byte_size)VALUES('00000000-0000-4000-8000-000000000050','reviews/'||:'ticket_review'||'/used-only.png','image/png',12);
SELECT public.test_assert(public.kinto_privacy_media_claim_v1('test-admin',:'ticket_request')->>'held'='true','new reference from another review holds the ticket before Storage deletion');
SELECT public.test_assert(EXISTS(SELECT 1 FROM private.product_review_upload_tickets_v150 WHERE id='00000000-0000-4000-8000-000000000080'),'shared source ticket retained');
ROLLBACK TO shared_after_prepare;
CREATE TEMP TABLE ticket_claim AS SELECT public.kinto_privacy_media_claim_v1('test-admin',:'ticket_request')job;
SELECT public.test_assert((SELECT job->>'source_type'FROM ticket_claim)='upload_ticket','used unreferenced ticket claimed');
SELECT public.test_denied($q$UPDATE private.product_review_upload_tickets_v150 SET used_at=NULL WHERE id='00000000-0000-4000-8000-000000000080'$q$,'PRIVACY_MEDIA_IN_PROGRESS');
SELECT public.test_denied(format('INSERT INTO public.product_review_images(review_id,storage_path,mime_type,byte_size)VALUES(%L,%L,%L,12)',:'ticket_review','reviews/'||:'ticket_review'||'/used-only.png','image/png'),'PRIVACY_MEDIA_IN_PROGRESS');
-- A failed delete never consumes metadata needed for retry/reconciliation.
SELECT public.kinto_privacy_media_finish_v1('test-admin',:'ticket_request',(SELECT(job->>'id')::uuid FROM ticket_claim),(SELECT(job->>'lease')::uuid FROM ticket_claim),false);
SELECT public.test_assert(EXISTS(SELECT 1 FROM private.product_review_upload_tickets_v150 WHERE id='00000000-0000-4000-8000-000000000080'),'failed Storage operation preserves used ticket');
UPDATE ticket_claim SET job=public.kinto_privacy_media_claim_v1('test-admin',:'ticket_request');
SELECT public.kinto_privacy_media_finish_v1('test-admin',:'ticket_request',(SELECT(job->>'id')::uuid FROM ticket_claim),(SELECT(job->>'lease')::uuid FROM ticket_claim),true);
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM private.product_review_upload_tickets_v150 WHERE id='00000000-0000-4000-8000-000000000080'),'used ticket removed after synthetic verified Storage completion');
SELECT public.test_assert(public.kinto_privacy_media_claim_v1('test-admin',:'ticket_request')->>'held'='true','held uploads cannot look like completed account erasure');
SELECT public.test_assert((SELECT unused_ticket FROM ticket_preserved)=(SELECT to_jsonb(t)FROM private.product_review_upload_tickets_v150 t WHERE id='00000000-0000-4000-8000-000000000081'),'unused ticket and its object remain unmodified');
SELECT public.test_assert((SELECT other_ticket FROM ticket_preserved)=(SELECT to_jsonb(t)FROM private.product_review_upload_tickets_v150 t WHERE id='00000000-0000-4000-8000-000000000082'),'other customer ticket untouched');
SELECT public.test_assert((SELECT orders FROM ticket_preserved)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'orders unchanged');
SELECT public.test_assert((SELECT status FROM private.kinto_deletion_requests_v1 WHERE id=:'ticket_request')='verified','media ticket cleanup never reports account deleted');
SAVEPOINT unsafe_unused_image;
INSERT INTO public.product_review_images(review_id,storage_path,mime_type,byte_size)VALUES(:'ticket_review','reviews/'||:'ticket_review'||'/unused-only.png','image/png',12);
SELECT public.kinto_privacy_media_prepare_v1('test-admin',:'ticket_request',:'ticket_request');
SELECT public.test_assert(public.kinto_privacy_media_claim_v1('test-admin',:'ticket_request')->>'held'='true','attached image with unused upload authorization cannot be removed');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.product_review_images WHERE storage_path='reviews/'||:'ticket_review'||'/unused-only.png'),'unsafe unused image left intact');
ROLLBACK TO unsafe_unused_image;
ROLLBACK;
SELECT 'PASS_PRIVACY_UPLOAD_TICKETS: exact-owner completed uploads cleaned after verified acknowledgement, retry preserves metadata, new path references blocked during lease; unused uploads held, other owner and orders unchanged';
