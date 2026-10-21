# KINTO Payment-P3 — admin design and isolated outcome simulator

## Scope and dependencies reviewed

Payment-P3 is based on merged G16 PR #996 and Payment-P2 PR #997. It only restyles the existing **طرق الدفع** panel and adds a test helper under `tests/`. It adds no new admin tab and does not change manual payment methods, OTP checks, payment configuration RPCs, G16/P2 SQL, the customer checkout UI, order functions, stock triggers, coupons, invoices, campaigns, rewards, login, or tracking.

The prior `feature/kinto-electronic-payment` branch contains G19's larger in-memory journey simulator and G20/G21 quote, reservation, webhook and finalization code. G19's simulator models paid orders, invoices, and inventory in memory; G21 has separate SQL-facing confirmation and explicitly rejects the simulator provider. Those modules are not copied into P3 because this stage must not create paid-order or post-payment state, even in the new simulator. P3 instead simulates only the provider outcome boundary.

## Admin design

`css/admin-payment-methods-p3.css` is loaded by the existing G16 module and every selector is scoped below `#g16PaymentMethods`. The payment methods, G16 runtime controls, and P2 provider panel use KINTO dark green `#0a2f23`, raised green surfaces, gold borders and accents, and cream form fields with dark text. Focus states, status colors, wrapping controls, and a narrow-screen layout are included. OTP prompts retain their existing flow and remain within the same panel.

P3 does not write settings or SQL. The P2 emergency stop remains governed by its existing persisted runtime state; this change neither calls the resume RPC nor changes the effective manual mode or closed collection gate. The UI continues to communicate that the simulator is test-only and no company gateway is integrated.

## Simulator contract

`tests/support/payment-outcome-simulator-p3.mjs` is imported only by its Node tests. Construction requires an explicit test-only flag. It makes no network calls and has no Supabase, provider SDK, order-engine, invoice, or stock dependency. It stores simulated attempts and notification keys in memory only.

Scenarios return `simulated_success`, `simulated_failure`, `simulated_cancelled`, or `unknown` with reconciliation required for a connection loss. Success is not a verified gateway callback and never authorizes the paid state. Reusing an idempotency key returns the original result. Replaying a notification key is deduplicated. All modeled collection, durable payment record, order, invoice, stock, and paid-state side-effect counts remain zero.

## Future integration boundary

The next payment integration stage must create a durable payment intent only after the server validates the quote and holds the matching reservation. A real adapter must retain the original provider key, verify provider callbacks server-side, and deduplicate event IDs. Success may reach the existing paid transition only after amount, currency, intent, customer, and unexpired reservation checks pass, with the existing order engine and stock trigger applying the transition once. A network disconnect remains unknown until reconciliation; it must not release a hold or be treated as a failure or success prematurely. P3 implements none of those database or order actions.

## SQL, rollback, and verification

No SQL is required: P3 adds no database objects or stored settings. No SQL was run. Rollback is the normal code revert of this PR; no data rollback is needed.

Run:

```sh
npm run test:payments:p3
node --check js/admin-payment-methods-g16.js
node --check js/admin-payment-providers-p2.js
node --check tests/support/payment-outcome-simulator-p3.mjs
git diff --check
```

The simulator tests exercise success, failure, cancellation, network disconnect, idempotent attempts, duplicate notifications, and the zero-side-effect boundary. Existing G16 and P2 tests run in the same command. These are application-level checks, not Supabase integration tests. The UI preview is for visual review only; the P2 panel still reads its configured Supabase environment.
