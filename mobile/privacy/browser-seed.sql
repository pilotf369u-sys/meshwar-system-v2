\set ON_ERROR_STOP on
DELETE FROM private.kinto_review_reports_v1;DELETE FROM private.kinto_review_blocks_v1;
DELETE FROM public.product_reviews;DELETE FROM private.kinto_review_consents_v1;
INSERT INTO public.customer_review_sessions(customer_id,token_hash,expires_at)SELECT id,digest('test-'||code,'sha256'),now()+interval '1 hour'FROM public.customers WHERE code IN('TEST-A','TEST-B')AND NOT EXISTS(SELECT 1 FROM public.customer_review_sessions s WHERE s.token_hash=digest('test-'||customers.code,'sha256'));

CREATE TABLE IF NOT EXISTS public.messages(id bigint PRIMARY KEY,created_at timestamptz DEFAULT now(),customer_id uuid,employee_id uuid,sender_type text,message text,file_url text,read_by_employee boolean,read_by_customer boolean);
INSERT INTO public.messages(id,customer_id,sender_type,message,file_url)VALUES
 (101,'00000000-0000-4000-8000-000000000001','customer','TEST chat <img src=x onerror=window.chatInjected=1>',NULL),
 (102,'00000000-0000-4000-8000-000000000001','customer','TEST file evidence','https://example.invalid/receipt.png'),
 (201,'00000000-0000-4000-8000-000000000002','customer','TEST other conversation',NULL);
-- Synthetic invoice fixture for the actual admin assessment UI. Existing order unchanged.
ALTER TABLE public.order_store_segments ADD COLUMN customer_snapshot jsonb;
INSERT INTO public.order_store_segments(id,order_id,store_id,items_snapshot,customer_snapshot)VALUES('00000000-0000-4000-8000-000000000081','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000010','[]','{"name":"TEST frozen invoice name"}');
\ir owner-invoice-contract-fixture.sql
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
