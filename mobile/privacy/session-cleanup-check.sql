-- Synthetic transaction only: no real tokens/users or production database.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE public.customer_portal_sessions(token_hash text PRIMARY KEY,customer_id uuid NOT NULL,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL);
INSERT INTO public.customer_portal_sessions SELECT 'TEST-PORTAL-'||code,id,now()+interval '1 hour',now()FROM public.customers WHERE code IN('TEST-A','TEST-B');
CREATE TEMP TABLE session_cleanup_before AS SELECT
 (SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)orders,
 (SELECT jsonb_agg(to_jsonb(c)ORDER BY id)FROM public.customers c)customers,
 (SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM public.customer_review_sessions s WHERE customer_id='00000000-0000-4000-8000-000000000002')other_sessions,
 (SELECT jsonb_agg(to_jsonb(s)ORDER BY token_hash)FROM public.customer_portal_sessions s WHERE customer_id='00000000-0000-4000-8000-000000000002')other_portal;
SELECT public.test_assert(NOT has_function_privilege('anon','private.kinto_privacy_revoke_sessions_v1(uuid)','EXECUTE'),'no anonymous cleanup entry point');
SELECT public.test_assert(NOT has_function_privilege('authenticated','private.kinto_privacy_revoke_sessions_v1(uuid)','EXECUTE'),'no customer JWT cleanup entry point');
SAVEPOINT unknown_shape;
ALTER TABLE public.customer_portal_sessions ALTER COLUMN customer_id TYPE text USING customer_id::text;
SELECT public.test_denied($q$SELECT private.kinto_privacy_revoke_sessions_v1('00000000-0000-4000-8000-000000000001')$q$,'PORTAL_SESSION_SCHEMA_NOT_VERIFIED');
SELECT public.test_assert(EXISTS(SELECT 1 FROM public.customer_review_sessions WHERE token_hash=digest('test-TEST-A','sha256')),'unknown secondary schema cannot partially erase primary tokens');
ROLLBACK TO unknown_shape;
SELECT public.test_assert(private.kinto_privacy_revoke_sessions_v1('00000000-0000-4000-8000-000000000001')->>'portal_sessions_removed'='1','observed secondary sessions removed by owner ID');
SELECT public.test_denied($q$SELECT public.customer_session_identity_v150('test-TEST-A')$q$,'REVIEW_SESSION_INVALID');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.customer_portal_sessions WHERE customer_id='00000000-0000-4000-8000-000000000001'),'no target portal tokens survive');
SELECT public.test_assert(private.kinto_privacy_revoke_sessions_v1('00000000-0000-4000-8000-000000000001')->>'review_sessions_removed'='0','session cleanup idempotent');
SELECT public.test_assert((SELECT other_sessions FROM session_cleanup_before)=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM public.customer_review_sessions s WHERE customer_id='00000000-0000-4000-8000-000000000002'),'other customer primary tokens preserved');
SELECT public.test_assert((SELECT other_portal FROM session_cleanup_before)=(SELECT jsonb_agg(to_jsonb(s)ORDER BY token_hash)FROM public.customer_portal_sessions s WHERE customer_id='00000000-0000-4000-8000-000000000002'),'other customer portal tokens preserved');
SELECT public.test_assert((SELECT customers FROM session_cleanup_before)=(SELECT jsonb_agg(to_jsonb(c)ORDER BY id)FROM public.customers c),'credentials/profile values not mutated by token cleanup');
SELECT public.test_assert((SELECT orders FROM session_cleanup_before)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'orders unchanged');
ROLLBACK;
SELECT 'PASS_PRIVACY_SESSION_CLEANUP: known two token paths revoked by exact owner, old primary token rejected, unknown schema fails before deletion, other owner and orders unchanged; no account-deletion claim';
