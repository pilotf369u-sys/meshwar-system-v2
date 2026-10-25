-- Synthetic request/progress only. No physical file or customer/account erasure.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE progress_preserved AS SELECT(SELECT jsonb_agg(to_jsonb(c)ORDER BY id)FROM public.customers c)customers,(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)orders;
SELECT public.kinto_deletion_request_v1('test-TEST-A','request',true);
SELECT id AS progress_request FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000001'AND status='pending' \gset
UPDATE private.kinto_erasure_policy_v1 SET enabled=false;
SELECT public.test_assert(public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')->0->>'cancellation_allowed'='true','unstarted pending request remains cancellable without enabling erasure');
SELECT public.test_assert(public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')->0->>'account_deleted'='false','request receipt alone is not account erasure');
SELECT public.test_assert(public.kinto_deletion_progress_v1('test-TEST-B',:'progress_request')='[]'::jsonb,'another customer cannot inspect request existence or progress');
SELECT public.test_denied($q$SELECT public.kinto_deletion_progress_v1('invalid-token')$q$,'SESSION_INVALID');
SELECT public.test_denied(format('SELECT public.kinto_deletion_progress_admin_v1(%L,%L)','test-TEST-A',:'progress_request'),'ADMIN_SESSION_INVALID');
SAVEPOINT simple_cancel;
SELECT public.kinto_deletion_request_v1('test-TEST-A','cancel');
SELECT public.test_assert(public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')->0->>'stage'='cancelled','normal cancellation before processing still works');
ROLLBACK TO simple_cancel;
INSERT INTO private.kinto_privacy_media_jobs_v1(id,request_id,customer_id,source_id,review_id,object_path,kind)VALUES('00000000-0000-4000-8000-000000000075',:'progress_request','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000076','00000000-0000-4000-8000-000000000077','reviews/00000000-0000-4000-8000-000000000077/TEST-placeholder.png','storage');
SELECT public.test_assert(public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')->0->>'cancellation_allowed'='true','preparation without any claim/attempt is not physical removal');
UPDATE private.kinto_privacy_media_jobs_v1 SET attempts=1,state='pending'WHERE id='00000000-0000-4000-8000-000000000075';
SELECT public.test_assert(public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')->0->>'stage'='processing','retry after attempted Storage work remains processing');
SELECT public.test_assert(public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')->0->>'partial_work_recorded'='false','attempted removal does not claim confirmed erasure');
SELECT public.test_denied($q$SELECT public.kinto_deletion_request_v1('test-TEST-A','cancel')$q$,'PRIVACY_DELETION_ALREADY_STARTED');
UPDATE private.kinto_privacy_media_jobs_v1 SET state='held'WHERE id='00000000-0000-4000-8000-000000000075';
SELECT public.test_denied($q$SELECT public.kinto_deletion_request_v1('test-TEST-A','cancel')$q$,'PRIVACY_DELETION_ALREADY_STARTED');
SELECT public.test_assert(public.kinto_deletion_progress_admin_v1('test-admin',:'progress_request')->>'cancellation_allowed'='false','admin and customer agree that uncertain prior work is not safely cancellable');
DELETE FROM private.kinto_privacy_media_jobs_v1 WHERE id='00000000-0000-4000-8000-000000000075';
INSERT INTO private.kinto_privacy_chat_decisions_v1(request_id,message_id,content_hash,state,note,review_on,reviewed_by)VALUES(:'progress_request',975,repeat('d',64),'retained','TEST private reason must not be exposed',now()+interval '30 days','00000000-0000-4000-8000-000000000099');
SELECT public.test_assert(public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')->0->>'retention_review_required'='true','retention review is shown separately from completion');
SELECT public.test_assert(public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')::text NOT LIKE '%TEST private reason%'AND public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')::text NOT LIKE '%content_hash%','customer sees no staff note or content fingerprint');
INSERT INTO private.kinto_privacy_chat_decisions_v1(request_id,message_id,content_hash,state,note,reviewed_by,erased_key_hash,erased_at)VALUES(:'progress_request',976,repeat('e',64),'erased',NULL,'00000000-0000-4000-8000-000000000099',repeat('f',64),now());
SELECT public.test_assert(public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')->0->>'partial_work_recorded'='true'AND public.kinto_deletion_progress_v1('test-TEST-A',:'progress_request')->0->>'account_deleted'='false','partial chat work can never mark full account deletion');
INSERT INTO private.kinto_deletion_requests_v1(id,status)VALUES('00000000-0000-4000-8000-000000000078','deleted');
SELECT public.test_assert(private.kinto_privacy_progress_v1('00000000-0000-4000-8000-000000000078')->>'account_deleted'='false','status label without ledger evidence is not completion');
SELECT public.test_assert((SELECT private.kinto_privacy_progress_v1(id)->>'account_deleted'FROM private.kinto_deletion_requests_v1 r WHERE status='deleted'AND EXISTS(SELECT 1 FROM private.kinto_erasure_ledger_v1 l WHERE l.request_id=r.id)LIMIT 1)='true','earlier actual fresh-profile finalization has its distinct completion receipt');
SAVEPOINT restored_profile_progress;
SELECT request_id AS completed_request FROM private.kinto_erasure_ledger_v1 l JOIN private.kinto_deletion_requests_v1 r ON r.id=l.request_id WHERE r.status='deleted'AND l.customer_hash=encode(digest('00000000-0000-4000-8000-000000000003','sha256'),'hex')LIMIT 1 \gset
-- The disposable bootstrap's erased TEST-FRESH profile has this known synthetic ID.
INSERT INTO public.customers(id,name,phone,code)VALUES('00000000-0000-4000-8000-000000000003','TEST restored profile','TEST restored phone','TEST-RESTORED');
SELECT public.test_assert(private.kinto_privacy_progress_v1(:'completed_request')->>'account_deleted'='false','past receipt cannot claim a restored profile remains absent');
SELECT public.test_assert(private.kinto_privacy_progress_v1(:'completed_request')->>'stage'='review_required','restored account requires reconciliation rather than completed label');
ROLLBACK TO restored_profile_progress;
SELECT public.test_assert((SELECT customers FROM progress_preserved)=(SELECT jsonb_agg(to_jsonb(c)ORDER BY id)FROM public.customers c),'all customer profiles unchanged');
SELECT public.test_assert((SELECT orders FROM progress_preserved)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'all orders unchanged');
ROLLBACK;
SELECT 'PASS_PRIVACY_PROGRESS: owner-scoped explicit status, no false partial completion, safe pre-work cancellation, uncertain retry/held cancellation blocked, private notes omitted and customer/order preservation';
