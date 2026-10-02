# KINTO DEALS V1 — Agreed Product & G2 UI Contract
Status: AGREED with Omar, 2026-10-02. Design review required before G2 merchant wizard is adopted. This document supplements, not replaces, the G0 architecture/audit/handoff and G1 isolation contract.

## Immutable boundaries
- Exactly one merchant store owns each deal. Never touch legacy checkout, auth, shipping, stock, invoice, or existing admin-funded KINTO campaign paths until separately audited and signed off.
- Feature flag remains OFF by default. Server-authoritative eligibility, verified customer identity, ownership, time, pricing, stock, concurrency, replay protection, and per-customer redemption limits. Additive migrations, scoped PRs, green gates, checkpoint/rollback.
- Existing independent per-store invoices remain the ONLY invoice system. On a qualifying order, merchant-selected free gift is shown on that store's existing invoice at full price plus a matching 100% campaign discount. Snapshot original terms; other stores are unaffected.
- Merchant submits a deal to an ADMIN inbox automatically; admin separately chooses whether to broadcast through existing customer notices. Merchant cannot broadcast to customers directly.

## Campaign modes (no mandatory discount, gift, or shipping)
1. Choose N paid products from a merchant-selected set (e.g. 4 out of 10) to unlock merchant-preselected gift, if configured.
2. Buy N eligible paid units from selected products (e.g. 2) to unlock merchant-preselected gift, if configured. Clarify unit-vs-distinct-SKU counting in the server contract.
3. Exclusive / limited product campaign: cap per verified customer across campaign duration (e.g. max 2), optionally total campaign allocation; no fake gift, zero discount, or forced incentive.
- At most ONE free gift per qualifying store order, even when quantity exceeds threshold; gifts never count as qualifying paid units.
- Merchant chooses number of uses per verified customer; default ONE. Enforce across orders server-side. Pending/prepayment cancellation may release reserved entitlement; paid refunds preserve original snapshot and follow an explicit reversal policy.
- Optional merchant-funded internal free shipping only; NEVER silently waive shared external shipping. Existing admin-funded v411 campaign coexistence stays disabled pending a separate stacking decision.

## G2 merchant wizard — review design with Omar BEFORE adoption
Four responsive stages, premium KINTO dark green #0a2f23 and gold:
1. Eligible products and (if applicable) gift: reuse merchant's familiar search by product NAME or BARCODE for BOTH lists; results show image, name, barcode, availability, and belong ONLY to authenticated merchant store. Clearly separate qualifying paid products from preselected gift. Multiple products selectable.
2. Campaign type and optional conditions: choose-from-set threshold, buy-N threshold, exclusive limited-product/customer cap; optional gift, discount, internal vendor shipping. Do not impose unnecessary incentives.
3. Duration, overall allocation, verified-customer redemption limit (default 1), campaign media, safety limits.
4. Mobile/desktop customer-facing preview and explicit submission to ADMIN; no direct customer broadcast or automatic feature activation.

## Customer-facing interaction
- Store listing shows active campaign badge; store page shows campaign banner and responsive dedicated gold/green view with countdown.
- Show live, server-backed remaining allocation for exclusive products (e.g. 7/30), progress bar; never imply browser-local counts are authoritative.
- Gift qualification progress (e.g. 3 of 4 eligible paid products; add one more). Display clear terms and limits.

## Campaign media and storage hygiene
- Merchant may upload static or animated campaign visual (e.g. GIF / animated WebP) with preview and mobile/desktop fit without distortion. Apply safe MIME, size, ownership, and content constraints.
- Keep campaign assets in a dedicated Storage bucket, not product image storage; use an ownership-bound path.
- On campaign expiration or definitive deletion, a scheduled trusted-server cleanup removes unreferenced campaign media after a short safety grace period, with logged outcomes and retry on failure. Do not delete shared/referenced media.
- Preserve minimum campaign/audit, confirmed order, gift, redemption and invoice snapshots even after media cleanup. Do not delete financially relevant history.

## Emergency merchant controls
- PAUSE immediately blocks NEW eligibility/redemptions; resume only while within date/stock/ownership rules, with server validation.
- DELETE means irreversible retirement/hide from active storefront, blocks new uses, schedules media cleanup; use soft-delete/tombstone for records needed for audit and confirmed orders. Confirm destructive action explicitly.
- Previously confirmed orders and invoice snapshots remain unchanged. Revalidate or release unconfirmed reservations according to safe state rules; no retroactive removal of a confirmed gift.
- Admin may also need moderation/stop controls under its own permission model.

## Stock and safeguards
- Gift stock and variant validated atomically on authoritative checkout path before confirmation; integrate canonical paid stock lifecycle exactly once, no alternative checkout or direct UI stock deduction.
- If gift stock exhausts, stop new qualifying entitlements, notify merchant, preserve already confirmed/reserved rights according to defined reservation policy.
- Existing merchant product quantity +/- behavior is tested and CLOSED; do not modify it.

## Reporting
- Small post-launch merchant performance card: verified beneficiaries, redemptions, gifts granted, remaining allocation. Defer full analytics until after safe V1 rollout.

## Gate status and resume instructions
- G0 docs + read-only contracts: PR #706 MERGED.
- G1 additive isolated five-table schema, RLS, no browser grants, feature OFF: PR #707 MERGED. SQL quoting corrected in PR #708 MERGED; Omar reported running corrected SQL successfully in Supabase.
- Live G1 consolidated read-only postflight reported by Omar: deals_tables=5, rls_enabled=5, feature_enabled=false, policies_count=0, browser_grants=0. Existing checkout v101, kinto_campaigns, orders were present.
- G2 NEXT: show merchant wizard visual design for Omar's approval BEFORE adopting; isolated test branch, no activation, no legacy order edits.
- G3 admin inbox; G4 storefront; G5 authoritative checkout bridge after audit/signoff; G6 existing per-store invoice adapter and gated rollout.
- Keep separate checkpoint before each merge. Omar runs required Supabase SQL himself. No silent migrations, feature enablement, or deployment of unfinished purchase flow.
