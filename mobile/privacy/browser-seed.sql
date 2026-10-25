\set ON_ERROR_STOP on
DELETE FROM private.kinto_review_reports_v1;DELETE FROM private.kinto_review_blocks_v1;
DELETE FROM public.product_reviews;DELETE FROM private.kinto_review_consents_v1;
INSERT INTO public.customer_review_sessions(customer_id,token_hash,expires_at)SELECT id,digest('test-'||code,'sha256'),now()+interval '1 hour'FROM public.customers WHERE code IN('TEST-A','TEST-B')AND NOT EXISTS(SELECT 1 FROM public.customer_review_sessions s WHERE s.token_hash=digest('test-'||customers.code,'sha256'));
