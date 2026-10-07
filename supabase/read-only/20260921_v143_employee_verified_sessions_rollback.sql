-- KINTO V143 / phase 2A rollback
-- Removes only V143 employee-session objects. Existing platform data is untouched.

begin;

drop function if exists public.employee_logout_v143(text);
drop function if exists public.employee_session_identity_v143(text);
drop function if exists public.employee_login_v143(text, text);
drop function if exists private.require_employee_session_v143(text);
drop table if exists public.employee_login_attempts_v143;
drop table if exists public.employee_sessions_v143;

commit;
