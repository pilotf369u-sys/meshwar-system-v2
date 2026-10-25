-- Disposable account fixture only. No production account/order/payment writes.
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE financial_originals AS SELECT(SELECT jsonb_agg(to_jsonb(c)ORDER BY id)FROM public.customers c)customers,(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o)orders;
SAVEPOINT financial_fixture;
ALTER TABLE public.customers ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN country text,ADD COLUMN address text,ADD COLUMN state text,ADD COLUMN secondary_phone text,ADD COLUMN cart_items jsonb,ADD COLUMN rewards_log jsonb DEFAULT '[]',ADD COLUMN wallet_balance numeric DEFAULT 0,ADD COLUMN wallet_currency text DEFAULT 'IQD',ADD COLUMN rewards_count integer DEFAULT 0,ADD COLUMN current_cycle_delivered integer DEFAULT 0,ADD COLUMN reward_balances jsonb NOT NULL DEFAULT '{}';
INSERT INTO public.customers(id,name,phone,email,code,password,cart_items)VALUES('00000000-0000-4000-8000-000000000080','TEST FINANCIAL','00080','financial@example.invalid','TEST-FINANCIAL','TEST-PASSWORD','[{"product":"TEST nonfinancial cart"}]');
INSERT INTO public.customer_review_sessions(customer_id,token_hash,expires_at)VALUES('00000000-0000-4000-8000-000000000080',digest('test-TEST-FINANCIAL','sha256'),now()+interval '1 hour');
SELECT public.kinto_deletion_request_v1('test-TEST-FINANCIAL','request',true);
SELECT id AS financial_request FROM private.kinto_deletion_requests_v1 WHERE customer_id='00000000-0000-4000-8000-000000000080' \gset
SELECT public.kinto_privacy_admin_v1('test-admin','deletions',:'financial_request','verify','TEST financial profile verification');
UPDATE private.kinto_erasure_policy_v1 SET enabled=true,inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_assert(private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080')='[]'::jsonb,'known zero balances and empty history do not invent financial holds');
-- Reject both positive and negative balances without changing their financial meaning.
UPDATE public.customers SET wallet_balance=25000 WHERE id='00000000-0000-4000-8000-000000000080';
CREATE TEMP TABLE financial_before_hold AS SELECT to_jsonb(c)profile,(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM public.customer_review_sessions s WHERE customer_id=c.id)sessions FROM public.customers c WHERE id='00000000-0000-4000-8000-000000000080';
SELECT public.test_assert(public.kinto_deletion_execute_v1('test-admin',:'financial_request',:'financial_request')->>'status'='manual_review','refreshed approval cannot erase embedded positive wallet');
SELECT public.test_assert((SELECT profile FROM financial_before_hold)=(SELECT to_jsonb(c)FROM public.customers c WHERE id='00000000-0000-4000-8000-000000000080'),'holding erasure does not zero or otherwise mutate profile');
SELECT public.test_assert((SELECT sessions FROM financial_before_hold)=(SELECT jsonb_agg(to_jsonb(s)ORDER BY id)FROM public.customer_review_sessions s WHERE customer_id='00000000-0000-4000-8000-000000000080'),'held financial request leaves sessions intact');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM private.kinto_erasure_ledger_v1 WHERE request_id=:'financial_request'),'no false completed erasure receipt');
UPDATE public.customers SET wallet_balance=-1 WHERE id='00000000-0000-4000-8000-000000000080';
SELECT public.test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080'))h WHERE h->>'reason'='profile_financial_value_requires_review'),'negative balance is not disposable');
UPDATE public.customers SET wallet_balance=NULL WHERE id='00000000-0000-4000-8000-000000000080';
SELECT public.test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080'))h WHERE h->>'reason'='profile_financial_value_unverified'),'nullable observed balance is unknown not zero');
UPDATE public.customers SET wallet_balance='NaN'::numeric WHERE id='00000000-0000-4000-8000-000000000080';
SELECT public.test_assert(jsonb_array_length(private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080'))>0,'nonfinite numeric cannot be approved');
UPDATE public.customers SET wallet_balance=0,reward_balances='{"IQD":0,"USD":4}'WHERE id='00000000-0000-4000-8000-000000000080';
SELECT public.test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080'))h WHERE h->>'column'='reward_balances'),'multi-currency positive reward is held without conversion');
UPDATE public.customers SET reward_balances='{"IQD":{"pending":5}}'WHERE id='00000000-0000-4000-8000-000000000080';
SELECT public.test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080'))h WHERE h->>'reason'='profile_financial_value_unverified'),'nested unknown financial format is held');
UPDATE public.customers SET reward_balances='{"IQD":0}',rewards_count=1,current_cycle_delivered=2,rewards_log='[{"private":"SYNTHETIC_HISTORY"}]'WHERE id='00000000-0000-4000-8000-000000000080';
SELECT public.test_assert(jsonb_array_length(private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080'))=3,'reward counters and history independently require review');
SELECT public.test_assert(private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080')::text NOT LIKE '%SYNTHETIC_HISTORY%'AND private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080')::text NOT LIKE '%00080%','hold output contains no history or customer contacts');
UPDATE public.customers SET rewards_count=0,current_cycle_delivered=0,rewards_log='[]',reward_balances='{}'WHERE id='00000000-0000-4000-8000-000000000080';
SAVEPOINT unknown_profile_field;
ALTER TABLE public.customers ADD COLUMN unknown_financial_snapshot jsonb;
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080'))h WHERE h->>'reason'='profile_fields_require_review'),'unreviewed embedded field holds even when null and policy refreshed');
ROLLBACK TO unknown_profile_field;
SAVEPOINT partial_financial_shape;
ALTER TABLE public.customers DROP COLUMN wallet_currency;
SELECT public.test_assert(EXISTS(SELECT 1 FROM jsonb_array_elements(private.kinto_privacy_profile_holds_v1('00000000-0000-4000-8000-000000000080'))h WHERE h->>'reason'='profile_financial_shape_unverified'),'partial financial schema cannot masquerade as fresh account');
ROLLBACK TO partial_financial_shape;
-- With all financial values zero, no history and no associated operational data,
-- existing fixture-only finalizer still removes a genuinely fresh profile and embedded cart.
SELECT public.kinto_privacy_admin_v1('test-admin','deletions',:'financial_request','verify','TEST zero-balance fresh profile review');
UPDATE private.kinto_erasure_policy_v1 SET inventory_signature=private.kinto_erasure_signature_v1();
SELECT public.test_assert(public.kinto_deletion_execute_v1('test-admin',:'financial_request',:'financial_request')->>'status'='deleted','qualified fresh profile can still finalize with reviewed empty financial shape');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.customers WHERE id='00000000-0000-4000-8000-000000000080'),'fresh profile and embedded nonfinancial cart removed');
SELECT public.test_assert((SELECT orders FROM financial_originals)=(SELECT jsonb_agg(to_jsonb(o)ORDER BY id)FROM public.orders o),'existing order rows unchanged');
ROLLBACK TO financial_fixture;
SELECT public.test_assert((SELECT customers FROM financial_originals)=(SELECT jsonb_agg(to_jsonb(c)ORDER BY id)FROM public.customers c),'other customer profiles unchanged');
ROLLBACK;
SELECT 'PASS_PROFILE_FINANCIAL_GUARD: nonzero/negative/null/nonfinite/multicurrency/history/unknown embedded fields hold without zeroing rights, no false receipt; qualified fresh fixture still deletes atomically and orders stay unchanged';
