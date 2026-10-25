-- Disposable fixture only. No real customer, file or Storage access.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.messages(id bigint PRIMARY KEY,customer_id uuid,sender_type text,message text,file_url text);
CREATE TABLE private.kinto_attachment_tickets_v1(path text PRIMARY KEY,actor_role text,actor_id text,target_id text,purpose text,expires_at timestamptz);
CREATE TEMP TABLE file_contract AS SELECT 'customer/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000099.png'::text key,'https://hsmmbloouskqdnptiiad.supabase.co/storage/v1/object/public/chat-attachments/'::text prefix;
INSERT INTO public.messages VALUES(901,'00000000-0000-4000-8000-000000000001','customer','TEST attachment text',(SELECT prefix||key FROM file_contract)),(902,'00000000-0000-4000-8000-000000000002','customer','TEST other conversation',(SELECT replace(prefix,'/public/','/sign/')||key||'?token=TEST-NOT-A-REAL-TOKEN'FROM file_contract));
INSERT INTO private.kinto_attachment_tickets_v1 SELECT key,'customer','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','chat',now()+interval '15 minutes'FROM file_contract;
SELECT public.kinto_deletion_request_v1('test-TEST-A','request',true);
SELECT id AS file_request FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000001'AND status='pending' \gset
SELECT public.kinto_privacy_admin_v1('test-admin','deletions',:'file_request','verify','TEST attachment account ownership verified');
UPDATE private.kinto_erasure_policy_v1 SET enabled=false;
SELECT private.kinto_privacy_chat_hash_v1(to_jsonb(m))AS file_hash FROM public.messages m WHERE id=901 \gset
CREATE TEMP TABLE file_before AS SELECT(SELECT jsonb_agg(to_jsonb(m)ORDER BY id)FROM public.messages m)messages,(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)orders,(SELECT jsonb_agg(to_jsonb(t)ORDER BY path)FROM private.kinto_attachment_tickets_v1 t)tickets;
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_attachment_v1(%L,%L,901,%L)','test-TEST-A',:'file_request',:'file_hash'),'ADMIN_SESSION_INVALID');
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_attachment_v1(%L,%L,902,%L)','test-admin',:'file_request',:'file_hash'),'OWNED_CHAT_MESSAGE_REQUIRED');
SELECT public.test_denied(format('SELECT public.kinto_privacy_chat_attachment_v1(%L,%L,901,%L)','test-admin',:'file_request',repeat('0',64)),'CHAT_MESSAGE_CHANGED');
SET ROLE anon;
SELECT public.kinto_privacy_chat_attachment_v1('test-admin',:'file_request',901,:'file_hash')AS file_report \gset
RESET ROLE;
SELECT public.test_assert(:'file_report'::jsonb->'holds'?'SHARED_MESSAGE_REFERENCE','signed and public references identify shared file');
SELECT public.test_assert(:'file_report'::jsonb->'holds'?'UPLOAD_AUTHORIZATION_ACTIVE','active upload permission holds');
SELECT public.test_assert(:'file_report'::jsonb->>'deletion_authorized'='false'AND :'file_report'::jsonb->>'account_deleted'='false','assessment never authorizes deletion');
SELECT public.test_assert(:'file_report'NOT LIKE '%TEST-NOT-A-REAL-TOKEN%'AND :'file_report'NOT LIKE '%000000000099.png%'AND :'file_report'NOT LIKE '%TEST other conversation%','no URL key or other-owner text disclosed');
SAVEPOINT protected_order;
-- Frozen JSONB details, then legacy TEXT details, are both recognized.
UPDATE public.orders SET details=jsonb_build_object('delivery_proof_url',(SELECT prefix||key FROM file_contract));
SELECT public.test_assert(public.kinto_privacy_chat_attachment_v1('test-admin',:'file_request',901,:'file_hash')->'holds'?'PROTECTED_OPERATIONAL_REFERENCE','JSONB order evidence protected');
ALTER TABLE public.orders ALTER COLUMN details TYPE text USING details::text;
SELECT public.test_assert(public.kinto_privacy_chat_attachment_v1('test-admin',:'file_request',901,:'file_hash')->'holds'?'PROTECTED_OPERATIONAL_REFERENCE','JSON-encoded TEXT evidence protected');
UPDATE public.orders SET details='TEST malformed legacy details';
SELECT public.test_assert(public.kinto_privacy_chat_attachment_v1('test-admin',:'file_request',901,:'file_hash')->>'coverage_verified'='false','malformed legacy details never imply full coverage');
ROLLBACK TO protected_order;
SAVEPOINT ticket_scope;
UPDATE private.kinto_attachment_tickets_v1 SET purpose='proof';
SELECT public.test_assert(public.kinto_privacy_chat_attachment_v1('test-admin',:'file_request',901,:'file_hash')->'holds'?'UPLOAD_TICKET_OWNERSHIP_NOT_VERIFIED','delivery ticket is not chat ownership');
ROLLBACK TO ticket_scope;
SAVEPOINT expired_ticket;
UPDATE private.kinto_attachment_tickets_v1 SET expires_at=now()-interval '1 day';
SELECT public.test_assert(public.kinto_privacy_chat_attachment_v1('test-admin',:'file_request',901,:'file_hash')->'holds'?'UPLOAD_QUIESCENCE_NOT_VERIFIED','expired upload cannot establish quiescence');
ROLLBACK TO expired_ticket;
SAVEPOINT absent_ticket;
DROP TABLE private.kinto_attachment_tickets_v1;
SELECT public.test_assert(public.kinto_privacy_chat_attachment_v1('test-admin',:'file_request',901,:'file_hash')->'holds'?'UPLOAD_TICKET_CHECK_UNAVAILABLE','missing optional catalog held without erasure');
ROLLBACK TO absent_ticket;
SELECT public.test_assert(private.kinto_privacy_chat_file_key_v1((SELECT replace(prefix,'hsmmbloouskqdnptiiad','foreign')||key FROM file_contract))IS NULL,'foreign origin rejected');
SELECT public.test_assert(private.kinto_privacy_chat_file_key_v1((SELECT prefix||'../'||key FROM file_contract))IS NULL,'raw traversal rejected');
SELECT public.test_assert(private.kinto_privacy_chat_file_key_v1((SELECT prefix||replace(key,'/','%2f')FROM file_contract))IS NULL,'ambiguous encoding held');
SELECT public.test_assert((SELECT messages FROM file_before)=(SELECT jsonb_agg(to_jsonb(m)ORDER BY id)FROM public.messages m),'all conversations unchanged');
SELECT public.test_assert((SELECT orders FROM file_before)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'orders unchanged');
SELECT public.test_assert((SELECT tickets FROM file_before)=(SELECT jsonb_agg(to_jsonb(t)ORDER BY path)FROM private.kinto_attachment_tickets_v1 t),'upload permissions unchanged');
SELECT 'PASS_CHAT_ATTACHMENT_ASSESSMENT: exact owner/admin/hash, shared references, JSONB/TEXT delivery evidence, active/expired/missing tickets, safe report and no writes';
ROLLBACK;
