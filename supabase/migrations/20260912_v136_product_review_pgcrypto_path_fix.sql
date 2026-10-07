-- KINTO V136: make the isolated V132 review-session functions resolve pgcrypto
-- in Supabase projects where extensions are installed in the `extensions` schema.
-- Additive configuration-only repair: no tables or business rows are changed.

begin;

create extension if not exists pgcrypto with schema extensions;

alter function private.require_customer_review_session(text)
  set search_path = public, private, extensions, pg_temp;

alter function public.customer_review_login_v132(text, text)
  set search_path = public, private, extensions, pg_temp;

alter function public.customer_review_logout_v132(text)
  set search_path = public, private, extensions, pg_temp;

commit;
