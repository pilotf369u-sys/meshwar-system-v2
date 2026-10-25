\set ON_ERROR_STOP on
CREATE TEMP TABLE privacy_rollback_counts AS SELECT (SELECT count(*)FROM private.kinto_deletion_requests_v1)requests,(SELECT count(*)FROM private.kinto_review_reports_v1)reports,(SELECT count(*)FROM private.kinto_erasure_ledger_v1)ledger;
\ir ../../sql/kinto-privacy-media-rollback-v1.sql
\ir ../../sql/kinto-privacy-controls-rollback-v1.sql
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname IN('kinto_review_terms_v1','kinto_review_image_terms_v1')),'only added consent triggers removed');
SELECT public.test_assert(NOT has_function_privilege('anon','public.kinto_deletion_request_v1(text,text,boolean)','EXECUTE'),'new RPC disabled');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM private.kinto_erasure_policy_v1 WHERE enabled),'erasure disabled');
SELECT public.test_assert((SELECT requests FROM privacy_rollback_counts)=(SELECT count(*)FROM private.kinto_deletion_requests_v1),'request records preserved');
SELECT public.test_assert((SELECT reports FROM privacy_rollback_counts)=(SELECT count(*)FROM private.kinto_review_reports_v1),'report records preserved');
SELECT public.test_assert((SELECT payload FROM public.test_preservation_snapshot WHERE kind='orders')=(SELECT md5(jsonb_agg(to_jsonb(o)ORDER BY id)::text)FROM public.orders o),'orders unchanged after rollback');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM jsonb_each_text((SELECT payload::jsonb FROM public.test_preservation_snapshot WHERE kind='functions'))b WHERE md5(pg_get_functiondef(b.key::regprocedure))<>b.value),'existing function bodies unchanged after rollback');
SELECT public.test_assert(NOT has_function_privilege('service_role','public.kinto_privacy_media_claim_v1(text,uuid)','EXECUTE'),'media service worker disabled');
SELECT public.test_assert((SELECT ledger FROM privacy_rollback_counts)=(SELECT count(*)FROM private.kinto_erasure_ledger_v1),'restore tombstones preserved by rollback');
SELECT 'PASS_PRIVACY_ROLLBACK: added entry points disabled; queues, original functions and orders preserved';
