-- Disposable PostgreSQL only. All identities, rates and payments below are synthetic.
CREATE SCHEMA private;
CREATE ROLE anon;CREATE ROLE authenticated;
CREATE FUNCTION private.require_admin_session_v147(t text) RETURNS uuid LANGUAGE plpgsql AS $$BEGIN IF t<>'test-admin' OR t IS NULL THEN RAISE EXCEPTION 'ADMIN_SESSION_INVALID';END IF;RETURN '00000000-0000-0000-0000-000000000001';END $$;
CREATE FUNCTION private.require_customer_review_session(t text) RETURNS uuid LANGUAGE plpgsql AS $$BEGIN IF t='test-customer' THEN RETURN '00000000-0000-0000-0000-000000000002';ELSIF t='other-customer' THEN RETURN '00000000-0000-0000-0000-000000000003';END IF;RAISE EXCEPTION 'CUSTOMER_SESSION_INVALID';END $$;
CREATE FUNCTION private.require_employee_session_v143(t text) RETURNS uuid LANGUAGE plpgsql AS $$BEGIN IF t<>'test-staff' OR t IS NULL THEN RAISE EXCEPTION 'EMPLOYEE_SESSION_INVALID';END IF;RETURN '00000000-0000-0000-0000-000000000004';END $$;
CREATE TABLE public.orders(id int PRIMARY KEY, status text);INSERT INTO public.orders VALUES(1,'LOCAL_SENTINEL');
\i sql/kinto-global-pricing-v1.sql
\i sql/kinto-global-orders-independent-v1.sql
CREATE FUNCTION pg_temp.expect_error(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $$BEGIN BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN;END IF;RAISE;END;RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: %',expected;END $$;
SELECT public.kinto_global_pricing_save_v1('test-admin',0,'{"enabled":true,"commission_percent":"10","display_currency":"IQD","currencies":[{"code":"USD","name":"USD","per_usd":"1"},{"code":"TRY","name":"TRY","per_usd":"40"},{"code":"IQD","name":"IQD","per_usd":"1300"}]}');
SET ROLE anon;
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('employee','test-staff')$q$,'WORLD_ACCESS_DENIED');
SELECT pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('admin','test-customer')$q$,'ADMIN_SESSION_INVALID');
SELECT public.kinto_world_assign_staff_v1('test-admin','00000000-0000-0000-0000-000000000004',true);
SELECT public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000000010','{"policy_accepted":true,"contact":{"name":"TEST customer","phone":"00000000","address":"TEST destination address"},"items":[{"url":"https://www.trendyol.com/test-p-123456","title":"TEST product","price":"1000","quantity":1,"size":"L","color":"Haki","options_confirmed":true}]}') AS result \gset
SELECT (:'result'::jsonb->>'id') AS oid \gset
DO $$DECLARE o jsonb; id uuid; data jsonb; BEGIN
 o:=(public.kinto_world_list_v1('customer','test-customer')->0);id:=(o->>'id')::uuid;
 IF jsonb_array_length(public.kinto_world_list_v1('customer','other-customer'))<>0 THEN RAISE EXCEPTION 'CUSTOMER_ISOLATION';END IF;
 IF (o->'estimates'->0) ? 'commission_percent' THEN RAISE EXCEPTION 'INTERNAL_PRICING_VISIBLE';END IF;
 IF (o->'estimates'->0->>'amount')::numeric<>35750 THEN RAISE EXCEPTION 'ESTIMATE_AMOUNT: %',o;END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,0,%L)','customer','other-customer',id,'cancel'),'WORLD_NOT_FOUND');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,0,%L)','employee','test-staff',id,'purchase'),'WORLD_PURCHASE_REQUIRES_PAYMENT_AND_RECHECK');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,0,%L)','customer','test-customer',id,'confirm_transfer'),'WORLD_ACTION_DENIED');
 PERFORM public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000000010',o->'request');
 IF jsonb_array_length(public.kinto_world_list_v1('customer','test-customer'))<>1 THEN RAISE EXCEPTION 'DEDUP';END IF;
 data:=jsonb_build_object('goods','35750','shipping','5000','currency','IQD','expires_at',now()+interval '1 hour','instructions','TEST bank only — no real transfer','can_ship',true,'availability_checked',true);
 o:=public.kinto_world_action_v1('employee','test-staff',id,0,'quote',data);
 IF o->'quote'->>'total'<>'40750' THEN RAISE EXCEPTION 'TOTAL';END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,0,%L,%L)','employee','test-staff',id,'quote',data),'WORLD_REVISION_CONFLICT');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,1,%L)','customer','test-customer',id,'gateway'),'WORLD_GATEWAY_NOT_CONNECTED');
 o:=public.kinto_world_action_v1('customer','test-customer',id,1,'transfer','{"reference":"TEST-CUSTOMER-TRANSFER"}');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,2,%L)','employee','test-staff',id,'confirm_transfer'),'WORLD_PAYMENT_VERIFICATION_REQUIRED');
 o:=public.kinto_world_action_v1('employee','test-staff',id,2,'confirm_transfer','{"reference":"TEST-BANK-CHECK","amount":"40750","currency":"IQD","bank_verified":true}');
 IF o->>'state'<>'paid' THEN RAISE EXCEPTION 'PAID';END IF;
 o:=public.kinto_world_action_v1('employee','test-staff',id,3,'purchase','{"reference":"TEST-STORE-PURCHASE","availability_rechecked":true,"within_paid_amount":true}');
 o:=public.kinto_world_action_v1('employee','test-staff',id,4,'ship','{"tracking":"TEST-TRACKING"}');
 o:=public.kinto_world_action_v1('employee','test-staff',id,5,'deliver');
 IF o->>'state'<>'delivered' THEN RAISE EXCEPTION 'DELIVERED';END IF;
 -- A second isolated request exercises expiry/review and recorded full refund.
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000000011',o->'request');id:=(o->>'id')::uuid;
 data:=jsonb_set(data,'{expires_at}',to_jsonb(now()-interval '1 hour'));
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_action_v1(%L,%L,%L,0,%L,%L)','employee','test-staff',id,'quote',data),'WORLD_QUOTE_EXPIRY');
 data:=jsonb_set(data,'{expires_at}',to_jsonb(now()+interval '1 hour'));
 o:=public.kinto_world_action_v1('employee','test-staff',id,0,'quote',data);
 o:=public.kinto_world_action_v1('customer','test-customer',id,1,'request_review');
 o:=public.kinto_world_action_v1('employee','test-staff',id,2,'quote',data);
 o:=public.kinto_world_action_v1('customer','test-customer',id,3,'transfer','{"reference":"TEST-TRANSFER-2"}');
 BEGIN
  PERFORM public.kinto_world_action_v1('employee','test-staff',id,4,'confirm_transfer','{"reference":"TEST-BANK-CHECK","amount":"40750","currency":"IQD","bank_verified":true}');
  RAISE EXCEPTION 'DUPLICATE_BANK_REFERENCE_ACCEPTED';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 o:=public.kinto_world_action_v1('employee','test-staff',id,4,'confirm_transfer','{"reference":"TEST-BANK-2","amount":"40750","currency":"IQD","bank_verified":true}');
 o:=public.kinto_world_action_v1('employee','test-staff',id,5,'refund_required','{"reason":"TEST unavailable at purchase"}');
 o:=public.kinto_world_action_v1('employee','test-staff',id,6,'confirm_refund','{"reference":"TEST-REFUND-2","amount":"40750","currency":"IQD"}');
 IF o->>'state'<>'refunded' THEN RAISE EXCEPTION 'REFUND';END IF;
 PERFORM public.kinto_world_assign_staff_v1('test-admin','00000000-0000-0000-0000-000000000004',false);
 PERFORM pg_temp.expect_error($q$SELECT public.kinto_world_list_v1('employee','test-staff')$q$,'WORLD_ACCESS_DENIED');
END $$;
RESET ROLE;
DO $$BEGIN
 IF (SELECT status FROM public.orders WHERE id=1)<>'LOCAL_SENTINEL' OR (SELECT count(*) FROM public.orders)<>1 THEN RAISE EXCEPTION 'LOCAL_MUTATION';END IF;
 IF (SELECT count(*) FROM private.kinto_world_events_v1)<>17 THEN RAISE EXCEPTION 'AUDIT_COUNT';END IF;
 IF has_table_privilege('anon','private.kinto_world_orders_v1','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','private.kinto_world_orders_v1','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'DIRECT_ACCESS';END IF;
END $$;
SELECT 'PASS global review, quote, transfer verification, purchase, shipping, delivery, role isolation, idempotency, audit and local preservation' AS result;
