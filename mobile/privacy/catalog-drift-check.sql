-- Disposable PostgreSQL only. Every change below rolls back; no existing function survives changed.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE signature_before AS SELECT private.kinto_erasure_signature_v1()sig;
-- Snapshot approved signature before each savepoint, avoiding type/column-only coverage.
SAVEPOINT constraint_drift;
ALTER TABLE public.orders ADD CONSTRAINT privacy_test_constraint CHECK(status IS NOT NULL) NOT VALID;
SELECT public.test_assert(private.kinto_erasure_signature_v1()<>(SELECT sig FROM signature_before),'constraint-only drift invalidates approval');
ROLLBACK TO constraint_drift;
SELECT public.test_assert(private.kinto_erasure_signature_v1()=(SELECT sig FROM signature_before),'constraint rollback restores signature');
SAVEPOINT trigger_state_drift;
ALTER TABLE public.product_reviews DISABLE TRIGGER kinto_review_terms_v1;
SELECT public.test_assert(private.kinto_erasure_signature_v1()<>(SELECT sig FROM signature_before),'disabled trigger invalidates approval');
ROLLBACK TO trigger_state_drift;
SAVEPOINT function_drift;
CREATE OR REPLACE FUNCTION private.kinto_review_terms_guard_v1() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$BEGIN RETURN NEW;END$$;
SELECT public.test_assert(private.kinto_erasure_signature_v1()<>(SELECT sig FROM signature_before),'function-only replacement invalidates approval');
ROLLBACK TO function_drift;
SAVEPOINT rls_drift;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
SELECT public.test_assert(private.kinto_erasure_signature_v1()<>(SELECT sig FROM signature_before),'RLS-only drift invalidates approval');
ROLLBACK TO rls_drift;
SAVEPOINT policy_drift;
CREATE POLICY privacy_test_policy ON public.customers USING(true);
SELECT public.test_assert(private.kinto_erasure_signature_v1()<>(SELECT sig FROM signature_before),'policy-only drift invalidates approval');
ROLLBACK TO policy_drift;
SELECT public.test_assert(private.kinto_erasure_signature_v1()=(SELECT sig FROM signature_before),'all drift tests restored');
SAVEPOINT storage_policy_drift;
CREATE POLICY privacy_test_storage_policy ON storage.buckets FOR SELECT TO anon USING(true);
SELECT public.test_assert(private.kinto_erasure_signature_v1()<>(SELECT sig FROM signature_before),'Storage-policy-only change invalidates approval');
ROLLBACK TO storage_policy_drift;
SAVEPOINT versioning_configuration_drift;
UPDATE storage.buckets SET versioning_status='ENABLED'WHERE id='product-review-images';
SELECT public.test_assert(private.kinto_erasure_signature_v1()<>(SELECT sig FROM signature_before),'versioning-status-only change invalidates approval');
ROLLBACK TO versioning_configuration_drift;
SAVEPOINT bucket_configuration_drift;
UPDATE storage.buckets SET public=NOT public WHERE id='product-review-images';
SELECT public.test_assert(private.kinto_erasure_signature_v1()<>(SELECT sig FROM signature_before),'relevant bucket configuration change invalidates approval');
ROLLBACK TO bucket_configuration_drift;
SELECT public.test_assert(private.kinto_erasure_signature_v1()=(SELECT sig FROM signature_before),'Storage drift tests restore signature');
-- The executor must reject stale approval before reaching any data mutation.
SAVEPOINT stale_approval;
ALTER TABLE public.product_reviews DISABLE TRIGGER kinto_review_terms_v1;
SELECT public.test_denied(format('SELECT public.kinto_deletion_execute_v1(%L,%L,%L)','test-admin',(SELECT id FROM private.kinto_deletion_requests_v1 ORDER BY created_at LIMIT 1),(SELECT id FROM private.kinto_deletion_requests_v1 ORDER BY created_at LIMIT 1)),'POLICY_OR_INVENTORY_NOT_VERIFIED');
ROLLBACK TO stale_approval;
ROLLBACK;
SELECT 'PASS_PRIVACY_CATALOG_DRIFT: constraints, trigger state, function bodies, RLS and policies invalidate approval; stale approval denied before writes; all changes rolled back';
