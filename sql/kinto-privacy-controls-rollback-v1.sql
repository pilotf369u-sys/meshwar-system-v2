-- Restore frontend first. Retain privacy reports/requests/audit rows; never recreate erased profiles.
BEGIN;
DROP TRIGGER IF EXISTS kinto_review_terms_v1 ON public.product_reviews;
DROP TRIGGER IF EXISTS kinto_review_image_terms_v1 ON public.product_review_images;
DO $$DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'AND p.proname IN('kinto_review_consent_v1','kinto_review_submit_v1','kinto_review_safety_v1','kinto_reviews_visible_v1','kinto_deletion_request_v1','kinto_privacy_admin_v1','kinto_deletion_preflight_v1','kinto_deletion_execute_v1')LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);END LOOP;END $$;
UPDATE private.kinto_erasure_policy_v1 SET enabled=false;
COMMIT;
