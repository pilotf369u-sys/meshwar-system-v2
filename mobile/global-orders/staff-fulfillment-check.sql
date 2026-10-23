-- Disposable database only, after workflow-integration-check.sql.
\i sql/kinto-world-staff-fulfillment-v2.sql
CREATE FUNCTION pg_temp.expect_error(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $$BEGIN BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN;END IF;RAISE;END;RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: %',expected;END $$;
SELECT public.kinto_world_assign_staff_v1('test-admin','00000000-0000-0000-0000-000000000004',true);
SET ROLE anon;
DO $$DECLARE o jsonb;id uuid;req jsonb;q jsonb;BEGIN
 req:='{"policy_accepted":true,"contact":{"name":"TEST Fulfillment Unique","phone":"+964 770 123 4567","address":"TEST shipping destination"},"items":[{"url":"https://www.trendyol.com/test-p-123456","title":"TEST product","price":"1000","quantity":1,"size":"L","color":"Haki","options_confirmed":true}]}';
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000000083',req);id:=(o->>'id')::uuid;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_fulfillment_action_v2(%L,%L,%L,0,%L,%L)','customer','test-customer',id,'tracking','{"tracking":"TEST-PARCEL"}'),'WORLD_ACCESS_DENIED');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_fulfillment_action_v2(%L,%L,%L,0,%L,%L)','employee','test-staff',id,'tracking','{"tracking":"TEST-PARCEL"}'),'WORLD_FULFILLMENT_STATE');
 PERFORM pg_temp.expect_error($q$SELECT public.kinto_world_staff_search_v2('customer','test-customer','TEST')$q$,'WORLD_ACCESS_DENIED');
 PERFORM pg_temp.expect_error($q$SELECT public.kinto_world_staff_search_v2('employee','bad-token','TEST')$q$,'EMPLOYEE_SESSION_INVALID');
 q:=jsonb_build_object('goods','35750','shipping','5000','currency','IQD','expires_at',now()+interval '1 hour','instructions','TEST synthetic bank instructions','can_ship',true,'availability_checked',true);
 o:=public.kinto_world_action_v1('employee','test-staff',id,0,'quote',q);
 IF o->'quote'->>'total'<>'40750' THEN RAISE EXCEPTION 'TOTAL_WITH_SHIPPING';END IF;
 o:=public.kinto_world_action_v1('customer','test-customer',id,1,'transfer','{"reference":"TEST-FULFILL-TRANSFER"}');
 o:=public.kinto_world_action_v1('employee','test-staff',id,2,'confirm_transfer','{"reference":"TEST-FULFILL-BANK","amount":"40750","currency":"IQD","bank_verified":true}');
 o:=public.kinto_world_action_v1('employee','test-staff',id,3,'purchase','{"reference":"TEST-STORE-ORDER-83","availability_rechecked":true,"within_paid_amount":true}');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_fulfillment_action_v2(%L,%L,%L,4,%L,%L)','employee','test-staff',id,'ship_world','{"tracking":"TEST-PARCEL-83"}'),'WORLD_PREPARATION_REQUIRED');
 o:=public.kinto_world_fulfillment_action_v2('employee','test-staff',id,4,'tracking','{"tracking":"TEST-PARCEL-83"}');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_fulfillment_action_v2(%L,%L,%L,4,%L,%L)','employee','test-staff',id,'tracking','{"tracking":"TEST-STALE"}'),'WORLD_REVISION_CONFLICT');
 o:=public.kinto_world_fulfillment_action_v2('employee','test-staff',id,5,'prepare_shipping','{"tracking":"TEST-PARCEL-83"}');
 IF o->>'state'<>'purchased' OR NOT(o->'purchase' ? 'shipping_requested_at') THEN RAISE EXCEPTION 'PREPARATION';END IF;
 IF public.kinto_world_list_v1('customer','test-customer')->0->'purchase'->>'tracking'<>'TEST-PARCEL-83' THEN RAISE EXCEPTION 'CUSTOMER_TRACKING';END IF;
 o:=public.kinto_world_fulfillment_action_v2('employee','test-staff',id,6,'ship_world','{"tracking":"TEST-PARCEL-83"}');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_fulfillment_action_v2(%L,%L,%L,7,%L)','employee','test-staff',id,'deliver_world'),'WORLD_DELIVERY_CONFIRMATION_REQUIRED');
 o:=public.kinto_world_fulfillment_action_v2('employee','test-staff',id,7,'deliver_world','{"received_confirmed":true}');
 IF o->>'state'<>'delivered' THEN RAISE EXCEPTION 'DELIVERY';END IF;
 IF jsonb_array_length(public.kinto_world_staff_search_v2('employee','test-staff','Fulfillment Unique'))<>1 OR jsonb_array_length(public.kinto_world_staff_search_v2('employee','test-staff','9647701234567'))<>1 OR jsonb_array_length(public.kinto_world_staff_search_v2('employee','test-staff','TEST-STORE-ORDER-83'))<>1 OR jsonb_array_length(public.kinto_world_staff_search_v2('employee','test-staff','TEST-PARCEL-83'))<>1 OR jsonb_array_length(public.kinto_world_staff_search_v2('employee','test-staff',o->>'reference'))<>1 THEN RAISE EXCEPTION 'SEARCH_FIELDS';END IF;
END $$;
RESET ROLE;
-- Push the searched record outside the ordinary 100-row window.
INSERT INTO private.kinto_world_orders_v1(customer_id,request_key,request,estimates,created_at)
SELECT '00000000-0000-0000-0000-000000000002',gen_random_uuid(),'{"items":[],"contact":{"name":"TEST newer"}}','[]',now()+n*interval '1 second' FROM generate_series(1,105) n;
SET ROLE anon;
DO $$BEGIN
 IF jsonb_array_length(public.kinto_world_staff_search_v2('employee','test-staff','TEST-PARCEL-83'))<>1 THEN RAISE EXCEPTION 'OLDER_THAN_100_SEARCH';END IF;
 IF jsonb_array_length(public.kinto_world_staff_search_v2('employee','test-staff','%'))<>0 THEN RAISE EXCEPTION 'WILDCARD_SEARCH';END IF;
END $$;
RESET ROLE;
DO $$BEGIN
 IF (SELECT status FROM public.orders WHERE id=1)<>'LOCAL_SENTINEL' THEN RAISE EXCEPTION 'LOCAL_MUTATION';END IF;
 IF has_table_privilege('anon','private.kinto_world_orders_v1','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'TABLE_ACCESS';END IF;
END $$;
SELECT 'PASS new global fulfillment stages, paid-only/revision/role guards, customer tracking, exact total, server search beyond 100, local preservation';
