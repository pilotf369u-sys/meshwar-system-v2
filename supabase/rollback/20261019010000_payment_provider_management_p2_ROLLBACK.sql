-- Payment-P2 rollback. Run only after disabling any future caller of the server gate.
-- The append-only audit table is intentionally retained as an archive; no audit
-- records or G16 settings are deleted. No CASCADE is used.
begin;

drop function if exists public.kinto_payment_p2_assert_new_payment_allowed(text);
drop function if exists public.kinto_payment_provider_admin_p2(text, text, text, boolean, text);
drop table if exists public.kinto_payment_runtime_p2;
drop table if exists public.kinto_payment_providers_p2;

-- Keep kinto_payment_provider_audit_p2 with RLS and revoked client access so
-- rollback does not erase the administrative history. Archive/export it before
-- any separately approved cleanup.

commit;
