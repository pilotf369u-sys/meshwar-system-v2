# G3D: connect approved admin review design to real moderation

Prerequisites: G3A admin inbox/decision SQL applied and seven live checks true; G3B vendor feed SQL applied and six live checks true; G3C mock design accepted and merged as PR #715; gift/coupon policy PR #716 merged.

1. First run the read-only ONE-RESULT preflight to inspect actual product image/barcode and store display columns. Do not guess names from frontend or grant direct browser table access.
2. Introduce a narrow verified-admin campaign detail RPC. It must verify private.require_admin_session_v147(text), scope detail to submission/campaign/store, return campaign image reference from the eventual dedicated deals-media contract, eligible product image/name/barcode, gift, terms, review revision and dates. No write or direct table grants.
3. Bind the accepted G3C admin UI to public.kinto_deals_v1_admin_inbox_g3(token) for independent pending counter and public.kinto_deals_v1_admin_decide_g3(token,submission_id,revision,decision,reason). Obtain token ONLY from KintoAdminSessionV147.read().token; never accept reviewer/store IDs from the browser.
4. Disable buttons during a decision, confirm action, require rejection reason, re-fetch inbox after server success; display stale/duplicate/expired errors without optimistic publication. Approved means moderation acknowledged, NOT storefront active.
5. Merchant decision feed already exists. Push notifications, actual vendor submission RPC, media bucket, approved-only customer listing and G5 checkout bridge are separate later gates.
6. Keep feature flag OFF. No edits to existing checkout, orders, invoice, shipping, stock, customer notices or admin-funded campaigns. No SQL applied automatically.
