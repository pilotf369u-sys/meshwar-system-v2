-- Synthetic isolated database only. Production SQL is reviewed separately.
\i sql/kinto-world-payment-privacy-v3.sql
CREATE FUNCTION pg_temp.expect_error(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $$BEGIN BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN;END IF;RAISE;END;RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: %',expected;END $$;
BEGIN;
INSERT INTO private.kinto_world_accounts_v1(id,name,phone,password_hash) VALUES('00000000-0000-0000-0000-000000000090','TEST Privacy Staff','0000071090',extensions.crypt('TEST-only-password',extensions.gen_salt('bf')));
INSERT INTO private.kinto_world_sessions_v1 VALUES(extensions.digest('TEST-privacy-session','sha256'),'00000000-0000-0000-0000-000000000090',now()+interval '1 hour',NULL);
SET LOCAL ROLE anon;
DO $$DECLARE o jsonb;id uuid;id2 uuid;req jsonb;q jsonb;BEGIN
 req:='{"policy_accepted":true,"contact":{"name":"TEST Privacy Unique","phone":"+9647701234567","address":"TEST destination address"},"items":[{"url":"https://www.trendyol.com/test-p-123456","title":"TEST product","price":"1000","quantity":1,"size":"L","color":"Haki","options_confirmed":true}]}';
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000000090',req);id:=(o->>'id')::uuid;
 q:=jsonb_build_object('goods','35750','shipping','5000','currency','IQD','expires_at',now()+interval '1 hour','instructions','SECRET-BANK-INSTRUCTIONS','attachment','SECRET-PROOF','can_ship',true,'availability_checked',true);
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,0,%L,%L)','customer','other-customer',id,'cancel','{}'),'WORLD_NOT_FOUND');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,0,%L,%L)','customer','test-customer',id,'quote',q),'WORLD_ACTION_DENIED');
 o:=public.kinto_world_action_v1('world_employee','TEST-privacy-session',id,0,'quote',q);
 IF o::text LIKE '%SECRET-%' THEN RAISE EXCEPTION 'QUOTE_DISCLOSURE';END IF;
 o:=public.kinto_world_action_v1('customer','test-customer',id,1,'transfer','{"reference":"SECRET-PROOF","attachment":"SECRET-PROOF"}');
 IF o->>'state'<>'transfer_pending' OR o->'payment'->>'status'<>'pending_verification' OR o::text LIKE '%SECRET-%' THEN RAISE EXCEPTION 'REPORT_PRIVACY_OR_AUTO_PAID';END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,2,%L,%L)','customer','test-customer',id,'confirm_transfer','{}'),'WORLD_ACTION_DENIED');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,2,%L,%L)','world_employee','TEST-privacy-session',id,'purchase','{}'),'WORLD_PURCHASE_REQUIRES_PAYMENT_AND_RECHECK');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,2,%L,%L)','world_employee','TEST-privacy-session',id,'confirm_transfer','{"amount":"40750","currency":"IQD","reference":"TEST-PRIVATE-BANK","bank_verified":false}'),'WORLD_PAYMENT_VERIFICATION_REQUIRED');
 o:=public.kinto_world_action_v1('world_employee','TEST-privacy-session',id,2,'confirm_transfer','{"amount":"40750","currency":"IQD","reference":"TEST-PRIVATE-BANK","bank_verified":true}');
 IF o->>'state'<>'paid' OR o::text LIKE '%TEST-PRIVATE-BANK%' OR o->'payment' ? 'staff_reference' OR o->'payment' ? 'customer_reference' THEN RAISE EXCEPTION 'INTERNAL_RECEIPT_EXPOSED';END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,2,%L,%L)','world_employee','TEST-privacy-session',id,'purchase','{}'),'WORLD_REVISION_CONFLICT');
 o:=public.kinto_world_action_v1('world_employee','TEST-privacy-session',id,3,'purchase','{"reference":"TEST-STORE-PRIVACY","availability_rechecked":true,"within_paid_amount":true}');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,4,%L,%L)','world_employee','TEST-privacy-session',id,'ship','{"tracking":"TEST-PRIVACY-PARCEL"}'),'WORLD_PREPARATION_REQUIRED');
 o:=public.kinto_world_fulfillment_action_v2('world_employee','TEST-privacy-session',id,4,'prepare_shipping','{"tracking":"TEST-PRIVACY-PARCEL"}');
 o:=public.kinto_world_fulfillment_action_v2('world_employee','TEST-privacy-session',id,5,'ship_world','{"tracking":"TEST-PRIVACY-PARCEL"}');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,6,%L,%L)','world_employee','TEST-privacy-session',id,'deliver','{}'),'WORLD_DELIVERY_CONFIRMATION_REQUIRED');
 PERFORM public.kinto_world_dispatch_action_v1('world_employee','TEST-privacy-session',id,6,'route','{"target_role":"branch","target_id":"branch-1"}');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,7,%L,%L)','world_employee','TEST-privacy-session',id,'deliver','{"received_confirmed":true}'),'WORLD_DELIVERY_USE_ASSIGNED_COURIER');
 PERFORM public.kinto_world_dispatch_action_v1('branch','test-branch-1',id,7,'receive');
 PERFORM public.kinto_world_dispatch_action_v1('branch','test-branch-1',id,8,'assign_courier','{"target_id":"courier-1"}');
 PERFORM public.kinto_world_dispatch_action_v1('courier','test-courier-1',id,9,'receive');
 PERFORM public.kinto_world_dispatch_action_v1('courier','test-courier-1',id,10,'start_delivery');
 PERFORM public.kinto_world_dispatch_action_v1('courier','test-courier-1',id,11,'deliver');
 IF (public.kinto_world_staff_search_v2('world_employee','TEST-privacy-session','TEST-PRIVACY-PARCEL')->0->>'state')<>'delivered' THEN RAISE EXCEPTION 'LIFECYCLE_REGRESSION';END IF;
 -- Report with NO transfer reference is supported; internal duplicate receipts still refused.
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000000091',req);id2:=(o->>'id')::uuid;
 o:=public.kinto_world_action_v1('world_employee','TEST-privacy-session',id2,0,'quote',q-'instructions'-'attachment');
 o:=public.kinto_world_action_v1('customer','test-customer',id2,1,'transfer','{}');
 BEGIN PERFORM public.kinto_world_action_v1('world_employee','TEST-privacy-session',id2,2,'confirm_transfer','{"amount":"40750","currency":"IQD","reference":"TEST-PRIVATE-BANK","bank_verified":true}');RAISE EXCEPTION 'DUPLICATE_ACCEPTED';EXCEPTION WHEN unique_violation THEN NULL;END;
END $$;
RESET ROLE;
DO $$BEGIN
 IF EXISTS(SELECT FROM private.kinto_world_events_v1 WHERE detail::text LIKE '%SECRET-%') OR EXISTS(SELECT FROM private.kinto_world_orders_v1 WHERE quote::text LIKE '%SECRET-%' OR payment::text LIKE '%SECRET-%') THEN RAISE EXCEPTION 'UNNECESSARY_PAYMENT_DATA_STORED';END IF;
END $$;
-- Existing stored bank references/instructions are redacted by every formatter consumer too.
UPDATE private.kinto_world_orders_v1 SET quote=coalesce(quote,'{}')||'{"instructions":"LEGACY-SECRET-BANK"}',payment=coalesce(payment,'{}')||'{"staff_reference":"LEGACY-SECRET-REF","refund_reference":"LEGACY-SECRET-REF"}' WHERE request_key='00000000-0000-0000-0000-000000000090';
SET LOCAL ROLE anon;
DO $$BEGIN IF public.kinto_world_staff_search_v2('world_employee','TEST-privacy-session','TEST Privacy Unique')::text LIKE '%LEGACY-SECRET%' THEN RAISE EXCEPTION 'LEGACY_DATA_EXPOSED';END IF;END $$;
RESET ROLE;
UPDATE private.kinto_world_sessions_v1 SET expires_at=now()-interval '1 second' WHERE account_id='00000000-0000-0000-0000-000000000090';
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('world_employee','TEST-privacy-session')$q$,'WORLD_STAFF_SESSION_INVALID');
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_staff_search_v2('world_employee','TEST-privacy-session','TEST')$q$,'WORLD_STAFF_SESSION_INVALID');
RESET ROLE;
UPDATE private.kinto_world_sessions_v1 SET expires_at=now()+interval '1 hour',revoked_at=now() WHERE account_id='00000000-0000-0000-0000-000000000090';
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('world_employee','TEST-privacy-session')$q$,'WORLD_STAFF_SESSION_INVALID');
RESET ROLE;
UPDATE private.kinto_world_sessions_v1 SET revoked_at=NULL WHERE account_id='00000000-0000-0000-0000-000000000090';
UPDATE private.kinto_world_accounts_v1 SET enabled=false WHERE id='00000000-0000-0000-0000-000000000090';
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('world_employee','TEST-privacy-session')$q$,'WORLD_STAFF_SESSION_INVALID');
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('employee','TEST-privacy-session')$q$,'EMPLOYEE_SESSION_INVALID');
RESET ROLE;
DO $$BEGIN IF (SELECT status FROM public.orders WHERE id=1)<>'LOCAL_SENTINEL' THEN RAISE EXCEPTION 'LOCAL_MUTATION';END IF;END $$;
ROLLBACK;
SELECT 'PASS payment privacy, no customer proof storage, internal receipt deduplication, full lifecycle, ownership/role/revision, expired/revoked/disabled session guards';
