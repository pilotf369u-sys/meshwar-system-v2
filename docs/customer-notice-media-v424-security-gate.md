# V424 — Customer notice media: implementation gate

Baseline: checkpoint/customer-notices-store-logos-stable-20261001. Do not alter order, auth, campaign, loyalty, or existing customer notice feed contracts.

## Verified current state
- V417 admin_delete_customer_notice_v417 already deletes text-only notices and refuses attachment-backed notices.
- V418 private bucket kinto-customer-notice-media allows JPEG/PNG/WebP/GIF, 5 MiB; kinto_customer_notice_assets_v418 has one asset per notice, FK ON DELETE RESTRICT, no anon/authenticated table or storage writes.
- Existing admin composer has a delete button calling V417. No secure attachment lifecycle endpoint is currently wired.

## Required server-side gate before UI release
1. Privileged Edge Function checks exact allowlisted Origin AND active admin session server-side (not merely client-side token existence); service-role credentials never leave the server.
2. Verify actual bytes and decoded image properties, dimensions/frame count and bounded resource usage, not filename/MIME alone. JPEG/PNG/WebP: client resize/re-encode to bounded dimensions and bytes for convenience; server independently validates. GIF: preserve animation; reject if it exceeds limits, never silently flatten.
3. Only one asset per notice, UUID-derived object path, private bucket. Associate asset only with a notice authorized for the acting admin. Do not expose a generic upload endpoint or public object URL.
4. Authorized recipients obtain short-lived signed read URL only after server checks recipient/session ownership.
5. Delete is retry-safe: mark deletion pending, revoke access to the notice, remove Storage object, then remove asset row and notice/recipient rows. Failed Storage cleanup leaves a retryable pending state; never claim full deletion while an object remains. Missing object is an idempotent success.
6. Orphan cleanup: on upload/DB failure remove object; periodically reconcile pending and unattached objects. Never permit arbitrary bucket/path deletion from client input.
7. Bound rate, size, dimensions, count and input lengths; no SVG or HTML; no direct storage policies for anon/authenticated. Handle concurrent send/delete, expired sessions and duplicate requests.
8. Regression tests: existing V420 notice feed and store logo links, text-only deletion, no cross-customer media access, unauthorized admin rejection, malformed/polyglot image rejection, oversize GIF rejection, Storage failure/retry, no leaked public URL.

## Release order
- Secure DB lifecycle and Edge Function.
- Admin picker/compression/preview + send/delete wiring.
- Customer authorized display and failure fallbacks.
- CI tests, staging deploy and SQL review, then explicit approval before merge.

This document is an audit gate, not a deployment instruction. V418 alone must NOT be treated as a finished media feature.
