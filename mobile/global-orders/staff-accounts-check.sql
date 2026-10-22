-- Disposable DB only: no real email, identity, password or money.
CREATE SCHEMA extensions;CREATE EXTENSION pgcrypto WITH SCHEMA extensions;CREATE ROLE service_role;
\i sql/kinto-world-staff-accounts-v1.sql
CREATE FUNCTION pg_temp.expect_error(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $$BEGIN BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN;END IF;RAISE;END;RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: %',expected;END $$;
SET ROLE anon;
DO $$BEGIN
 BEGIN PERFORM public.kinto_world_staff_security_service_v1('test-admin','request','{}');RAISE EXCEPTION 'OTP_BYPASS';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
SET ROLE service_role;
SELECT public.kinto_world_staff_security_service_v1('test-admin','request',jsonb_build_object('payload',jsonb_build_object('operation','create','name','TEST global staff','phone','0000071001'),'code_hash',repeat('a',64))) AS challenge \gset
SELECT (:'challenge'::jsonb->>'challenge_id') AS challenge_id \gset
SELECT public.kinto_world_staff_security_service_v1('test-admin','verify',jsonb_build_object('challenge_id',:'challenge_id','code_hash',repeat('b',64),'password','TEST-ONLY-password')) AS failed \gset
SELECT public.kinto_world_staff_security_service_v1('test-admin','verify',jsonb_build_object('challenge_id',:'challenge_id','code_hash',repeat('a',64),'password','TEST-ONLY-password')) AS created \gset
SELECT public.kinto_world_staff_security_service_v1('test-admin','verify',jsonb_build_object('challenge_id',:'challenge_id','code_hash',repeat('a',64),'password','TEST-ONLY-password')) AS replay \gset
RESET ROLE;
SELECT (:'created'::jsonb->>'id') AS account_id \gset
SET ROLE anon;
SELECT public.kinto_world_staff_login_v1('0000071001','TEST-ONLY-password') AS login \gset
SELECT (:'login'::jsonb->>'session_token') AS staff_token \gset
SELECT public.kinto_world_list_v1('world_employee',:'staff_token');
SELECT public.kinto_world_staff_logout_v1(:'staff_token');
SELECT pg_temp.expect_error(format('SELECT public.kinto_world_list_v1(%L,%L)','world_employee',:'staff_token'),'WORLD_STAFF_SESSION_INVALID');
DO $$DECLARE r jsonb;BEGIN
 FOR i IN 1..5 LOOP r:=public.kinto_world_staff_login_v1('0000071002','TEST-ONLY-wrong');IF r->>'ok'<>'false' THEN RAISE EXCEPTION 'BAD_LOGIN';END IF;END LOOP;
 r:=public.kinto_world_staff_login_v1('0000071002','TEST-ONLY-wrong');IF r->>'error'<>'WORLD_LOGIN_LOCKED' THEN RAISE EXCEPTION 'RATE_LIMIT';END IF;
END $$;
SELECT public.kinto_world_staff_login_v1('0000071001','TEST-ONLY-password') AS second_login \gset
SELECT (:'second_login'::jsonb->>'session_token') AS second_token \gset
RESET ROLE;
SET ROLE service_role;
SELECT public.kinto_world_staff_security_service_v1('test-admin','request',jsonb_build_object('payload',jsonb_build_object('operation','disable','id',:'account_id'),'code_hash',repeat('c',64))) AS disable_challenge \gset
SELECT (:'disable_challenge'::jsonb->>'challenge_id') AS disable_id \gset
SELECT public.kinto_world_staff_security_service_v1('test-admin','verify',jsonb_build_object('challenge_id',:'disable_id','code_hash',repeat('c',64))) AS disabled \gset
RESET ROLE;
SET ROLE anon;
SELECT pg_temp.expect_error(format('SELECT public.kinto_world_list_v1(%L,%L)','world_employee',:'second_token'),'WORLD_STAFF_SESSION_INVALID');
SELECT pg_temp.expect_error(format('SELECT public.kinto_world_list_v1(%L,%L)','employee',:'second_token'),'EMPLOYEE_SESSION_INVALID');
RESET ROLE;
SELECT CASE WHEN :'failed'::jsonb->>'error'='WORLD_CODE_INVALID' AND :'created'::jsonb->>'ok'='true' AND :'replay'::jsonb->>'error'='WORLD_CHALLENGE_INVALID' AND :'disabled'::jsonb->>'ok'='true' THEN 1 ELSE 0 END AS otp_result \gset
SELECT 1 / :otp_result AS otp_assertion;
DO $$BEGIN
 IF (SELECT count(*) FROM private.kinto_world_accounts_v1)<>1 OR (SELECT count(*) FROM private.kinto_world_accounts_v1 WHERE enabled)<>0 THEN RAISE EXCEPTION 'ACCOUNT_STATE';END IF;
 IF (SELECT count(*) FROM private.kinto_world_accounts_v1 WHERE password_hash LIKE '$2%')<>1 THEN RAISE EXCEPTION 'PASSWORD_NOT_HASHED';END IF;
 IF has_table_privilege('anon','private.kinto_world_accounts_v1','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','private.kinto_world_sessions_v1','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'DIRECT_ACCESS';END IF;
 IF (SELECT status FROM public.orders WHERE id=1)<>'LOCAL_SENTINEL' THEN RAISE EXCEPTION 'LOCAL_MUTATION';END IF;
END $$;
SELECT 'PASS global-only staff login/logout, revoked sessions, login rate limit and unchanged local sentinel';
