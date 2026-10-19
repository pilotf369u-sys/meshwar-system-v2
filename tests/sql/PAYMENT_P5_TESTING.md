# Payment-P5 verification status

The P5 migration and simulator functions were applied to the isolated Supabase project `KINTO-Payment-Test` (`udtegahgxgqvflodjkjt`) only. No SQL was sent to the original project. The database tests used the restored KINTO schema plus its existing G16, P2, and P4 migrations; no separate mock order or stock engine was used.

Observed on the isolated database:

- A server quote used the real store/product/variant rows and returned a 1,000 IQD total for the P4 red/large test product; shipping remained excluded.
- A rolled-back two-store finalization exercised V161, V310, and the existing paid-status stock trigger. It produced one KP and two KN rows, both paid, consumed the eligible coupon, and decremented the total and matrix stock once each. The deliberately rolled-back SQL transaction left no orders or stock changes behind.
- A failure simulation returned `failed`, released the hold, and did not create an order. The test transaction was rolled back afterward.
- An unknown-outcome simulation returned `reconciliation_required` and retained the hold. The test transaction was rolled back afterward so no unresolved hold was left behind.
- An invalid customer session was rejected by the database session validator.
- A read-only post-test check found zero active/unknown holds and zero unresolved attempts before settings restoration.

The tests did **not** establish two independent authenticated customers, a real browser/Edge HTTP checkout, native concurrent P5 reservations from two database sessions, or direct campaign checkout. The existing G20 direct-order RPC still creates an order before payment and is blocked by P4's electronic-mode order gate; P5 does not yet provide a safe campaign/gift/quota hold-and-finalize path. Those are blockers to calling P5 complete or ready for activation. No live gateway or financial collection was tested.

The temporary test settings were restored to manual mode, emergency stop on, simulator disabled, and provider intake closed after verification. See the read-only SQL under `supabase/verification` and the operational disable procedure under `supabase/rollback`.
