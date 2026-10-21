-- Safe close/rollback for test access. Do not drop the authorization gate:
-- the Edge Function and database dispatcher fail closed without it.
begin;
update private.kinto_payment_test_accounts_p5
set revoked_at=coalesce(revoked_at,clock_timestamp())
where revoked_at is null;
commit;

-- Read-only confirmation: this must return 0.
select count(*) as active_test_accounts
from private.kinto_payment_test_accounts_p5
where revoked_at is null and expires_at>clock_timestamp();
