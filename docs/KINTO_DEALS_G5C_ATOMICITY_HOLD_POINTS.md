# G5C safety gate — evidence before reservation code

**Scope of this PR:** metadata-only preflight; no executable reservation function, no feature activation, no changes to existing checkout, orders, inventory, invoices, coupon or loyalty logic.

G5B was reported applied live with 6/6 true on 2026-10-02. The quote is a nonbinding preview and must never authorize a gift or decrement allocation.

## What the live preflight must settle
1. Exact redemptions constraints, indexes, state transition triggers and uniqueness; one campaign/order and one verified customer allocation must be idempotent.
2. Customer-session verifier return type and semantics; never use browser-supplied customer ID.
3. Canonical order identity, store ID and status fields, and cancellation/refund states. A redemption references a real order: **do not pre-insert a fake order or issue a stand-alone public reservation before canonical checkout**.
4. Atomicity design: campaign row lock before checking pending+confirmed allocation; deterministic order for multiple campaign locks; verified customer lifetime usage and limited-purchase unit sum checked within the same transaction. The order must be created canonically first or through a tightly controlled internal adapter in the **same database transaction**. No independent pre-booking that could orphan allocation.
5. Duplicate/retry: unique campaign/order is necessary but not sufficient; determine an explicit stable request idempotency key before exposing any write RPC.
6. Failed checkout, declined payment, cancellation and return must have explicit transition semantics before any reservation writes. Confirmed versus pending and released/reversed counts need a written matrix.
7. Gift stock must only use V93 canonical first-paid lifecycle, once, and only after G5D snapshot/invoice tests. No direct stock mutation in G5C.
8. Existing V411 admin-funded discount collision and V310 coupon/earn base require #716 precedence tests before activation.

## Hold points
- Run `docs/KINTO_DEALS_G5C_PREFLIGHT_READONLY.sql`; inspect returned metadata and definitions.
- Implement reservation only in a separate reviewed gate, OFF, with concurrency tests and rollback.
- No browser EXECUTE grant to a write/reserve endpoint in this preflight.
- No migration to run from this PR.
