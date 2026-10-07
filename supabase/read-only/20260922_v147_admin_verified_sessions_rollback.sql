-- KINTO V147 rollback: removes only V147 admin-session objects.
begin;
drop function if exists public.admin_logout_v147(text);
drop function if exists public.admin_session_identity_v147(text);
drop function if exists public.admin_login_v147(text, text);
drop function if exists private.require_admin_session_v147(text);
drop table if exists public.admin_login_attempts_v147;
drop table if exists public.admin_sessions_v147;
commit;
