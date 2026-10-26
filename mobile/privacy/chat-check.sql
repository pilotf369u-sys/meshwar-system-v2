-- Synthetic SQL only; no production chat or file operations.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.messages(id bigint PRIMARY KEY,created_at timestamptz DEFAULT now(),customer_id uuid,employee_id uuid,sender_type text,message text,file_url text,read_by_employee boolean,read_by_customer boolean);
INSERT INTO public.messages(id,customer_id,sender_type,message,file_url)VALUES
 (101,'00000000-0000-4000-8000-000000000001','customer','TEST erase one harmless text',NULL),
 (102,'00000000-0000-4000-8000-000000000001','customer','TEST retained payment evidence','https://example.invalid/chat-attachments/receipt.png'),
 (103,'00000000-0000-4000-8000-000000000001','employee','TEST text retain for specific claim',NULL),
 (201,'00000000-0000-4000-8000-000000000002','customer','TEST other conversation',NULL);
CREATE TEMP TABLE chat_before AS SELECT(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)orders,(SELECT to_jsonb(m)FROM public.messages m WHERE id=201)other_message,(SELECT to_jsonb(m)FROM public.messages m WHERE id=102)attachment_message;
SELECT public.kinto_deletion_request_v1('test-TEST-A','request',true);
SELECT id AS chat_request FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000001'AND status='pending' \gset
SELECT public.kinto_privacy_admin_v1('test-admin','deletions',:'chat_request','verify','TEST chat owner verified');
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1(),enabled=false;
SELECT public.test_assert(jsonb_array_length(public.kinto_privacy_chat_review_v1('test-admin',:'chat_request'))=3,'admin list scopes to selected customer only');
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_review_v1(%L,%L,%L,101,%L,%L)','test-admin',:'chat_request','approve_erase',(SELECT private.kinto_privacy_chat_hash_v1(to_jsonb(m))FROM public.messages m WHERE id=101),'TEST approved text'),'POLICY_OR_INVENTORY_NOT_VERIFIED');
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_review_v1(%L,%L,NULL,101,%L,%L)','test-admin',:'chat_request',(SELECT private.kinto_privacy_chat_hash_v1(to_jsonb(m))FROM public.messages m WHERE id=101),'TEST null action denied'),'INVALID_CHAT_REVIEW_ACTION');
UPDATE private.kinto_erasure_policy_v1 SET enabled=true;
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_review_v1(%L,%L)','test-TEST-A',:'chat_request'),'ADMIN_SESSION_INVALID');
SELECT public.test_assert(NOT has_function_privilege('anon','public.kinto_privacy_chat_erase_text_v1(text,uuid,bigint,bigint)','EXECUTE'),'browser cannot call service eraser directly');
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_review_v1(%L,%L,%L,201)','test-admin',:'chat_request','detail'),'OWNED_CHAT_MESSAGE_REQUIRED');
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_review_v1(%L,%L,%L,101,%L,%L)','test-admin',:'chat_request','approve_erase',repeat('0',64),'TEST stale view'),'CHAT_MESSAGE_CHANGED');
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_review_v1(%L,%L,%L,102,%L,%L)','test-admin',:'chat_request','approve_erase',(SELECT private.kinto_privacy_chat_hash_v1(to_jsonb(m))FROM public.messages m WHERE id=102),'TEST must preserve file'),'CHAT_ATTACHMENT_OR_DETAIL_REVIEW_REQUIRED');
SELECT public.kinto_privacy_chat_review_v1('test-admin',:'chat_request','retain',103,(SELECT private.kinto_privacy_chat_hash_v1(to_jsonb(m))FROM public.messages m WHERE id=103),'TEST specific unresolved claim',now()+interval '30 days');
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_erase_text_v1(%L,%L,103,103)','test-admin',:'chat_request'),'CHAT_ERASURE_REVIEW_REQUIRED');
SELECT public.kinto_privacy_chat_review_v1('test-admin',:'chat_request','approve_erase',101,(SELECT private.kinto_privacy_chat_hash_v1(to_jsonb(m))FROM public.messages m WHERE id=101),'TEST non-financial text reviewed');
SAVEPOINT changed_text;
UPDATE public.messages SET message='TEST different message since review'WHERE id=101;
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_erase_text_v1(%L,%L,101,101)','test-admin',:'chat_request'),'CHAT_MESSAGE_CHANGED');
ROLLBACK TO changed_text;
SAVEPOINT gained_file;
UPDATE public.messages SET file_url='https://example.invalid/new-proof.png'WHERE id=101;
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_erase_text_v1(%L,%L,101,101)','test-admin',:'chat_request'),'CHAT_MESSAGE_CHANGED');
ROLLBACK TO gained_file;
SAVEPOINT unknown_cascade;
CREATE TABLE public.test_chat_financial_child(message_id bigint REFERENCES public.messages(id)ON DELETE CASCADE,amount numeric);
INSERT INTO public.test_chat_financial_child VALUES(101,123);
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_erase_text_v1(%L,%L,101,101)','test-admin',:'chat_request'),'CHAT_SCHEMA_REVIEW_REQUIRED');
SELECT public.test_assert((SELECT amount FROM public.test_chat_financial_child)=123,'unknown cascade cannot delete associated amount');
ROLLBACK TO unknown_cascade;
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_erase_text_v1(%L,%L,101,103)','test-admin',:'chat_request'),'EXACT_MESSAGE_CONFIRMATION_REQUIRED');
SAVEPOINT failed_receipt;
CREATE FUNCTION private.test_chat_receipt_failure()RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.state='erased'THEN RAISE EXCEPTION 'TEST_CHAT_RECEIPT_FAILURE';END IF;RETURN NEW;END$$;
CREATE TRIGGER test_chat_receipt BEFORE UPDATE ON private.kinto_privacy_chat_decisions_v1 FOR EACH ROW EXECUTE FUNCTION private.test_chat_receipt_failure();
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_erase_text_v1(%L,%L,101,101)','test-admin',:'chat_request'),'TEST_CHAT_RECEIPT_FAILURE');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.messages WHERE id=101),'receipt failure rolls back message deletion');
SELECT public.test_assert((SELECT state FROM private.kinto_privacy_chat_decisions_v1 WHERE message_id=101)='approved','receipt failure creates no erased ledger state');
ROLLBACK TO failed_receipt;
-- Marking a message read does not change its content/ownership approval.
UPDATE public.messages SET read_by_employee=true WHERE id=101;
SET ROLE service_role;
SELECT public.kinto_privacy_chat_erase_text_v1('test-admin',:'chat_request',101,101);
RESET ROLE;
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.messages WHERE id=101),'reviewed text physically removed');
SELECT public.test_assert(public.kinto_privacy_chat_erase_text_v1('test-admin',:'chat_request',101,101)->>'duplicate'='true','repeat completion idempotent');
SELECT public.test_assert((SELECT note IS NULL AND erased_key_hash IS NOT NULL FROM private.kinto_privacy_chat_decisions_v1 WHERE message_id=101),'completion contains no copied text or verification note');
SELECT public.test_denied($q$SELECT public.kinto_deletion_request_v1('test-TEST-A','cancel')$q$,'PRIVACY_DELETION_ALREADY_STARTED');
SELECT public.test_assert((SELECT attachment_message FROM chat_before)=(SELECT to_jsonb(m)FROM public.messages m WHERE id=102),'file-bearing evidence unchanged');
SELECT public.test_assert((SELECT other_message FROM chat_before)=(SELECT to_jsonb(m)FROM public.messages m WHERE id=201),'other conversation unchanged');
SELECT public.test_assert((SELECT orders FROM chat_before)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'orders unchanged');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.messages WHERE id=103),'retained text preserved');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(private.kinto_privacy_chat_ledger_export_v1())x WHERE x?'message'OR x?'customer_id'OR x?'note'),'private export has no raw content or customer identifier');
-- An older *different version* of the same erased message is still detected by its identity key.
INSERT INTO public.messages(id,customer_id,sender_type,message)VALUES(101,'00000000-0000-4000-8000-000000000001','customer','TEST older backup version');
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_erase_text_v1(%L,%L,101,101)','test-admin',:'chat_request'),'ERASED_CHAT_MESSAGE_REAPPEARED');
SELECT public.test_assert((SELECT message FROM public.messages WHERE id=101)='TEST older backup version','restored message requires separate reconciliation, never silently re-erased');
SELECT public.test_assert((SELECT count(*)FROM private.kinto_privacy_chat_decisions_v1 WHERE message_id=101 AND state='erased')=1,'old minimal receipt remains intact after rejected retry');
SELECT public.test_assert(jsonb_array_length(private.kinto_privacy_restore_chat_matches_v1((SELECT jsonb_build_array(erased_key_hash)FROM private.kinto_privacy_chat_decisions_v1 WHERE message_id=101))->'matched_hashes')=1,'restored earlier text version detected');
SELECT public.test_assert(private.kinto_privacy_restore_chat_matches_v1((SELECT jsonb_build_array(erased_key_hash)FROM private.kinto_privacy_chat_decisions_v1 WHERE message_id=101))->>'restore_authorized'='false','no automatic restore permission');
SELECT public.test_assert((SELECT status FROM private.kinto_deletion_requests_v1 WHERE id=:'chat_request')='verified','one text erasure never claims account deleted');
ROLLBACK;
SELECT 'PASS_PRIVACY_CHAT: scoped admin review, disabled default, service-only exact confirmed text erasure, changed content/attachments and unknown cascades hold; retention and other customer/order preserved; idempotent minimal evidence and restored earlier text version detected';
