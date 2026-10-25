-- Isolated projection of the observed preference ownership keys; not a full production clone.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.customer_local_carts(customer_id uuid PRIMARY KEY REFERENCES public.customers(id)ON DELETE CASCADE,items jsonb,updated_at timestamptz,revision_v189 bigint);
CREATE TABLE public.customer_favorite_lists(id uuid PRIMARY KEY,customer_id uuid NOT NULL REFERENCES public.customers(id)ON DELETE CASCADE,name text,UNIQUE(id,customer_id));
CREATE TABLE public.customer_favorite_items(id uuid PRIMARY KEY,list_id uuid,customer_id uuid,store_id uuid REFERENCES public.local_stores(id),product_id uuid REFERENCES public.local_products(id),FOREIGN KEY(list_id,customer_id)REFERENCES public.customer_favorite_lists(id,customer_id)ON UPDATE CASCADE ON DELETE CASCADE);
CREATE TABLE public.customer_notification_reads_v155(customer_id uuid REFERENCES public.customers(id)ON DELETE CASCADE,notification_key text,read_at timestamptz,PRIMARY KEY(customer_id,notification_key));
INSERT INTO public.customers VALUES('00000000-0000-4000-8000-000000000070','TEST preferences','00070','prefs@example.invalid','TEST-PREF','TEST-PASSWORD');
INSERT INTO public.customer_review_sessions(customer_id,token_hash,expires_at)VALUES('00000000-0000-4000-8000-000000000070',digest('test-TEST-PREF','sha256'),now()+interval '1 hour');
INSERT INTO public.customer_local_carts VALUES('00000000-0000-4000-8000-000000000070','[{"product":"TEST"}]',now(),1),('00000000-0000-4000-8000-000000000002','[{"product":"OTHER"}]',now(),2);
INSERT INTO public.customer_favorite_lists VALUES('00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000070','TEST target'),('00000000-0000-4000-8000-000000000072','00000000-0000-4000-8000-000000000002','TEST other');
INSERT INTO public.customer_favorite_items VALUES('00000000-0000-4000-8000-000000000073','00000000-0000-4000-8000-000000000071','00000000-0000-4000-8000-000000000070',NULL,NULL),('00000000-0000-4000-8000-000000000074','00000000-0000-4000-8000-000000000072','00000000-0000-4000-8000-000000000002',NULL,NULL);
INSERT INTO public.customer_notification_reads_v155 VALUES('00000000-0000-4000-8000-000000000070','TEST-notice',now()),('00000000-0000-4000-8000-000000000002','OTHER-notice',now());
INSERT INTO private.kinto_review_blocks_v1(customer_id,blocked_customer_id)VALUES('00000000-0000-4000-8000-000000000070','00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000070');
CREATE TEMP TABLE preferences_before AS SELECT
 (SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)orders,
 (SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.local_products o)products,
 (SELECT to_jsonb(c)FROM public.customers c WHERE code='TEST-B')other_customer,
 (SELECT to_jsonb(c)FROM public.customer_local_carts c WHERE customer_id='00000000-0000-4000-8000-000000000002')other_cart,
 (SELECT to_jsonb(c)FROM public.customer_favorite_items c WHERE id='00000000-0000-4000-8000-000000000074')other_favorite,
 (SELECT to_jsonb(c)FROM public.customer_notification_reads_v155 c WHERE customer_id='00000000-0000-4000-8000-000000000002')other_notice;
SELECT public.kinto_deletion_request_v1('test-TEST-PREF','request',true);
SELECT public.kinto_privacy_admin_v1('test-admin','deletions',(SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000070'),'verify','TEST verified preference profile');
SELECT id AS pref_request FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000070' \gset
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_assert(private.kinto_privacy_preferences_ready_v1(),'observed UUID/composite preference ownership accepted');
SAVEPOINT unknown_financial_column;
ALTER TABLE public.customer_local_carts ADD COLUMN held_payment_amount numeric DEFAULT 123;
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_assert(NOT private.kinto_privacy_preferences_ready_v1(),'reapproved schema with unknown financial preference column is not eligible');
SELECT public.test_denied($q$SELECT private.kinto_privacy_preferences_purge_v1('00000000-0000-4000-8000-000000000070')$q$,'PREFERENCE_SCHEMA_NOT_VERIFIED');
SELECT public.test_assert((SELECT held_payment_amount FROM public.customer_local_carts WHERE customer_id='00000000-0000-4000-8000-000000000070')=123,'unknown amount remains untouched');
ROLLBACK TO unknown_financial_column;
SAVEPOINT changed_preference_type;
ALTER TABLE public.customer_local_carts ALTER COLUMN items TYPE text USING items::text;
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_assert(NOT private.kinto_privacy_preferences_ready_v1(),'known preference column with changed type remains unqualified');
ROLLBACK TO changed_preference_type;
SAVEPOINT inherited_preference;
CREATE TABLE public.test_inherited_cart()INHERITS(public.customer_local_carts);
SELECT public.test_assert(NOT private.kinto_privacy_preferences_ready_v1(),'inherited preference table cannot widen exact-owner erasure');
ROLLBACK TO inherited_preference;
SAVEPOINT unknown_managed_cascade;
ALTER TABLE public.customer_favorite_items ADD CONSTRAINT test_unknown_internal_cascade FOREIGN KEY(store_id)REFERENCES public.customer_favorite_lists(id)ON DELETE CASCADE;
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_assert(NOT private.kinto_privacy_preferences_ready_v1(),'unexpected cascade between otherwise managed tables cannot bypass ownership review');
SELECT public.test_denied($q$SELECT private.kinto_privacy_preferences_purge_v1('00000000-0000-4000-8000-000000000070')$q$,'PREFERENCE_SCHEMA_NOT_VERIFIED');
ROLLBACK TO unknown_managed_cascade;
SAVEPOINT unknown_cascade;
CREATE TABLE public.test_preference_financial_child(list_id uuid REFERENCES public.customer_favorite_lists(id)ON DELETE CASCADE,amount numeric);
INSERT INTO public.test_preference_financial_child VALUES('00000000-0000-4000-8000-000000000071',123);
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_assert(NOT private.kinto_privacy_preferences_ready_v1(),'unknown cascading child cannot be treated as preferences');
SELECT public.test_assert(public.kinto_deletion_execute_v1('test-admin',:'pref_request',:'pref_request')->>'status'='manual_review','even refreshed policy cannot bypass unreviewed dependency');
SELECT public.test_assert((SELECT amount FROM public.test_preference_financial_child)=123,'unreviewed associated amount not deleted');
ROLLBACK TO unknown_cascade;
SAVEPOINT unknown_trigger;
CREATE FUNCTION public.test_preference_delete_guard()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN OLD;END$$;
CREATE TRIGGER test_preference_delete BEFORE DELETE ON public.customer_local_carts FOR EACH ROW EXECUTE FUNCTION public.test_preference_delete_guard();
SELECT public.test_assert(NOT private.kinto_privacy_preferences_ready_v1(),'unreviewed DELETE trigger holds cleanup');
ROLLBACK TO unknown_trigger;
SAVEPOINT failure_after_cleanup;
CREATE FUNCTION public.test_final_delete_failure()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF OLD.id='00000000-0000-4000-8000-000000000070'THEN RAISE EXCEPTION 'TEST_FINAL_DELETE_FAILURE';END IF;RETURN OLD;END$$;
CREATE TRIGGER test_final_delete BEFORE DELETE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.test_final_delete_failure();
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_denied(format('SELECT public.kinto_deletion_execute_v1(%L,%L,%L)','test-admin',:'pref_request',:'pref_request'),'TEST_FINAL_DELETE_FAILURE');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.customer_local_carts WHERE customer_id='00000000-0000-4000-8000-000000000070'),'failed final deletion rolls back preference removal');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.customer_review_sessions WHERE token_hash=digest('test-TEST-PREF','sha256')),'failed final deletion restores live session');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM private.kinto_erasure_ledger_v1 WHERE request_id=:'pref_request'),'failed deletion never emits a completed restore tombstone');
ROLLBACK TO failure_after_cleanup;
SELECT public.test_assert(public.kinto_deletion_execute_v1('test-admin',:'pref_request',:'pref_request')->>'status'='deleted','actual fresh profile and preferences removed');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.customers WHERE code='TEST-PREF'),'account row removed');
SELECT public.test_assert((SELECT verification_note IS NULL AND customer_id IS NULL FROM private.kinto_deletion_requests_v1 WHERE id=:'pref_request'),'completed receipt sheds verification note and customer link');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.customer_favorite_items WHERE customer_id='00000000-0000-4000-8000-000000000070'),'owned favorite items removed');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM private.kinto_review_blocks_v1 WHERE customer_id='00000000-0000-4000-8000-000000000070'OR blocked_customer_id='00000000-0000-4000-8000-000000000070'),'only block links to erased account removed');
SELECT public.test_assert(public.kinto_deletion_execute_v1('test-admin',:'pref_request',:'pref_request')->>'duplicate'='true','repeat request does not duplicate ledger');
SELECT public.test_assert((SELECT count(*)FROM private.kinto_erasure_ledger_v1 WHERE request_id=:'pref_request')=1,'one atomic minimal tombstone');
SELECT public.test_assert(NOT has_table_privilege('anon','private.kinto_erasure_ledger_v1','SELECT'),'anonymous cannot read restore ledger');
SELECT public.test_assert(NOT has_function_privilege('authenticated','private.kinto_privacy_erasure_ledger_export_v1(bigint,integer)','EXECUTE'),'no customer-facing ledger export');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(private.kinto_privacy_erasure_ledger_export_v1())x WHERE x?'phone'OR x?'email'OR x?'customer_id'OR x?'password'),'export contains no raw account identity or token');
SELECT public.test_assert(jsonb_array_length(private.kinto_privacy_erasure_ledger_export_v1(0,1))=1,'operator export is paginated');
-- A DB rollback/old backup alone loses later tombstones. Operator must preserve an external copy.
-- Simulate restored identity row; detection is read-only and never authorizes opening the database.
INSERT INTO public.customers VALUES('00000000-0000-4000-8000-000000000070','TEST restored copy','00070','restore@example.invalid','TEST-RESTORED','TEST-PASSWORD');
SELECT public.test_denied(format('SELECT public.kinto_deletion_execute_v1(%L,%L,%L)','test-admin',:'pref_request',:'pref_request'),'ERASED_ACCOUNT_REAPPEARED');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.customers WHERE id='00000000-0000-4000-8000-000000000070'),'restored profile is not silently erased by an old request retry');
SAVEPOINT missing_receipt;
DELETE FROM private.kinto_erasure_ledger_v1 WHERE request_id=:'pref_request';
SELECT public.test_denied(format('SELECT public.kinto_deletion_execute_v1(%L,%L,%L)','test-admin',:'pref_request',:'pref_request'),'ACCOUNT_ERASURE_EVIDENCE_REQUIRED');
ROLLBACK TO missing_receipt;
SELECT public.test_assert(jsonb_array_length(private.kinto_privacy_restore_matches_v1((SELECT jsonb_build_array(customer_hash)FROM private.kinto_erasure_ledger_v1 WHERE request_id=:'pref_request'))->'matched_hashes')=1,'external deletion hash detects resurrected row');
SELECT public.test_assert(private.kinto_privacy_restore_matches_v1((SELECT jsonb_build_array(customer_hash)FROM private.kinto_erasure_ledger_v1 WHERE request_id=:'pref_request'))->>'restore_authorized'='false','partial ledger scan cannot approve restore');
SELECT public.test_denied($q$SELECT private.kinto_privacy_restore_matches_v1('[]')$q$,'EXTERNAL_ERASURE_LEDGER_REQUIRED');
SELECT public.test_denied($q$SELECT private.kinto_privacy_restore_matches_v1('["not-a-hash"]')$q$,'EXTERNAL_ERASURE_LEDGER_REQUIRED');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.customers WHERE code='TEST-RESTORED'),'restore detection itself is read-only');
SELECT public.test_assert((SELECT orders FROM preferences_before)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'orders unchanged');
SELECT public.test_assert((SELECT products FROM preferences_before)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.local_products o),'product catalog unchanged');
SELECT public.test_assert((SELECT other_customer FROM preferences_before)=(SELECT to_jsonb(c)FROM public.customers c WHERE code='TEST-B'),'other account unchanged');
SELECT public.test_assert((SELECT other_cart FROM preferences_before)=(SELECT to_jsonb(c)FROM public.customer_local_carts c WHERE customer_id='00000000-0000-4000-8000-000000000002'),'other cart unchanged');
SELECT public.test_assert((SELECT other_favorite FROM preferences_before)=(SELECT to_jsonb(c)FROM public.customer_favorite_items c WHERE id='00000000-0000-4000-8000-000000000074'),'other favorite unchanged');
SELECT public.test_assert((SELECT other_notice FROM preferences_before)=(SELECT to_jsonb(c)FROM public.customer_notification_reads_v155 c WHERE customer_id='00000000-0000-4000-8000-000000000002'),'other notice state unchanged');
ROLLBACK;
SELECT 'PASS_PRIVACY_PREFERENCES_RESTORE: exact-owner preferences and fresh profile erased atomically; unknown cascade/trigger holds; forced failure restores tokens/data and creates no false tombstone; other owner/orders/catalog unchanged; external hash detects restored row without authorizing restore';
