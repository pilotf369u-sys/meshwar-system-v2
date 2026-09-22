-- KINTO V149 rollback: removes only V149 courier-session objects.
begin;
drop function if exists public.courier_logout_v149(text);
drop function if exists public.courier_session_identity_v149(text);
drop function if exists public.courier_login_v149(text, text);
drop function if exists private.require_courier_session_v149(text);
drop table if exists public.courier_login_attempts_v149;
drop table if exists public.courier_sessions_v149;
commit;
