-- DISPOSABLE DATABASE ONLY. Existing world lifecycle/bootstrap checks must run first.
-- The preceding search test deliberately creates 105 FUTURE-dated empty requests.
-- Remove only those synthetic fixtures after their own >100-row assertion passed;
-- otherwise they displace every new request from the normal 100-row listing.
DELETE FROM private.kinto_world_orders_v1 WHERE request->'items'='[]'::jsonb AND request->'contact'->>'name'='TEST newer';
CREATE OR REPLACE FUNCTION pg_temp.expect_error(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $$BEGIN BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN;END IF;RAISE;END;RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: %',expected;END $$;
CREATE TEMP TABLE mad_preservation AS SELECT
 (SELECT md5(string_agg(p.oid::text||p.prosrc,',' ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.oid<>'public.kinto_world_submit_v1(text,uuid,jsonb)'::regprocedure) AS functions,
 (SELECT md5(coalesce(string_agg(pg_get_triggerdef(oid),',' ORDER BY oid),'')) FROM pg_trigger WHERE NOT tgisinternal) AS triggers,
 (SELECT jsonb_agg(to_jsonb(o)) FROM public.orders o) AS local_orders;
\i sql/kinto-world-stores-v2.sql
\i sql/kinto-world-stores-v2.sql
SET ROLE anon;
DO $$DECLARE request jsonb; item jsonb; o jsonb; replay jsonb; bad text; n bigint; BEGIN
 request:='{"policy_accepted":true,"contact":{"name":"TEST MAD customer","phone":"00000000","address":"TEST destination address"},"items":[{"url":"https://www.madparfum.com/urun/test-caramel-grace/","image":"https://ba62e8.cdn.akinoncloud.com/products/test.jpg","title":"TEST MAD product","price":"1000","quantity":1,"size":"L","color":"Haki","options_confirmed":true}]}';
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009401',request);
 IF o->>'state'<>'review' OR o->'request'->'items'->0->>'image'<>'https://ba62e8.cdn.akinoncloud.com/products/test.jpg' OR (o->'estimates'->0->>'amount')::numeric<>35750 THEN RAISE EXCEPTION 'MAD_REVIEW_PRICING';END IF;
 replay:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009401',request);
 IF replay->>'id'<>o->>'id' THEN RAISE EXCEPTION 'MAD_DUPLICATE';END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_submit_v1(%L,%L,%L)','test-customer','00000000-0000-0000-0000-000000009401',jsonb_set(request,'{items,0,price}','"2000"')),'WORLD_IDEMPOTENCY_CONFLICT');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_submit_v1(%L,%L,%L)','bad-session','00000000-0000-0000-0000-000000009402',request),'CUSTOMER_SESSION_INVALID');
 FOREACH bad IN ARRAY ARRAY['https://madamecoco.com.evil.test/test-nt0000000001-101/','http://www.madamecoco.com/test-nt0000000001-101/','https://user@www.madamecoco.com/test-nt0000000001-101/','https://www.madamecoco.com:444/test-nt0000000001-101/','https://www.madamecoco.com/nevresim-takimi/','https://www.madamecoco.com/test-123456-101/','https://www.madamecoco.com/test-abcdef-101/','https://evil.test/test-nt0000000001-101/'] LOOP
  PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_submit_v1(%L,%L,%L)','test-customer','00000000-0000-0000-0000-000000009402',jsonb_set(request,'{items,0,url}',to_jsonb(bad))),'WORLD_ITEM_INVALID');
 END LOOP;
 item:=request->'items'->0;
 request:=jsonb_set(request,'{items,0,url}','"https://www.trendyol.com/test-p-9002"');
 request:=jsonb_set(request,'{items,0,image}','"https://cdn.dsmcdn.com/test.jpg"');
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009402',request);
 IF o->'request'->'items'->0->>'image'<>'https://cdn.dsmcdn.com/test.jpg' OR o->>'state'<>'review' THEN RAISE EXCEPTION 'TRENDYOL_REGRESSION';END IF;
 replay:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009402',request);IF replay->>'id'<>o->>'id' THEN RAISE EXCEPTION 'TRENDYOL_REPLAY';END IF;
END $$;
-- Listing is a separate API request/statement after submission commits.
DO $$DECLARE o jsonb;BEGIN
 SELECT value INTO o FROM jsonb_array_elements(public.kinto_world_list_v1('customer','test-customer')) WHERE value->'request'->'items'->0->>'url'='https://www.madparfum.com/urun/test-caramel-grace/';
 IF o IS NULL THEN RAISE EXCEPTION 'MAD_CUSTOMER_NOT_VISIBLE: %',public.kinto_world_list_v1('customer','test-customer');END IF;
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(public.kinto_world_list_v1('employee','test-staff')) x WHERE x->>'id'=o->>'id') THEN RAISE EXCEPTION 'MAD_STAFF_NOT_VISIBLE';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(public.kinto_world_list_v1('customer','other-customer')) x WHERE x->>'id'=o->>'id') THEN RAISE EXCEPTION 'MAD_CUSTOMER_ISOLATION';END IF;
END $$;
RESET ROLE;
-- Same synthetic payment/fulfillment journey via current dedicated employee APIs.
BEGIN;
INSERT INTO private.kinto_world_accounts_v1(id,name,phone,password_hash) VALUES('00000000-0000-0000-0000-000000009490','TEST MAD Staff','00000794190',extensions.crypt('TEST-only-password',extensions.gen_salt('bf')));
INSERT INTO private.kinto_world_sessions_v1 VALUES(extensions.digest('TEST-mad-session','sha256'),'00000000-0000-0000-0000-000000009490',now()+interval '1 hour',NULL);
SET LOCAL ROLE anon;
DO $$DECLARE o jsonb;id uuid;id2 uuid;req jsonb;q jsonb;BEGIN
 req:='{"policy_accepted":true,"contact":{"name":"TEST MAD Unique","phone":"+9647701234567","address":"TEST destination address"},"items":[{"url":"https://www.madparfum.com/urun/test-caramel-grace/","title":"TEST product","price":"1000","quantity":1,"size":"L","color":"Haki","options_confirmed":true}]}';
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009490',req);id:=(o->>'id')::uuid;
 q:=jsonb_build_object('goods','35750','shipping','5000','currency','IQD','expires_at',now()+interval '1 hour','instructions','SECRET-BANK-INSTRUCTIONS','attachment','SECRET-PROOF','can_ship',true,'availability_checked',true);
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,0,%L,%L)','customer','other-customer',id,'cancel','{}'),'WORLD_NOT_FOUND');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,0,%L,%L)','customer','test-customer',id,'quote',q),'WORLD_ACTION_DENIED');
 o:=public.kinto_world_action_v1('world_employee','TEST-mad-session',id,0,'quote',q);
 IF o::text LIKE '%SECRET-%' THEN RAISE EXCEPTION 'QUOTE_DISCLOSURE';END IF;
 o:=public.kinto_world_action_v1('customer','test-customer',id,1,'transfer','{"reference":"SECRET-PROOF","attachment":"SECRET-PROOF"}');
 IF o->>'state'<>'transfer_pending' OR o->'payment'->>'status'<>'pending_verification' OR o::text LIKE '%SECRET-%' THEN RAISE EXCEPTION 'REPORT_PRIVACY_OR_AUTO_PAID';END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,2,%L,%L)','customer','test-customer',id,'confirm_transfer','{}'),'WORLD_ACTION_DENIED');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,2,%L,%L)','world_employee','TEST-mad-session',id,'purchase','{}'),'WORLD_PURCHASE_REQUIRES_PAYMENT_AND_RECHECK');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,2,%L,%L)','world_employee','TEST-mad-session',id,'confirm_transfer','{"amount":"40750","currency":"IQD","reference":"TEST-MAD-PRIVATE-BANK","bank_verified":false}'),'WORLD_PAYMENT_VERIFICATION_REQUIRED');
 o:=public.kinto_world_action_v1('world_employee','TEST-mad-session',id,2,'confirm_transfer','{"amount":"40750","currency":"IQD","reference":"TEST-MAD-PRIVATE-BANK","bank_verified":true}');
 IF o->>'state'<>'paid' OR o::text LIKE '%TEST-MAD-PRIVATE-BANK%' OR o->'payment' ? 'staff_reference' OR o->'payment' ? 'customer_reference' THEN RAISE EXCEPTION 'INTERNAL_RECEIPT_EXPOSED';END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,2,%L,%L)','world_employee','TEST-mad-session',id,'purchase','{}'),'WORLD_REVISION_CONFLICT');
 o:=public.kinto_world_action_v1('world_employee','TEST-mad-session',id,3,'purchase','{"reference":"TEST-STORE-PRIVACY","availability_rechecked":true,"within_paid_amount":true}');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,4,%L,%L)','world_employee','TEST-mad-session',id,'ship','{"tracking":"TEST-MAD-PARCEL"}'),'WORLD_PREPARATION_REQUIRED');
 o:=public.kinto_world_fulfillment_action_v2('world_employee','TEST-mad-session',id,4,'prepare_shipping','{"tracking":"TEST-MAD-PARCEL"}');
 o:=public.kinto_world_fulfillment_action_v2('world_employee','TEST-mad-session',id,5,'ship_world','{"tracking":"TEST-MAD-PARCEL"}');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,6,%L,%L)','world_employee','TEST-mad-session',id,'deliver','{}'),'WORLD_DELIVERY_CONFIRMATION_REQUIRED');
 PERFORM public.kinto_world_dispatch_action_v1('world_employee','TEST-mad-session',id,6,'route','{"target_role":"branch","target_id":"branch-1"}');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,7,%L,%L)','world_employee','TEST-mad-session',id,'deliver','{"received_confirmed":true}'),'WORLD_DELIVERY_USE_ASSIGNED_COURIER');
 PERFORM public.kinto_world_dispatch_action_v1('branch','test-branch-1',id,7,'receive');
 PERFORM public.kinto_world_dispatch_action_v1('branch','test-branch-1',id,8,'assign_courier','{"target_id":"courier-1"}');
 PERFORM public.kinto_world_dispatch_action_v1('courier','test-courier-1',id,9,'receive');
 PERFORM public.kinto_world_dispatch_action_v1('courier','test-courier-1',id,10,'start_delivery');
 PERFORM public.kinto_world_dispatch_action_v1('courier','test-courier-1',id,11,'deliver');
 IF (public.kinto_world_staff_search_v2('world_employee','TEST-mad-session','TEST-MAD-PARCEL')->0->>'state')<>'delivered' THEN RAISE EXCEPTION 'LIFECYCLE_REGRESSION';END IF;
 -- Report with NO transfer reference is supported; internal duplicate receipts still refused.
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009491',req);id2:=(o->>'id')::uuid;
 o:=public.kinto_world_action_v1('world_employee','TEST-mad-session',id2,0,'quote',q-'instructions'-'attachment');
 o:=public.kinto_world_action_v1('customer','test-customer',id2,1,'transfer','{}');
 BEGIN PERFORM public.kinto_world_action_v1('world_employee','TEST-mad-session',id2,2,'confirm_transfer','{"amount":"40750","currency":"IQD","reference":"TEST-MAD-PRIVATE-BANK","bank_verified":true}');RAISE EXCEPTION 'DUPLICATE_ACCEPTED';EXCEPTION WHEN unique_violation THEN NULL;END;
END $$;
RESET ROLE;
DO $$BEGIN
 IF EXISTS(SELECT FROM private.kinto_world_events_v1 WHERE detail::text LIKE '%SECRET-%') OR EXISTS(SELECT FROM private.kinto_world_orders_v1 WHERE quote::text LIKE '%SECRET-%' OR payment::text LIKE '%SECRET-%') THEN RAISE EXCEPTION 'UNNECESSARY_PAYMENT_DATA_STORED';END IF;
END $$;
-- Existing stored bank references/instructions are redacted by every formatter consumer too.
UPDATE private.kinto_world_orders_v1 SET quote=coalesce(quote,'{}')||'{"instructions":"LEGACY-SECRET-BANK"}',payment=coalesce(payment,'{}')||'{"staff_reference":"LEGACY-SECRET-REF","refund_reference":"LEGACY-SECRET-REF"}' WHERE request_key='00000000-0000-0000-0000-000000009490';
SET LOCAL ROLE anon;
DO $$BEGIN IF public.kinto_world_staff_search_v2('world_employee','TEST-mad-session','TEST MAD Unique')::text LIKE '%LEGACY-SECRET%' THEN RAISE EXCEPTION 'LEGACY_DATA_EXPOSED';END IF;END $$;
RESET ROLE;
UPDATE private.kinto_world_sessions_v1 SET expires_at=now()-interval '1 second' WHERE account_id='00000000-0000-0000-0000-000000009490';
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('world_employee','TEST-mad-session')$q$,'WORLD_STAFF_SESSION_INVALID');
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_staff_search_v2('world_employee','TEST-mad-session','TEST')$q$,'WORLD_STAFF_SESSION_INVALID');
RESET ROLE;
UPDATE private.kinto_world_sessions_v1 SET expires_at=now()+interval '1 hour',revoked_at=now() WHERE account_id='00000000-0000-0000-0000-000000009490';
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('world_employee','TEST-mad-session')$q$,'WORLD_STAFF_SESSION_INVALID');
RESET ROLE;
UPDATE private.kinto_world_sessions_v1 SET revoked_at=NULL WHERE account_id='00000000-0000-0000-0000-000000009490';
UPDATE private.kinto_world_accounts_v1 SET enabled=false WHERE id='00000000-0000-0000-0000-000000009490';
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('world_employee','TEST-mad-session')$q$,'WORLD_STAFF_SESSION_INVALID');
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('employee','TEST-mad-session')$q$,'EMPLOYEE_SESSION_INVALID');
RESET ROLE;
DO $$BEGIN IF (SELECT status FROM public.orders WHERE id=1)<>'LOCAL_SENTINEL' THEN RAISE EXCEPTION 'LOCAL_MUTATION';END IF;END $$;
ROLLBACK;
\i sql/kinto-world-stores-rollback-v2.sql
\i sql/kinto-world-stores-v2.sql
DO $$BEGIN
 IF (SELECT count(*) FROM private.kinto_world_orders_v1 WHERE request_key='00000000-0000-0000-0000-000000009401')<>1 THEN RAISE EXCEPTION 'MAD_ROWS_LOST';END IF;
 IF (SELECT functions FROM mad_preservation) IS DISTINCT FROM (SELECT md5(string_agg(p.oid::text||p.prosrc,',' ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.oid<>'public.kinto_world_submit_v1(text,uuid,jsonb)'::regprocedure) THEN RAISE EXCEPTION 'UNRELATED_FUNCTION_CHANGED';END IF;
 IF (SELECT triggers FROM mad_preservation) IS DISTINCT FROM (SELECT md5(coalesce(string_agg(pg_get_triggerdef(oid),',' ORDER BY oid),'')) FROM pg_trigger WHERE NOT tgisinternal) THEN RAISE EXCEPTION 'TRIGGER_CHANGED';END IF;
 IF (SELECT local_orders FROM mad_preservation) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(o)) FROM public.orders o) THEN RAISE EXCEPTION 'LOCAL_ORDER_CHANGED';END IF;
 IF has_table_privilege('anon','private.kinto_world_orders_v1','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','private.kinto_world_orders_v1','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'DIRECT_ACCESS';END IF;
END $$;
SELECT 'PASS MAD review/pricing, stable request, URL/seller/image boundaries, legacy Trendyol and rollback; local functions/triggers/orders unchanged' AS result;
