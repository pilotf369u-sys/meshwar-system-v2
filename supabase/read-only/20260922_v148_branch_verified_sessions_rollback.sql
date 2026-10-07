-- KINTO V148 rollback: removes only V148 branch-session objects.
begin;
drop function if exists public.branch_logout_v148(text);
drop function if exists public.branch_session_identity_v148(text);
drop function if exists public.branch_login_v148(text, text);
drop function if exists private.require_branch_session_v148(text);
drop table if exists public.branch_login_attempts_v148;
drop table if exists public.branch_sessions_v148;
commit;
