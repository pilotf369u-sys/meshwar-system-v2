-- Synthetic transaction only: reproduce relevant types observed in the owner's metadata.
-- This is NOT a full production clone and is never applied to production.
\set ON_ERROR_STOP on
BEGIN;
ALTER TABLE public.orders DROP CONSTRAINT orders_customer_id_fkey;
ALTER TABLE public.orders ALTER COLUMN customer_id TYPE text USING customer_id::text;
ALTER TABLE public.orders ALTER COLUMN details TYPE text USING details::text;
ALTER TABLE public.order_store_segments ADD COLUMN customer_snapshot jsonb;
CREATE TABLE public.customer_portal_sessions(token_hash text PRIMARY KEY,customer_id uuid,expires_at timestamptz,created_at timestamptz);
CREATE TABLE IF NOT EXISTS public.messages(id bigint PRIMARY KEY,created_at timestamptz,customer_id uuid,employee_id uuid,sender_type text,message text,file_url text,read_by_employee boolean,read_by_customer boolean);
CREATE TABLE private.kinto_world_orders_v1(id uuid PRIMARY KEY,order_no bigint,customer_id uuid NOT NULL,request_key uuid,request jsonb,estimates jsonb,state text,revision bigint,quote jsonb,payment jsonb,purchase jsonb,created_at timestamptz,updated_at timestamptz);
INSERT INTO public.customer_portal_sessions VALUES('synthetic-portal-A','00000000-0000-4000-8000-000000000001',now()+interval '1 hour',now());
INSERT INTO public.messages VALUES(1,now(),'00000000-0000-4000-8000-000000000001',NULL,'customer','TEST private support message',NULL,false,true);
INSERT INTO private.kinto_world_orders_v1(id,customer_id,request,state)VALUES('00000000-0000-4000-8000-000000000040','00000000-0000-4000-8000-000000000002','{"contact":{"name":"TEST B","phone":"00002","address":"TEST only"}}','delivered');
CREATE TEMP TABLE observed_operations_before AS SELECT
 (SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)orders,
 (SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM private.kinto_world_orders_v1 o)world_orders,
 (SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.messages o)messages,
 (SELECT jsonb_agg(to_jsonb(o)ORDER BY customer_id)FROM public.customer_portal_sessions o)portal_sessions;
-- Existing shipped review eligibility must still work with real observed text types.
SELECT public.test_assert(public.kinto_review_submit_v1('test-TEST-B','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000020',5::smallint,'TEST observed text-schema review','2026-10-25')->>'id'IS NOT NULL,'review submit accepts observed text order identity/details');
SELECT public.kinto_review_consent_v1('test-TEST-A','2026-10-25',true);
SELECT public.test_denied($q$SELECT public.kinto_review_submit_v1('test-TEST-A','00000000-0000-4000-8000-000000000030','00000000-0000-4000-8000-000000000020',5::smallint,'TEST cannot own B order','2026-10-25')$q$,'DELIVERED_ORDER_NOT_FOUND');
SELECT public.kinto_deletion_request_v1('test-TEST-A','request',true);
SELECT public.kinto_privacy_admin_v1('test-admin','deletions',(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000001'AND status IN('pending','verified','manual_review')),'verify','TEST ownership verified; observed schema must hold');
-- Fixture-only policy approval demonstrates that even approval cannot bypass unknown links.
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(public.kinto_deletion_preflight_v1('test-admin',(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000001'AND status='verified'))->'holds')h WHERE h->>'relation'='public.customer_portal_sessions'),'second real-observed session path detected');
SELECT public.test_assert(NOT(public.kinto_deletion_execute_v1('test-admin',(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000001'AND status='verified'),(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000001'AND status='verified'))->>'ok')::boolean,'unreviewed observed schema cannot erase account');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.customers WHERE code='TEST-A'),'customer not accidentally erased');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.customer_review_sessions WHERE token_hash=digest('test-TEST-A','sha256')),'primary session not changed by held erasure');
SELECT public.test_assert((SELECT orders FROM observed_operations_before)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'local orders unchanged');
SELECT public.test_assert((SELECT world_orders FROM observed_operations_before)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM private.kinto_world_orders_v1 o),'global orders including embedded contact unchanged');
SELECT public.test_assert((SELECT messages FROM observed_operations_before)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.messages o),'support messages unchanged');
SELECT public.test_assert((SELECT portal_sessions FROM observed_operations_before)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY customer_id)FROM public.customer_portal_sessions o),'secondary sessions unchanged');
ROLLBACK;
SELECT 'PASS_OBSERVED_SCHEMA: text order types support shipped review ownership; secondary sessions and logical links block erasure; local/global orders, chat and sessions unchanged';
