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

## Owner-exported session contracts received

A second owner-run READ ONLY query supplied all four requested definitions: customer session validator, admin session validator, customer identity and review submit. All four exist. Comparing SQL body tokens while preserving quoted literals and ignoring only comments/formatting found a match to shipped source. Customer validator search_path also includes extensions as required by the deployed pgcrypto setup. No production function replacement is needed or proposed.

`owner-session-contract-fixture.sql` contains those definitions for disposable tests only. Bootstrap now installs them before capturing the original-function preservation snapshot. Additional checks exercise identity scoping/password omission and expired/revoked admin tokens. The helper review_delivered_product remains the shipped fixture implementation; it was not one of the four exported definitions, and full live grants/RLS/triggers were not supplied. Do not claim this is a full production clone or general authentication audit.

Tests passed with the four owner-exported definitions: https://github.com/pilotf369u-sys/meshwar-system-v2/actions/runs/40193909952 . Customer identity/password omission, expired/revoked admin access, privacy/review/browser flows, observed text order types and held secondary sessions, preservation and rollback all passed. No production function changes were needed.

## Owner dependency export received (third report)

Parsed the complete owner-supplied Markdown JSON cell after undoing Markdown backslash/pipe escaping: transaction_read_only=on, 104 public/private foreign keys, 43 scoped noninternal triggers and all three requested bucket configurations. The curated companion OWNER-DEPENDENCIES-20261025.json records definitions of relationships/triggers and hashes of decoded function exports; raw uploads and function bodies are not packaged. These are observed metadata, not a completed deletion test.

- Review deletion cascades through product_review_images to product_review_image_payloads and through upload tickets/helpful votes. The report has no scoped review/image DELETE trigger which queues Storage cleanup. Cascading database rows therefore does not establish that stored image objects were removed; capture verified ownership before row removal and verify the storage deletion separately.
- product-review-images is public, with a 51,200-byte cap and JPEG/PNG/WebP allowed. Removing a database reference or revoking a session is insufficient to remove an already public object. Existing access and upload behavior is not changed here.
- chat-attachments is private; file_size_limit and allowed_mime_types are null in bucket-level settings. This alone does not show missing global limits, RPC validation or access policies. Those policies/object ownership were not exported. kinto-customer-notice-media is private, capped at 5,242,880 bytes and allows JPEG/PNG/WebP/GIF; shared notices must not be erased for a single recipient.
- World order events, fulfillment, fulfillment events and receipts reference private.kinto_world_orders_v1 without ON DELETE CASCADE. They must not be treated as disposable customer preferences. Session links and embedded data still require identity-aware handling.
- Order triggers cover session writes, stock, status/payment transitions, order segments and settlement. In particular, the AFTER UPDATE order-segment trigger delegates to a helper, and the settlement guard conditionally protects anon/authenticated callers. A privileged erasure routine must not assume existing caller-dependent guards will prevent financial changes. Do not disable triggers or rewrite order details as a shortcut to anonymization.
- The report contains no customer DELETE trigger in its scoped trigger list. This is not evidence that all logical customer references are covered by foreign keys, nor that a generic customer DELETE is safe.

No new live SQL, customer data access, storage configuration changes or production writes were performed by the agent. Production erasure remains disabled. Next engineering work is explicit ownership-aware media/session/account handling and a reviewed financial/backup retention policy, not another rebuild of the accepted app.
