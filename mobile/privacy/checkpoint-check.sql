-- Synthetic minimal deletion evidence only. Transaction rolls back every fixture row.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE checkpoint_preserved AS SELECT(SELECT md5(jsonb_agg(to_jsonb(c)ORDER BY id)::text)FROM public.customers c)customers,(SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o)orders;
INSERT INTO private.kinto_deletion_requests_v1(id,status)VALUES('00000000-0000-4000-8000-000000000088','deleted');
INSERT INTO private.kinto_erasure_ledger_v1(request_id,customer_hash)VALUES('00000000-0000-4000-8000-000000000088',repeat('a',64));
INSERT INTO private.kinto_privacy_media_ledger_v1(request_id,bucket,path_hash)VALUES('00000000-0000-4000-8000-000000000088','product-review-images',repeat('b',64));
INSERT INTO private.kinto_privacy_chat_decisions_v1(request_id,message_id,content_hash,state,note,reviewed_by,erased_key_hash,erased_at)VALUES('00000000-0000-4000-8000-000000000088',9001,repeat('e',64),'erased',NULL,'00000000-0000-4000-8000-000000000089',repeat('c',64),now());
-- A retained decision and its private note must never enter external erasure evidence.
INSERT INTO private.kinto_privacy_chat_decisions_v1(request_id,message_id,content_hash,state,note,review_on,reviewed_by)VALUES('00000000-0000-4000-8000-000000000088',9002,repeat('d',64),'retained','TEST private retention note',now()+interval '30 days','00000000-0000-4000-8000-000000000089');
CREATE TEMP TABLE exported_checkpoint AS SELECT private.kinto_privacy_checkpoint_v1() value;
SELECT public.test_assert((SELECT value->>'sha256'FROM exported_checkpoint)=(SELECT encode(digest(convert_to(value->>'payload_text','UTF8'),'sha256'),'hex')FROM exported_checkpoint),'digest binds exact UTF8 payload');
SELECT public.test_assert((SELECT(value->>'payload_text')::jsonb->'counts'FROM exported_checkpoint)=jsonb_build_object('accounts',(SELECT count(*)FROM private.kinto_erasure_ledger_v1),'review_media',(SELECT count(*)FROM private.kinto_privacy_media_ledger_v1),'chat_text',(SELECT count(*)FROM private.kinto_privacy_chat_decisions_v1 WHERE state='erased'),'review_records',(SELECT count(*)FROM private.kinto_privacy_review_decisions_v1 WHERE state='erased')),'all ledger counts agree with one snapshot');
SELECT public.test_assert((SELECT value->>'payload_text'FROM exported_checkpoint)NOT LIKE '%00000000-0000-4000-8000-000000000088%'AND(SELECT value->>'payload_text'FROM exported_checkpoint)NOT LIKE '%TEST private retention note%'AND(SELECT value->>'payload_text'FROM exported_checkpoint)NOT LIKE '%"message_id"%','no receipt owner raw message id or retained note exported');
SELECT public.test_assert((SELECT(value->>'payload_text')::jsonb->>'restore_authorized'FROM exported_checkpoint)='false','export never authorizes restore');
SELECT public.test_assert(NOT has_function_privilege('anon','private.kinto_privacy_checkpoint_v1(integer)','EXECUTE')AND NOT has_function_privilege('authenticated','private.kinto_privacy_checkpoint_v1(integer)','EXECUTE')AND NOT has_function_privilege('service_role','private.kinto_privacy_checkpoint_v1(integer)','EXECUTE'),'owner-only no public service export');
SELECT public.test_denied('SELECT private.kinto_privacy_checkpoint_v1(NULL)','INVALID_CHECKPOINT_LIMIT');
SELECT public.test_denied('SELECT private.kinto_privacy_checkpoint_v1(10001)','INVALID_CHECKPOINT_LIMIT');
SAVEPOINT too_large;
INSERT INTO private.kinto_erasure_ledger_v1(request_id,customer_hash)VALUES('00000000-0000-4000-8000-000000000088',repeat('f',64));
SELECT public.test_denied('SELECT private.kinto_privacy_checkpoint_v1(1)','CHECKPOINT_TOO_LARGE_NO_PARTIAL_EXPORT');
ROLLBACK TO too_large;
-- Test-export file goes only to ephemeral CI /tmp; never uploaded as an artifact.
\pset format unaligned
\pset tuples_only on
\o /tmp/kinto-erasure-checkpoint-fixture.json
SELECT value FROM exported_checkpoint;
\o
\pset tuples_only off
\pset format aligned
SELECT public.test_assert((SELECT customers FROM checkpoint_preserved)=(SELECT md5(jsonb_agg(to_jsonb(c)ORDER BY id)::text)FROM public.customers c),'export preserves every customer');
SELECT public.test_assert((SELECT orders FROM checkpoint_preserved)=(SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o),'export preserves every order');
ROLLBACK;
SELECT 'PASS_ERASURE_CHECKPOINT: one owner-only snapshot, complete bounded ledgers, exact UTF8 digest, no raw identities/text or public permissions; no mutations or restore authorization';
BEGIN READ ONLY;
SELECT public.test_assert(current_setting('transaction_read_only')='on','checkpoint executes in actual read-only transaction');
SELECT public.test_assert(private.kinto_privacy_checkpoint_v1()->>'sha256'~'^[0-9a-f]{64}$','checkpoint export works without any write privileges from the transaction');
COMMIT;
