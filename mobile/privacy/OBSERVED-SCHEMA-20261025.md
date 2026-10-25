# Owner-supplied live schema metadata — 25 October 2026

The owner executed a READ ONLY catalog query and uploaded its result. We parsed one complete JSON object: 149 tables, 1,195 columns, 163 candidate functions, 8 direct customer foreign keys, transaction_read_only=on. No customer rows, credentials, function bodies or storage object names were supplied. The raw uploaded file is not copied into Git.

Relevant differences from the initial small fixture:

- public.orders.customer_id is text and details is text, not uuid/jsonb. Shipping/reward snapshots are separate jsonb columns. The observed test exercises the shipped review functions with the text types without changing the original fixture's fresh-profile erasure test.
- public.customers has embedded cart_items/rewards_log/reward_balances, wallet fields, address, state, country and secondary_phone. Deleting or disabling only login fields cannot cover account-data fulfillment.
- public.customer_portal_sessions exists in addition to public.customer_review_sessions. It has a UUID customer_id but no direct FK in the supplied report. The current erasure guard correctly holds it; silently bypassing the guard or deleting only the review session would be unsafe.
- private.kinto_world_orders_v1.customer_id is UUID without a direct FK. request/quote/payment/purchase and event.detail carry indirect data. public.orders and payment/loyalty customer references also use logical text links.
- public.local_orders has customer_name/customer_phone without a customer_id. public.order_store_segments.customer_snapshot is jsonb. No automatic match-by-name or match-by-phone deletion is authorized.
- public.profiles carries names/contact fields but its mapping to customer accounts is not established by this customer-FK report. No auth.users deletion or role changes are inferred.
- Review images can exist as database payloads and Storage paths. Ownership and backup/retention behavior are still not proven by column metadata.

The supplied body hashes for private.require_customer_review_session, public.customer_session_identity_v150 and public.customer_submit_product_review_v132 did not exactly match the bodies found in the checkout. This does not establish a functional/security difference: whitespace alone changes the hash. Their actual deployed definitions are not assumed to be the shipped fixture definitions. A narrowly scoped normalized-hash comparison can distinguish formatting from a source mismatch without exposing function bodies or user data. The admin validator was not included by the query's body-content filter, so its absence from that list does not establish that it is missing.

`observed-schema-check.sql` is a synthetic transaction that models only these relevant table types, not every production constraint, trigger, RLS policy or function. It proves that existing fixture review ownership works with observed text order types and that the erasure guard holds secondary sessions/logical links without mutating either account's local/global orders, messages or sessions. It rolls its own schema/data changes back. This is not proof of full production erasure or permission to enable it.

Production deletion remains disabled. No account/order/payment/customer data or configuration was read or changed by the agent. The owner-supplied metadata advances schema alignment only; full identity/media/retention closure is still required.

Validation passed: https://github.com/pilotf369u-sys/meshwar-system-v2/actions/runs/40192455263 . The observed-type ownership and held-erasure checks, existing browser flows and rollback all passed. Next narrowly scoped owner query: sql/kinto-privacy-session-contract-readonly-v1.sql (four function definitions only, no execution of application RPCs).
