# KINTO iOS continuation audit — 2026-11-16

Read-only comparison snapshots:
- iOS work before this audit: app/kinto-ios-preview-20261027 @ 25a30520d548a01aad7698970ed637bd13515d72.
- main @ acc0e81a83d4e8d4e207f0a97003c1fea56b7c36.
- 00-hostinger-release @ 20cb32a32657ae53fb7203bc069483a73e840ac9. A branch SHA is not proof of what Hostinger currently serves.
- main's manual Play 29 unsigned builder checks out fix/play-whatsapp-direct-open-and-shop-support-20261030; inspected head a54cfe8aa4c88f52d058fda82efb0f287f83e661. This identifies the workflow's configured source, not independent proof of the installed Play binary or its signing.

## Working state
- iOS has simulator-only WKWebView account shell, separate ephemeral retailer store, Android-derived readers, a local pricing core, preliminary product review, and trusted invoice popup. Synthetic isolation, reader/pricing and popup tests previously passed on a simulator.
- No signed installable iPhone or TestFlight build is established. No actual iPhone login, sale, payments, invoices, retail-site reading or real order journey is verified.
- Global product submission remains explicitly disabled. The preliminary Swift quote dialog does not provide full Android product review, size choices, quantity, image, draft, order handoff or receipt handling.
- The UI has an additional preview navigation bar, unlike the accepted Android presentation. It requires alignment.
- Only six named retailer hosts have in-app readers; other HTTPS links open externally after confirmation. H&M must remain controlled by existing CMS visibility.

## Current updates and gaps
- WhatsApp: main and Hostinger-release branches have a CMS-based floating support asset. Android configured Play-29 source handles validated wa.me URLs directly and has a native support overlay in its separate external store process. Existing iOS showed a confirmation dialog, and lacked the retailer overlay. This audit adds direct handling of validated wa.me destinations from trusted user-activated KINTO links, without embedding a phone number. This is not proof the website's JavaScript window.open is recognized as a user-activated link by WKWebView: test the actual widget, both target-blank and native retailer support, and verify CMS-selected phone. App Review guideline 2.5.9: do not block expected links to other applications.
- Password: main and Hostinger-release dashboard contain the existing kinto-customer-password-v1.js integration. iOS loads shopkinto.com rather than bundling that dashboard. Whether the current production-served version and password flow work on iOS are not yet verified; preserve existing session/RPC.
- Images: inspected main and Hostinger-release customer-product-reviews-v135.js contain MAX_IMAGES=1, a 25 KiB target and 50 KiB maximum. This is an observation of those exact files, not a declaration that every image type or later experimental branch has those limits. Vendor product image preparation has a different 1600px/350KiB decision path. Verify current accepted product/review rules and native chooser/camera handling on iPhone before any change.
- Invoices: the iOS popup and Android mobile layout were tested with synthetic markup only. Test actual electronic and manual invoices, discounts, print, popup lifecycle, and device layout without modifying invoice logic or creating live orders.
- Published order/cart/login/session fixes depend on the version actually served by shopkinto.com, not only on repository contents. Verify deployment identity and conduct device tests without changing data, configuration, or production orders.
- Account-deletion page in main and Hostinger-release prepares an email. Apple's 5.1.1(v) guidance requires in-app initiation and generally does not allow non-regulated apps to require an email/support flow. Review the actual service and design a direct request path separately; no DB, auth, policy, or hosting change is included here.
- Apple 5.2.2 requires authorization for third-party services where applicable; confirm rights and document evidence. 4.2 minimum functionality and 2.1 completeness apply. 1.2 user-generated-content safeguards need review for actual review/chat features. Privacy labels and deletion practices require a factual inventory.

## Priority
1. Reconcile runtime/deployed site and accepted Android capabilities; use existing flows, not copies.
2. Complete isolated global product review and handoff with validation and synthetic integration; no real production order.
3. Test account login/password, image picker/compression, invoices, support and customer navigation on actual iPhone; resolve compatibility without changing site/database.
4. Review privacy, deletion, moderation, external-store rights, permissions and App Review access. Remove all internal test hooks/fixtures from any release build.
5. Produce signed TestFlight build and test with account holder; do not submit, merge or deploy without explicit request.

Apple references: https://developer.apple.com/app-store/review/guidelines/ ; https://developer.apple.com/support/offering-account-deletion-in-your-app/ .
