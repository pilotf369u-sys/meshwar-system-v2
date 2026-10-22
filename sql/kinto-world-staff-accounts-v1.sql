-- Review draft: isolated global-only accounts. No public employee/admin/auth mutations.
BEGIN;
CREATE TABLE private.kinto_world_accounts_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,phone text NOT NULL UNIQUE,password_hash text NOT NULL,enabled boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE private.kinto_world_sessions_v1(token_hash bytea PRIMARY KEY,account_id uuid NOT NULL REFERENCES private.kinto_world_accounts_v1(id),expires_at timestamptz NOT NULL,revoked_at timestamptz);
CREATE TABLE private.kinto_world_attempts_v1(identity_hash bytea NOT NULL,attempted_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ON private.kinto_world_attempts_v1(identity_hash,attempted_at);
CREATE TABLE private.kinto_world_challenges_v1(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admin_id uuid NOT NULL,payload jsonb NOT NULL,code_hash text NOT NULL,attempts integer NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',consumed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.kinto_world_accounts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kinto_world_sessions_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kinto_world_attempts_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kinto_world_challenges_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_world_accounts_v1,private.kinto_world_sessions_v1,private.kinto_world_attempts_v1,private.kinto_world_challenges_v1 FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.kinto_world_require_staff_v1(p_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;BEGIN
 SELECT a.id INTO actor FROM private.kinto_world_accounts_v1 a JOIN private.kinto_world_sessions_v1 s ON s.account_id=a.id WHERE s.token_hash=extensions.digest(coalesce(p_token,''),'sha256') AND s.revoked_at IS NULL AND s.expires_at>now() AND a.enabled;
 IF actor IS NULL THEN RAISE EXCEPTION 'WORLD_STAFF_SESSION_INVALID'; END IF;RETURN actor;END $$;
CREATE FUNCTION public.kinto_world_staff_login_v1(p_phone text,p_password text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE account private.kinto_world_accounts_v1; identity bytea; token text;BEGIN
 IF length(coalesce(trim(p_phone),'')) NOT BETWEEN 5 AND 40 OR char_length(coalesce(p_password,''))<8 OR octet_length(coalesce(p_password,'')) NOT BETWEEN 8 AND 72 THEN RETURN '{"ok":false,"error":"WORLD_LOGIN_INVALID"}';END IF;
 identity:=extensions.digest(trim(p_phone),'sha256');PERFORM pg_advisory_xact_lock(hashtextextended(encode(identity,'hex'),71023));
 IF (SELECT count(*) FROM private.kinto_world_attempts_v1 WHERE identity_hash=identity AND attempted_at>now()-interval '15 minutes')>=5 THEN RETURN '{"ok":false,"error":"WORLD_LOGIN_LOCKED"}'; END IF;
 SELECT * INTO account FROM private.kinto_world_accounts_v1 WHERE phone=trim(p_phone);
 IF account.id IS NULL OR NOT account.enabled THEN
  -- Constant-cost password work also for an unknown/disabled account.
  PERFORM extensions.crypt(p_password,'$2a$10$abcdefghijklmnopqrstuu');
  INSERT INTO private.kinto_world_attempts_v1 VALUES(identity,now());RETURN '{"ok":false,"error":"WORLD_LOGIN_INVALID"}'; END IF;
 IF extensions.crypt(p_password,account.password_hash) IS DISTINCT FROM account.password_hash THEN INSERT INTO private.kinto_world_attempts_v1 VALUES(identity,now());RETURN '{"ok":false,"error":"WORLD_LOGIN_INVALID"}';END IF;
 token:=encode(extensions.gen_random_bytes(32),'hex');
 INSERT INTO private.kinto_world_sessions_v1 VALUES(extensions.digest(token,'sha256'),account.id,now()+interval '8 hours',NULL);
 RETURN jsonb_build_object('ok',true,'session_token',token,'expires_at',now()+interval '8 hours','staff',jsonb_build_object('id',account.id,'name',account.name,'role','world_employee'));
END $$;
CREATE FUNCTION public.kinto_world_staff_logout_v1(p_session_token text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 UPDATE private.kinto_world_sessions_v1 SET revoked_at=now() WHERE token_hash=extensions.digest(coalesce(p_session_token,''),'sha256')
$$;
CREATE FUNCTION public.kinto_world_staff_accounts_v1(p_session_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM private.require_admin_session_v147(p_session_token);RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'phone',phone,'enabled',enabled,'role','world_employee') ORDER BY created_at DESC) FROM private.kinto_world_accounts_v1),'[]');END $$;
-- SERVICE ONLY. OTP verification and account creation are atomic. Incorrect OTP attempts persist.
CREATE FUNCTION public.kinto_world_staff_security_service_v1(p_admin_session_token text,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; c private.kinto_world_challenges_v1; aid uuid; payload jsonb;BEGIN
 actor:=private.require_admin_session_v147(p_admin_session_token)::uuid;
 IF p_action='request' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,71024));
  IF (SELECT count(*) FROM private.kinto_world_challenges_v1 WHERE admin_id=actor AND created_at>now()-interval '15 minutes')>=3 THEN RETURN '{"ok":false,"error":"WORLD_OTP_RATE_LIMIT"}';END IF;
  payload:=p_data->'payload';
  IF payload->>'operation'='create' THEN
   IF length(coalesce(trim(payload->>'name'),'')) NOT BETWEEN 2 AND 120 OR coalesce(payload->>'phone','') !~ '^\+?[0-9]{5,20}$' THEN RAISE EXCEPTION 'WORLD_ACCOUNT_INVALID';END IF;
   payload:=jsonb_build_object('operation','create','name',trim(payload->>'name'),'phone',payload->>'phone');
  ELSIF payload->>'operation'='disable' THEN
   aid:=(payload->>'id')::uuid;IF NOT EXISTS(SELECT FROM private.kinto_world_accounts_v1 WHERE id=aid AND enabled) THEN RAISE EXCEPTION 'WORLD_ACCOUNT_NOT_FOUND';END IF;
   payload:=jsonb_build_object('operation','disable','id',aid);
  ELSE RAISE EXCEPTION 'WORLD_OPERATION_INVALID';END IF;
  IF coalesce(p_data->>'code_hash','') !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'WORLD_OTP_INVALID';END IF;
  UPDATE private.kinto_world_challenges_v1 SET consumed_at=now() WHERE admin_id=actor AND consumed_at IS NULL;
  INSERT INTO private.kinto_world_challenges_v1(admin_id,payload,code_hash) VALUES(actor,payload,p_data->>'code_hash') RETURNING * INTO c;
  RETURN jsonb_build_object('ok',true,'challenge_id',c.id);
 END IF;
 SELECT * INTO c FROM private.kinto_world_challenges_v1 WHERE id=(p_data->>'challenge_id')::uuid AND admin_id=actor FOR UPDATE;
 IF NOT FOUND OR c.consumed_at IS NOT NULL OR c.expires_at<=now() THEN RETURN '{"ok":false,"error":"WORLD_CHALLENGE_INVALID"}';END IF;
 IF p_action='cancel' THEN UPDATE private.kinto_world_challenges_v1 SET consumed_at=now() WHERE id=c.id;RETURN '{"ok":true}';END IF;
 IF p_action<>'verify' THEN RAISE EXCEPTION 'WORLD_OPERATION_INVALID';END IF;
 IF c.attempts>=5 THEN RETURN '{"ok":false,"error":"WORLD_CHALLENGE_LOCKED"}';END IF;
 IF p_data->>'code_hash' IS DISTINCT FROM c.code_hash THEN UPDATE private.kinto_world_challenges_v1 SET attempts=attempts+1 WHERE id=c.id;RETURN '{"ok":false,"error":"WORLD_CODE_INVALID"}';END IF;
 IF c.payload->>'operation'='create' THEN
  IF char_length(coalesce(p_data->>'password',''))<8 OR octet_length(coalesce(p_data->>'password','')) NOT BETWEEN 8 AND 72 THEN RAISE EXCEPTION 'WORLD_PASSWORD_INVALID';END IF;
  INSERT INTO private.kinto_world_accounts_v1(name,phone,password_hash) VALUES(c.payload->>'name',c.payload->>'phone',extensions.crypt(p_data->>'password',extensions.gen_salt('bf',10))) RETURNING id INTO aid;
 ELSE
  aid:=(c.payload->>'id')::uuid;UPDATE private.kinto_world_accounts_v1 SET enabled=false WHERE id=aid;UPDATE private.kinto_world_sessions_v1 SET revoked_at=now() WHERE account_id=aid;
 END IF;
 UPDATE private.kinto_world_challenges_v1 SET consumed_at=now() WHERE id=c.id;
 INSERT INTO private.kinto_world_events_v1(actor_id,actor_role,action,revision,detail) VALUES(actor,'admin','world_account_'||(c.payload->>'operation'),0,jsonb_build_object('account_id',aid));
 RETURN jsonb_build_object('ok',true,'id',aid);
END $$;
CREATE OR REPLACE FUNCTION private.kinto_world_actor_v1(p_role text,p_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;BEGIN
 IF p_role='world_employee' THEN RETURN private.kinto_world_require_staff_v1(p_token);END IF;
 IF p_role='customer' THEN RETURN private.require_customer_review_session(p_token)::uuid;END IF;
 IF p_role='admin' THEN RETURN private.require_admin_session_v147(p_token)::uuid;END IF;
 IF p_role='employee' THEN actor:=private.require_employee_session_v143(p_token)::uuid;IF EXISTS(SELECT FROM private.kinto_world_staff_v1 WHERE employee_id=actor AND enabled) THEN RETURN actor;END IF;END IF;
 RAISE EXCEPTION 'WORLD_ACCESS_DENIED' USING ERRCODE='42501';END $$;
REVOKE ALL ON FUNCTION private.kinto_world_require_staff_v1(text),private.kinto_world_actor_v1(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.kinto_world_staff_security_service_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kinto_world_staff_security_service_v1(text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.kinto_world_staff_login_v1(text,text),public.kinto_world_staff_logout_v1(text),public.kinto_world_staff_accounts_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_world_staff_login_v1(text,text),public.kinto_world_staff_logout_v1(text),public.kinto_world_staff_accounts_v1(text) TO anon,authenticated;
COMMIT;
