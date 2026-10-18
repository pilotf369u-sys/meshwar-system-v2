# Payment-P4 isolated PostgreSQL tests

These scripts are for a **disposable restored KINTO database only**. They write fixture settings and order/product/payment rows inside the database; the lifecycle script rolls its transaction back. Do not point them at production. P4 does not run them automatically, and this task did not execute SQL.

## Prerequisites

- Restore the real KINTO schema and prerequisite migrations from the reviewed `main` base (`d146b6a`) into a disposable PostgreSQL/Supabase project, then apply only `20261019030000_kinto_payment_p4_attempts_holds.sql` there.
- Use a dedicated test customer and a dedicated product in the clone. Set `P4_TEST_CUSTOMER_ID`, `P4_TEST_PRODUCT_ID`, and `P4_TEST_STORE_ID` to their UUIDs. The product must have no existing P4 attempts or holds.
- Install `psql`. Use a database owner connection to the isolated clone. The test configuration turns off the emergency stop only in that disposable clone, selects a non-test-only fixture provider, and marks P4 electronic admission ready so server-side invariants can be exercised. It does not call a provider or collect money.

## Lifecycle and mode-switch assertions

```bash
psql "$P4_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v customer_id="$P4_TEST_CUSTOMER_ID" \
  -v product_id="$P4_TEST_PRODUCT_ID" \
  -v store_id="$P4_TEST_STORE_ID" \
  -f tests/sql/payment-p4-lifecycle.sql
```

The test transaction asserts:

- a paid manual order remains paid;
- the first electronic transition closes intake and reports unpaid manual orders without cancelling them;
- cancellation requires an explicit admin session and `no payment verified` attestation, and late manual payment confirmation is denied while electronic mode is active;
- a reservation never changes physical total stock;
- configured color/size availability and exact `matrix_stock` combinations cannot be double-held;
- repeat reservation with the same idempotency key returns the same attempt;
- a repeated provider event is idempotent;
- a pending attempt that exceeds 15 minutes becomes `reconciliation_required`, keeps the hold, and blocks returning to manual;
- a late failure notification does not release an attempt already marked unknown;
- only an admin-session reconciliation with explicit `confirmed_no_charge` or `refunded` evidence releases that hold, after which the manual switch can finish.

## Native two-session last-unit race

Use a fresh disposable database or a fresh fixture product with total stock set to one and no existing holds. This launches two independent `psql` processes against the same product row:

```bash
P4_TEST_ALLOW_WRITES=YES_DISPOSABLE_ONLY \
P4_TEST_DATABASE_URL="$P4_TEST_DATABASE_URL" \
P4_TEST_CUSTOMER_ID="$P4_TEST_CUSTOMER_ID" \
P4_TEST_PRODUCT_ID="$P4_TEST_PRODUCT_ID" \
P4_TEST_STORE_ID="$P4_TEST_STORE_ID" \
bash tests/sql/payment-p4-two-session-race.sh
```

Expected result: one reservation commits; the competing transaction is rejected with `PAYMENT_P4_INSUFFICIENT_TOTAL_STOCK`. Both sessions lock product IDs in sorted order. The runner refuses the known KINTO production project ref and requires an explicit disposable-write acknowledgement.

## What is not tested here

The scripts do not prove live Supabase RLS behavior, live provider signature verification, actual gateway settlement, customer checkout UI, or any payment finalizer. Real provider integration remains out of scope and P2's production emergency stop remains enabled. Run these only after the project owner has restored a disposable KINTO database; no local PostgreSQL/Supabase runtime is available in this workspace.
