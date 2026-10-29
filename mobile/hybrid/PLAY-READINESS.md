# KINTO Android — preparation checkpoint, 2026-10-23

This is a non-production release candidate, not authorization to publish.

## Baseline and rollback

- Main and 00-hostinger-release: f0ee283d12b3896a177aee4353a1bfc64a9e3909.
- Rollback: rollback/before-play-prep-20261023 at that commit.
- Working branch: app/play-prep-20261023, based on current main; does not depend on unmerged Zara PR #1059.
- Hostinger read-only HTTP verification: index.html, dashboard.html, global-stores.html and .well-known/assetlinks.json returned HTTP 200 and exactly matched baseline bytes. This is a four-file deployment check, not an audit of every deployed file.
- Local sales/auth/orders/payments/invoices/stock/coupons/SQL files are outside this change. No production writes, migrations, deployment, merge or store submission.

## Candidate behavior

- Existing Trendyol and Hepsiburada readers and order-button remain byte-identical to baseline.
- Zara integration stays on its existing experiment branch; no Zara order overlay in this candidate. Other stores keep the existing external-browser behavior.
- Removes unsolicited product-reading toast and misleading local-test-basket message from real-product capture.
- Keeps price, shipping exclusion, availability/payment disclosure, and customer options confirmation.
- Approved adaptive/background/monochrome icon files copied without modifications from KINTO_Final_Approved_Android_iOS_Icons.zip.
- Targets API 36. AGP 8.10.1 / Gradle 8.11.1 / Java 17; no native .so libraries.
- Existing onBackPressed behavior retained via documented temporary predictive-back opt-out, to prevent API36 silently bypassing invoice/video/store history handling. Native regression runs on Android36.
- Release is non-debuggable. Test intent extras and synthetic menu entries require the actual Android debuggable flag. Release assets exclude synthetic product/pricing/video/WebView test documents. No tests can submit production orders.

## Build outputs and signing

- Candidate identity: com.kinto.preview.hybrid.v15, versionCode15. Not the production identity; final versionCode must exceed any existing Play release.
- Gradle produces unsigned AAB and APK for structural validation only. CI signs a separate candidate APK with a disposable test key outside checkout for device checks. Neither this key nor package is approved for Play publication.
- Production com.kinto.app and assetlinks fingerprint unchanged:
  43:83:9F:A3:0A:84:72:D1:D0:DE:9B:39:4F:D7:18:4A:0F:1A:2A:3A:73:97:A9:94:73:34:BD:01:0D:CB:7E:33
- Fingerprint was introduced by a6fea611 (Add Android Digital Asset Links for KINTO test app). A public certificate fingerprint is not a private signing key or proof of Play account ownership.
- No release signing configuration, passwords, private keys or keystores committed. Local Gradle build outputs and private key extensions ignored.

## Remaining release blockers

1. Owner opens Play Console: determine whether com.kinto.app already exists, owning developer account, highest versionCode, Play App Signing certificate and upload certificate. Do not create/replace signing keys or change assetlinks until verified. A missing PWABuilder key does not block candidate development.
2. Customer account deletion: no clear in-app customer deletion path or dedicated public deletion resource found in repository inspection. Admin employee deletion is unrelated. Need implement an authenticated request path and approved retention policy without breaking orders/invoices; production database work needs separate approval.
3. Privacy policy / Data Safety: prepare public accurate policy, developer contact/identity, account/order/chat/photo data inventory, external-store browsing disclosure and retention/deletion details. Do not assert "no data collected". Owner must confirm business details and real support contact.
4. Real-device candidate acceptance: customer login/logout, cart, local/global orders, invoices, video, chat, return navigation, no-data connectivity; Trendyol/Hepsi price/options on real product pages. CI synthetic tests do not prove all retailer pages work.
5. Final store images/listing, content rating, reviewer access account and required Play test track. New personal accounts may require 12 opted-in testers for 14 consecutive days; confirm account type/date in Console.
6. Review the external-store WebView/reading feature against Google Play Webviews and Affiliate Spam policy and retailer terms/permission scope. KINTO adds its own order service; that does not by itself establish retailer authorization or guarantee acceptance. No permission evidence has been verified in this checkpoint.
7. Signed production AAB, Play pre-launch report and owner approval before any upload/rollout. This branch has no Play publishing automation.

## Official references checked

- https://developer.android.com/google/play/requirements/target-sdk
- https://developer.android.com/build/releases/agp-8-10-0-release-notes
- https://developer.android.com/about/versions/16/behavior-changes-16
- https://support.google.com/googleplay/android-developer/answer/13327111
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/14151465

- https://support.google.com/googleplay/android-developer/answer/9899034
