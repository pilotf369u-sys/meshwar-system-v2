# Payment-P5 verification status

The P5 migration and simulator functions were applied to the isolated Supabase project `KINTO-Payment-Test` (`udtegahgxgqvflodjkjt`) only. No SQL was sent to the original project. The database tests used the restored KINTO schema plus its existing G16, P2, and P4 migrations; no separate mock order or stock engine was used.

Observed on the isolated database:

- A server quote used the real store/product/variant rows and returned a 1,000 IQD total for the P4 red/large test product; shipping remained excluded.
- A rolled-back two-store finalization exercised V161, V310, and the existing paid-status stock trigger. It produced one KP and two KN rows, both paid, consumed the eligible coupon, and decremented the total and matrix stock once each. The deliberately rolled-back SQL transaction left no orders or stock changes behind.
- A failure simulation returned `failed`, released the hold, and did not create an order. The test transaction was rolled back afterward.
- An unknown-outcome simulation returned `reconciliation_required` and retained the hold. The test transaction was rolled back afterward so no unresolved hold was left behind.
- An invalid customer session was rejected by the database session validator.
- A read-only post-test check found zero active/unknown holds and zero unresolved attempts before settings restoration.

Additional targeted checks were run on `KINTO-Payment-Test` through the deployed Edge Function HTTP endpoint using temporary customer sessions:

- Guest, expired-session, and forged-session calls were rejected.
- Two distinct test customers could not read each other's attempt.
- Caller-supplied amount, currency, and customer identity fields were ignored by the quote path; the server returned the stored IQD pricing. An unrecognized `paid` simulation result was rejected.
- Two simultaneous HTTP reservation requests raced for the only stock unit. Exactly one reservation won. Replaying its idempotency key returned the same KP attempt. Cancellation released the hold; the test created no order and no real collection.
- Temporary sessions and the second test customer were removed. The project returned to manual mode with P2 emergency stop on, simulator/provider disabled, P4 electronic readiness off, and zero active or unresolved P4/P5 holds. An earlier paid P4 fixture order was observed and left unchanged.

The Edge HTTP race used two concurrent requests but does not expose or prove two separately pinned PostgreSQL backend sessions. It is therefore not a substitute for a native two-connection database race. The integration run also did not prove browser HTTP attacks from the deployed customer application, or a live KINTO direct-campaign payment.

Direct campaigns remain a hard blocker: G20 currently creates a KN order before returning, and its canonical quota reservation depends on that order. P5 has no isolated pre-order hold for campaign quota, selected campaign products, and gift inventory, nor a tested post-payment call into G20. No campaign fixtures exist in the isolated database. We did not add an unverified parallel campaign engine or change G20/V47.

The Vercel deployment reports Ready, but its preview URL redirects to Vercel Login in the browser, so the customer-facing preview is not accessible for end-to-end review from this environment. The test-project Edge preview endpoint is served as `text/plain`, not executable HTML. The standalone `payment-p5-isolated-preview.html` is in this PR and uses only the test project, but the current Vercel access protection prevents browser verification. These gaps mean P5 is **not ready** to merge or activate. No live gateway or financial collection was tested.

The temporary test settings were restored to manual mode, emergency stop on, simulator disabled, and provider intake closed after verification. See the read-only SQL under `supabase/verification` and the operational disable procedure under `supabase/rollback`.
