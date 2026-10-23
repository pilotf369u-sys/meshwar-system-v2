-- Disposable tests only. Existing fake customer/admin/employee guards come from preceding tests.
CREATE TABLE public.branches(id text PRIMARY KEY,name text,is_active boolean);INSERT INTO public.branches VALUES('branch-1','TEST Branch 1',true),('branch-2','TEST Branch 2',true);
CREATE TABLE public.couriers(id text PRIMARY KEY,name text,branch_id text,is_active boolean);INSERT INTO public.couriers VALUES('courier-1','TEST Courier 1','branch-1',true),('courier-2','TEST Courier 2','branch-2',true),('courier-off','TEST Disabled','branch-1',false);
CREATE FUNCTION private.require_branch_session_v148(token text) RETURNS text LANGUAGE plpgsql AS $$BEGIN IF token='test-branch-1' THEN RETURN 'branch-1';ELSIF token='test-branch-2' THEN RETURN 'branch-2';END IF;RAISE EXCEPTION 'BRANCH_SESSION_INVALID';END $$;
CREATE FUNCTION private.require_courier_session_v149(token text) RETURNS text LANGUAGE plpgsql AS $$BEGIN IF token='test-courier-1' THEN RETURN 'courier-1';ELSIF token='test-courier-2' THEN RETURN 'courier-2';END IF;RAISE EXCEPTION 'COURIER_SESSION_INVALID';END $$;
\i sql/kinto-world-workflow-integration-v1.sql
CREATE FUNCTION pg_temp.expect_error(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $$BEGIN BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN;END IF;RAISE;END;RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: %',expected;END $$;
SET ROLE anon;
DO $$DECLARE roles jsonb;BEGIN
 roles:=public.kinto_world_login_roles_v1('0000071001');IF roles->'roles'<>'["world_employee"]'::jsonb THEN RAISE EXCEPTION 'ROLE_NOT_FOUND';END IF;
 roles:=public.kinto_world_login_roles_v1('unknown-local');IF roles->'roles'<>'[]'::jsonb THEN RAISE EXCEPTION 'LOCAL_ROLE_CHANGED';END IF;
 PERFORM public.kinto_world_staff_accounts_v1('test-admin');
 PERFORM public.kinto_world_assign_staff_v1('test-admin','00000000-0000-0000-0000-000000000004',true);
END $$;
DO $$DECLARE o jsonb;id uuid;req jsonb;q jsonb;BEGIN
 req:='{"policy_accepted":true,"contact":{"name":"TEST customer","phone":"00000000","address":"TEST destination address"},"items":[{"url":"https://www.trendyol.com/test-p-123456","title":"TEST routed product","price":"1000","quantity":1,"options_confirmed":true}]}';
 q:=jsonb_build_object('goods','35750','shipping','5000','currency','IQD','expires_at',now()+interval '1 hour','instructions','TEST bank only — no transfer','can_ship',true,'availability_checked',true);
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000000081',req);id:=(o->>'id')::uuid;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_dispatch_action_v1(%L,%L,%L,0,%L,%L)','employee','test-staff',id,'route','{"target_role":"branch","target_id":"branch-1"}'),'WORLD_DISPATCH_REQUIRES_PAID_PURCHASE');
 o:=public.kinto_world_action_v1('employee','test-staff',id,0,'quote',q);
 o:=public.kinto_world_action_v1('customer','test-customer',id,1,'transfer','{"reference":"TEST-ROUTE-TRANSFER"}');
 o:=public.kinto_world_action_v1('employee','test-staff',id,2,'confirm_transfer','{"reference":"TEST-ROUTE-BANK","amount":"40750","currency":"IQD","bank_verified":true}');
 o:=public.kinto_world_action_v1('employee','test-staff',id,3,'purchase','{"reference":"TEST-ROUTE-PURCHASE","availability_rechecked":true,"within_paid_amount":true}');
 PERFORM public.kinto_world_dispatch_action_v1('employee','test-staff',id,4,'route','{"target_role":"branch","target_id":"branch-1"}');
 IF jsonb_array_length(public.kinto_world_dispatch_list_v1('branch','test-branch-1'))<>1 OR jsonb_array_length(public.kinto_world_dispatch_list_v1('branch','test-branch-2'))<>0 THEN RAISE EXCEPTION 'BRANCH_SCOPE';END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_dispatch_action_v1(%L,%L,%L,5,%L)','branch','test-branch-2',id,'receive'),'WORLD_DISPATCH_ACTION_DENIED');
 PERFORM public.kinto_world_dispatch_action_v1('branch','test-branch-1',id,5,'receive');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_dispatch_action_v1(%L,%L,%L,6,%L,%L)','branch','test-branch-1',id,'assign_courier','{"target_id":"courier-2"}'),'WORLD_TARGET_INVALID');
 PERFORM public.kinto_world_dispatch_action_v1('branch','test-branch-1',id,6,'assign_courier','{"target_id":"courier-1"}');
 IF jsonb_array_length(public.kinto_world_dispatch_list_v1('courier','test-courier-1'))<>1 OR jsonb_array_length(public.kinto_world_dispatch_list_v1('courier','test-courier-2'))<>0 THEN RAISE EXCEPTION 'COURIER_SCOPE';END IF;
 PERFORM public.kinto_world_dispatch_action_v1('courier','test-courier-1',id,7,'receive');
 PERFORM public.kinto_world_dispatch_action_v1('courier','test-courier-1',id,8,'start_delivery');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_dispatch_action_v1(%L,%L,%L,9,%L,%L)','employee','test-staff',id,'reroute','{"target_role":"branch","target_id":"branch-2"}'),'WORLD_DISPATCH_ACTION_DENIED');
 PERFORM public.kinto_world_dispatch_action_v1('courier','test-courier-1',id,9,'deliver');
 IF (public.kinto_world_list_v1('customer','test-customer')->0->>'state')<>'delivered' THEN RAISE EXCEPTION 'DELIVERY_STATE';END IF;
END $$;
RESET ROLE;
DO $$BEGIN
 IF (SELECT count(*) FROM private.kinto_world_fulfillment_events_v1)<>6 THEN RAISE EXCEPTION 'DISPATCH_AUDIT';END IF;
 IF (SELECT status FROM public.orders WHERE id=1)<>'LOCAL_SENTINEL' THEN RAISE EXCEPTION 'LOCAL_ORDER_MUTATED';END IF;
 IF has_table_privilege('anon','private.kinto_world_fulfillment_v1','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'DIRECT_ACCESS';END IF;
END $$;
SELECT 'PASS integrated global login role, paid purchase routing, branch/courier ownership, delivery, audit and local preservation';
