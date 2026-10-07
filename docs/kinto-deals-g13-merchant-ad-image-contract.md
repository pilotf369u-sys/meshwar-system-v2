# G13 — Merchant campaign advertising image (implementation contract)

Baseline: kinto-deals-public-display-stable-g12. This feature is isolated from customer notice/coupon media, order checkout and product images.

## Verified current state
- Merchant composer: vendor-dashboard-v2.html + js/vendor-kinto-deals-g4c-draft.js; currently saves text, products, dates and terms through kinto_deals_v1_vendor_save_draft_g4, with no advertising image upload input.
- Customer renderer: js/kinto-deals-customer-g7.js; feed returns campaign_id, store_id, title, description, kind, starts_at, ends_at, no image URL.
- Admin reviewer: js/admin-kinto-deals-g3f.js and its embedded copy in admin-dashboard.html. An existing campaign_image_url rendering branch does not constitute a merchant upload workflow.
- Existing customer-notice-media-v427 is an unrelated admin-notice asset service. Never reuse its bucket or authorization.

## Required safe implementation sequence
1. Add a dedicated PRIVATE storage bucket kinto-merchant-campaign-ads and campaign-owned asset metadata. Only one active image per campaign; object paths scoped to campaign UUID. No browser write permissions.
2. Add a vendor-session-verified Edge Function upload endpoint. Validate campaign ownership and editable draft state server-side before accepting; verify WebP file signature, dimensions <=1200x1200 and bytes <=200KB. Upload only after campaign draft has a server ID; on DB attach failure delete orphan.
3. Merchant browser transforms JPG/PNG/WebP into correctly oriented bounded WebP via canvas, with quality/dimension fallback to <=200KB; show preview and upload outcome. No raw original is retained. Replacing an image atomically swaps metadata then queues the old campaign-owned object for deletion.
4. Add read-only image access for approved, explicitly published, date-valid campaign via controlled public URL or signed delivery, not direct public bucket listing. Feed retains every existing review/store/date/publication guard.
5. Add compact 16:9 ad image in store's published campaign card, responsive; no images on directory store card, only existing gold badge.
6. Expiry cleanup: scheduled server-side job marks expired campaign assets, verifies no active references, deletes only objects in dedicated bucket, then clears metadata; retry failures and log them. Never delete products, gift, coupons or notices. Date filtering already hides expired ads independently of cleanup.
7. Add E2E/static guards for ownership, upload rejection, approval/publication, replacement, expiry and deletion; do not touch merchant_deals_enabled or cart/checkout.

No migrations/deployment executed by merely creating this branch. Supabase migrations and Edge Function deployment must be explicitly reviewed before use.
