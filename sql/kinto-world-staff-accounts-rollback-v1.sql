-- Disable only dedicated world-staff accounts; preserve all data and old employee accounts.
BEGIN;
UPDATE private.kinto_world_accounts_v1 SET enabled=false;
UPDATE private.kinto_world_sessions_v1 SET revoked_at=now() WHERE revoked_at IS NULL;
REVOKE ALL ON FUNCTION public.kinto_world_staff_security_service_v1(text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.kinto_world_staff_login_v1(text,text),public.kinto_world_staff_logout_v1(text),public.kinto_world_staff_accounts_v1(text) FROM PUBLIC,anon,authenticated;
COMMIT;
