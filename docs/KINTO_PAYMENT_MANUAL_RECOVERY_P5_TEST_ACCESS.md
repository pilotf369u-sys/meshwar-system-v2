# KINTO manual checkout recovery and P5 simulator access

This change restores the normal manual cart path when the P5 Edge Function is
missing or unreachable. The client retries the existing session-validated
`kinto_payment_p5_mode_read_v1` RPC directly. Manual checkout is allowed only
when the server returns `effective_mode=manual` and `transition_state=stable`.
An absent helper, a failed RPC, electronic mode, or transition state cannot be
translated into manual mode. In the manual case the unchanged
`kinto_checkout_session_v1` RPC remains the order-creation path.

P5 simulation access is separate from payment-mode configuration. A verified
admin session may allowlist an existing `P5T-` test customer for 1–1,440 minutes through
`kinto_payment_p5_test_access_admin_v1`; customer sessions cannot grant access.
The private allowlist has no client table privileges. The P5 Edge Function
checks eligibility before quote/reserve/start/simulate, and the service-role-only
simulation dispatcher repeats the allowlist check before either simulator
finalizer. The migration does not enable the simulator or real collection.

## Verification

- `node --test tests/payment-mode-fallback.test.mjs`: tests Edge outage to
  session-checked RPC fallback, stable-manual acceptance, electronic and
  draining rejection of manual fallback, unknown state, and the unauthorized
  test-access response.
- The migration was applied to the isolated `KINTO-Payment-Test` project only.
  There, the access check was exercised with temporary customer/admin sessions:
  a normal customer was denied, self-grant was denied, a verified-admin grant
  was accepted, a too-long grant was rejected, simulation dispatch passed its
  allowlist gate for an authorized account, and admin revocation removed access.
  Temporary fixtures were deleted in the same test block.
- A second isolated SQL check called the actual `kinto_checkout_session_v1`
  against the restored KINTO schema with two stores. It produced two ordinary
  `KN` orders in the employee/vendor intake state, created the normal store
  segments, left both products' stock unchanged, did not mark orders paid, and
  created no P5 payment rows. The test ran inside a rollback-only subtransaction.
- The isolated project was left with G16/P4 in stable manual mode, no active P5
  test accounts, no active/unknown holds, P5 simulator disabled, emergency stop
  enabled, and real collection disabled.
- Production was queried read-only: P4/G16 report stable manual, P5 simulator
  and real collection are false, and the manual checkout RPC and P5 tables and
  dispatcher exist. The database migration ledger contains only
  `20261019170812`; this was not treated as proof that later P5 SQL was absent,
  because the corresponding objects already exist. No production migration was
  replayed and the P5 test-access table is not present in production.

The database verification queries are in
`supabase/verification/20261019180000_kinto_payment_p5_test_access_verify.sql`.
The safe close procedure revokes all allowlist entries while retaining the
fail-closed dispatcher in
`supabase/rollback/20261019180000_kinto_payment_p5_test_access_close.sql`.

## Production gate

Do not apply the new migration or deploy `kinto-payment-p5` to production until
the existing archive has passed an actual restore test. The archive is intact
as a PostgreSQL custom-format dump, but its restorability has not been proven.
The Edge Function's `verify_jwt=false` setting is explicit in
`supabase/config.toml`; the handler still validates KINTO customer sessions and
the server-side test allowlist. Real collection remains disabled.
