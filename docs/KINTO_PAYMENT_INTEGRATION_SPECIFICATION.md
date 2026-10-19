# KINTO Payment Integration Specification

## Purpose and status

This document defines the boundary for adding a future payment company to KINTO. KINTO Simulator is the first temporary provider and belongs to the same payment flow. It is a no-charge test provider; it is not a separate checkout or order system.

No payment company has been selected. This specification does not publish or invent a callback, return, or webhook URL. Those values can be agreed and configured only after a provider is selected and its current technical documentation has been reviewed.

## Architecture rule

Provider-specific code must stop at a verified, normalized payment result. The common KINTO flow owns quote validation, reservation, coupon and campaign rules, KP/KN linkage, invoice records, the single trusted transition to **تم التسديد**, and the existing staff, merchant, shipping, and tracking lifecycle.

The shared order engine must not inspect card fields, provider signatures, redirect parameters, SDK callbacks, QR payloads, or simulator scenarios. It must receive only a server-verified result tied to the immutable KINTO attempt, amount, currency, and provider reference.

## Provider connection models

An adapter declares the capabilities it actually supports. A provider can support one or more models; KINTO must not assume a common browser flow.

| Model | Adapter responsibility | KINTO trust rule |
|---|---|---|
| Hosted checkout / redirect | Create a provider session and return its approved launch URL and opaque session reference. | A browser return is informational. KINTO verifies the outcome with a signed webhook or provider-side status query before finalizing. |
| Embedded checkout / SDK | Create a short-lived provider session and expose only the provider's documented public session data. | SDK success callbacks are not payment evidence. The server verifies a signed event or queries the provider. |
| Server API / webhook | Create or authorize the provider operation and validate the provider's documented webhook signature and event semantics. | Validate signature, timestamp/replay window, merchant account, provider transaction reference, amount, currency, and final status before passing a normalized event to the common finalizer. |
| Payment Link | Create a provider-owned link with an immutable KINTO attempt reference and expiry where supported. | Link completion is not trusted from the browser; verify the provider event or query the provider. |
| QR | Create and display only a provider-generated or provider-approved QR payload bound to the attempt and expiry. | A QR scan or client screenshot is not payment evidence; verify the provider event or query the provider. |

## Adapter contract

Each adapter is an isolated server-side module. Its conceptual operations are:

1. **Describe capabilities:** provider key, adapter version, supported integration models, currencies, amount precision, checkout expiry, verification methods, and supported refund/query features.
2. **Create checkout:** accept the server-owned attempt ID, KP, amount, currency, idempotency key, and a server-configured return/callback policy. Return only the launch data required by that provider model. Never accept an amount or customer identity supplied only by the browser.
3. **Verify outcome:** accept the provider's raw server-to-server event, redirect reference, or query response. Verify it using the provider's documented signature and/or authenticated status API. Normalize to `pending`, `succeeded`, `failed`, `cancelled`, or `unknown`, retaining the provider's immutable transaction/event references.
4. **Reconcile unknown outcomes:** query the provider using the stored provider reference; keep the stock reservation until a verified terminal result is available. A timeout or network error is `unknown`, never an assumed failure or success.
5. **Request refund, when supported:** use an idempotent server operation and record the provider's refund reference and result. Refund handling is separate from the order's fulfillment state.

The adapter must not create operational orders or update KINTO stock, coupons, campaign quotas, invoices, rewards, order statuses, or settlement ledgers. Only the common trusted finalization boundary may invoke the existing order engine after verifying a successful payment.

## Common payment and order invariants

- One customer payment is represented by one KP. A multi-store basket creates the existing separate KN and invoice for each store through the canonical checkout engine.
- Store prices and currency policy remain authoritative. KINTO does not invent an exchange rate or combine unlike currencies.
- Quotes are recalculated server-side. Client-submitted totals, discounts, coupon values, quantities, store ownership, variant selection, and campaign eligibility are untrusted.
- A reservation is idempotent and locks product/variant/matrix availability without prematurely deducting physical stock. Finalization must preserve the existing one-time stock deduction guards.
- Coupon and direct-campaign eligibility are checked server-side. A direct campaign cannot be combined with a coupon.
- Success, failure, cancellation, delayed events, duplicate events, partial refunds, provider timeouts, and unknown results are bound to a unique KINTO attempt and provider event. Replays cannot create a second KP/KN or deduct stock twice.
- Unknown or unresolved results retain their reservation. Mode switching must drain and reconcile them before releasing the reservation or accepting new orders in the target mode.
- The P2 emergency stop remains server-enforced. Real collection stays disabled until separately reviewed provider-specific implementation, production backup/rollback checks, and explicit owner approval.
- PAN and CVV are never sent to KINTO servers, logged, or stored. For embedded flows, sensitive card entry must remain in the provider's PCI-compliant hosted fields/SDK. KINTO receives only provider session and transaction references.

## Secrets, roles, and configuration

- Merchant secrets, signing secrets, API credentials, and private keys belong only in server-side secret storage used by the Edge Function or a provider-owned secure component. They must not be placed in browser JavaScript, HTML, public database rows, GitHub, logs, support tickets, or this specification.
- Store only non-secret provider configuration and opaque references where the application requires them. Restrict secret access to the payment service identity; rotate and revoke credentials using the provider's documented process.
- Browser requests may start a checkout for the authenticated owner of an attempt, but may not assert success, alter amount/currency/provider reference, invoke a finalizer, or read another customer's KP/KN/invoice records.
- Provider webhook authentication is independent of customer login. Validate the provider-specific signature and replay protections before any database finalization call.
- Never bypass payment/order guards with client-controlled SQL session variables or request headers.

## Information to request from a prospective provider

Request the current official integration documentation and obtain:

- Legal merchant onboarding requirements, supported merchant country, settlement account/currency, settlement timing, fees, reserve/chargeback policy, and supported test/live environments.
- All supported connection models: hosted redirect, embedded SDK/hosted fields, server API, webhooks, payment links, and QR, including which features are available to KINTO's merchant account.
- API/SDK versions, supported platforms and browsers, checkout session creation, expiry, idempotency, cancellation, status query, refunds, partial refunds, and settlement/reconciliation APIs.
- Exact webhook signing algorithm, signing key provisioning/rotation, canonical payload construction, timestamp tolerance, retry policy, event ID uniqueness, delivery order, and test-event procedure.
- Supported currencies, amount precision/minimum/maximum, rounding, multi-currency behavior, final capture semantics, and the authoritative source for a transaction's final status.
- Required callback/return URLs, domain allowlisting, redirect behavior, and any app/deep-link restrictions. KINTO will provide actual URL values only after implementing and reviewing the chosen adapter.
- Required customer data, data residency/retention, PCI responsibilities, security contacts, incident process, and production certification checklist.
- Sandbox credentials and test cards/events only after the adapter design is agreed. Credentials must be shared through an approved secret channel, never in chat or source control.

## Current PR #1004 implementation review

The current paid-order path still calls the existing `kinto_checkout_session_v1`; the order engine itself was not changed for the simulator. Simulator card validation is in the Edge Function and the card fields are checked in memory, not persisted or forwarded.

However, provider replacement is **not yet implemented as a complete adapter seam**. The current P5 flow is simulator-bound in several places:

- The P5 override of `kinto_payment_attempt_reserve_p4` requires `selected_provider_key='kinto-simulator'` and the P5 simulator runtime flag.
- P5 `start`/`simulate` operations and `pay` card validation target the simulator; the Edge Function has no provider adapter registry or provider-specific verification interface yet.
- The trusted order-finalization block is embedded in `kinto_payment_p5_simulate_v1` and gated by simulator state. A future provider would otherwise need to duplicate or rewrite that finalization logic.
- P2 currently catalogs `simulator`, `hosted_checkout`, `api`, and `sdk`, but there are no implemented provider connectors, and Payment Link/QR are not yet represented as runtime capabilities.

This means the canonical **post-payment order engine is preserved**, but KINTO cannot safely switch to a real provider by configuration alone. Before the first company integration, a separate reviewed change must extract a provider-neutral, service-only finalizer that accepts a normalized result only after trusted server verification, move provider verification/checkout creation into isolated adapters, and make reservation selection capability-driven while keeping the simulator's card/scenario rules private to that adapter. The new adapter must pass the same common quote, hold, finalization, idempotency, and order lifecycle tests without modifying the canonical order engine.

## Integration acceptance gate

Before enabling a real provider, verify its official docs and account configuration, create the adapter and secrets, test its sandbox events including replay and out-of-order delivery, reconcile unknown outcomes, test refunds and multi-store orders, prove one-time stock/coupon/campaign effects, run role-isolation checks, review the production migration and rollback, and obtain explicit owner approval. Until then, the KINTO Simulator remains clearly labelled as a no-charge simulation and real collection remains disabled.
