# Android preview 0.11 — ZARA Turkey adapter (activation pending)

Independent `zara-reader.js`: exact HTTPS zara.com/www.zara.com Turkish `/tr/tr/...-p########.html` product URLs only, TRY current-price `<data>` and selected color. `ProductGroup` metadata matches the 8-digit productGroupID and selected color/size plus v1 URL when supplied; metadata from other regions/variants is not used. Images use only static.zara.net/assets/. Discounted current price is accepted; old price, model measurements, promotions and shipping are not prices.

Zara mobile 10.13 opens a separate size sheet. A capture-phase listener observes only the customer's explicit in-stock/low-stock size click, never changes site handlers or clicks anything. Choice is invalidated by color/product changes; unavailable size clicks block capture. If a selected size is not available to read, confirmation requires the customer to enter and confirm the chosen size. No first-size guessing. Live retailer execution on a real phone remains required before acceptance; sanitized markup snapshots are not full-site compatibility proof.

Observed public mobile HTML from two Turkish clothing products fetched HTTP200 on 2026-10-23. Sanitized semantic snapshots and SHA256/source URLs are in android/checks/zara-markup. Browser fixture disables all network and retailer scripts. Native and server fixture data is synthetic; no real production orders/payments used.

SQL review files `sql/kinto-world-zara-v1.sql` and `sql/kinto-world-zara-rollback-v1.sql` change only the world submit URL/image allowlists, guarded by exact source hashes. **Do not activate without explicit owner approval.** No new tables, auth, triggers, local workflows or pricing logic. Activate approved SQL, merge, then owner manually deploys 00-hostinger-release before end-to-end real Zara submission. Preview 11 alone can verify reader/conversion/confirmation locally; live server rejects Zara until activation. Customer/employee HTML cache lines refresh the shared global helper after deployment.

Existing Trendyol and Hepsiburada readers are byte-for-byte unchanged. Separate com.kinto.preview.hybrid.v11 disposable identity; production package, assetlinks and signing untouched.


Mobile markup uses `merchant-name` for identity and `merchant-label` for the official/authorized seller badge. Preview 9 confused these fields and rejected matching structured prices. The adapter now prefers the actual name; known badges alone are not identities. Existing selected-variant, exact URL, currency and multiple-offer guards remain. Trendyol reader, account sessions, SQL and local workflows are unchanged. Preview 10 uses a separate disposable package and requires device acceptance.


Adds an independent Hepsiburada reader for HTTPS product and parent-product URLs.
Price, chosen size/capacity/other variant values and color are confirmed before a
single-product draft is handed back to the trusted KINTO account renderer. Both
retailers reuse the current admin TRY exchange/commission settings and existing
world order/payment/staff/branch/courier lifecycle. Shipping remains staff-reviewed;
purchase is only after verified payment and availability review.

The external shopping process still has separate WebView storage, no account
session or native JavaScript bridge, third-party cookies disabled, and no file or
content access. Only the exact supported retailer hosts and approved image CDNs
are added. Conditional premium/installment prices and conflicting/missing variant
selections do not authorize an estimated price. Hepsi DOM selectors were checked
against a public product page; this is not a guarantee for every live layout.

`sql/kinto-world-hepsiburada-v1.sql` is REVIEW ONLY until the owner explicitly
approves production SQL. It changes only the existing global submission URL/image
allowlists, with an expected-source hash and transactional verification. No tables,
triggers, pricing rules, session helpers or local operations are changed. The paired
rollback restores the previous submission function without deleting any orders.
Existing Trendyol normalization/idempotency stays byte-compatible. Browser store
labels/image/link handling is updated separately for Hepsi.

Tests: unit reader/URL/options/price boundaries; synthetic Android product capture,
conversion, confirmation and refusal to send fixtures to production; disposable
Postgres submission/replay/rollback and local-function/trigger/data fingerprints;
mocked customer handoff; existing Trendyol, invoices, video and local-flow checks.
An optional public markup snapshot check blocks all retailer scripts/network calls
in its evaluation and is reported independently from live WebView testing.

Preview identity `com.kinto.preview.hybrid.v11` / KINTO Preview 11 is disposable and
separate from Preview 8 and production `com.kinto.app`. Signing files stay outside
the repository. Local unsent drafts are not automatically migrated between these
separate preview identities. No production fingerprint/assetlinks changes.

Activation order: approve reviewed SQL; activate it; merge reviewed web/native
changes; prepare release branch; owner manually publishes Hostinger; install V9
and confirm real-site behavior. No production writes, merges, hosting or store
publication are performed merely by building this preview.

# Android preview 0.3 — store navigation and mobile invoice layout

The external store has no persistent top toolbar. Its isolated local bottom bar
matches the customer navigation choices and navy/gold styling. It contains no
session, badges or account data. A fixed action enum returns to MainActivity,
where the existing trusted customer links resolve the logged-in destination.
The external site cannot trigger these actions: they are handled only by the
separate, JavaScript-disabled navigation WebView. Product capture and explicit
confirmation are unchanged.

Canonical invoices receive a bundled screen-only mobile stylesheet: stacked
brand/barcode/date, single-column customer/totals, readable amounts, and horizontal
scroll for the six-column product table. Print CSS and invoice data are untouched.
The offline invoice fixture copies the existing canonical CSS and asserts header
non-overlap, stacked cards and no page overflow for all three popup patterns.

New disposable preview identity: com.kinto.preview.hybrid.v3 / KINTO Preview 3.
Install beside Preview 2; this build cannot update its disposable signing key.
Production package, fingerprint and assetlinks remain unchanged.

Rollback source: 9b08327c000d73f05e86b25f1e040ab5cb286e30.
No hosting, database, production order or payment changes.

# Android preview 0.2 — wrapper compatibility fixes

This revision removes the permanent native header/navigation strip. Website
navigation remains the customer interface; KEYCODE_MENU exposes test tools only.
Global store links still route through the isolated shopping process.

Invoice cause: the original onCreateWindow only forwarded navigations and never
showed the temporary WebView. window.open("") + document.write invoices thus had
no visible window. Child WebViews now show labeled, closable document panels,
retain the opener's normal browser-origin behavior, support async invoice opens,
and provide Android print/PDF. External navigation is routed out; no JS native
bridge is exposed. Three document windows maximum.

Video cause: deployed local-store-pricing.js applyVideo explicitly strips video
sources for mobile pointer/width. Bundled KINTO-only compatibility restores the
configured source using the existing read-only get_site_settings RPC, without
editing the site script, changing stored settings, or auto-playing media. Image
hero mode remains respected. Explicit hardware acceleration and full-screen video
callbacks are supported. No mixed-content or certificate bypass.

APK identity com.kinto.preview.hybrid.v2 is separate from the old disposable-key
preview, so install beside it without uninstalling or disturbing its local drafts.
No old/production certificate or assetlinks change. CI signing remains disposable.

Offline Android35 regression exercises synthetic customer/staff/vendor invoice
patterns (document.write, including async open), document close/print control,
header absence, and actual H264 playback after settings-based source restoration.
It does not authenticate as those roles or claim to inspect real private invoices.
The existing synthetic Trendyol flow is run again. See the final delivery for the
actual completed CI result. Real customer/employee/vendor invoice checks on the
owner's phone remain acceptance steps.

---

# KINTO hybrid Android preview 0.1

Base: main `dc686cdfaf2d7d78027f86ed6f57642f001f578a`.
Branch: app/kinto-hybrid-preview-20261022.
Rollback: rollback/pre-hybrid-preview-20261022 (same base).

## What this APK does

- Opens the live https://shopkinto.com/ customer experience, without editing the site.
- Opens Trendyol links in a separate non-exported Android activity/process.
- Before any WebView initialization, selects `kinto-account` versus
  `external-shopping` data directories (Android 9+). Retailer pages never receive
  the KINTO origin's cookies, localStorage, tokens, or an unrestricted JS bridge.
- Reuses the V6 lab reader, product-only button, URL limits, conditional-price
  warnings, and native option/quantity confirmation from PR #952 at
  `72d39a6fe5ad93a10e5a86702e8392f11089d9d3`. The existing lab is not the app shell.
- Provides file chooser, KINTO HTTPS downloads, Android print/PDF menu, back
  navigation, explicit external-browser confirmation for unsupported/payment URLs.
  These features require real-device acceptance; native build success is not that test.
- Saves confirmed global products as **local test orders**, visible from the native
  `طلب تجريبي` button. Codes start TEST, `serverSubmitted=false`, no backend writes.
  This is not the production customer cart or employee order pipeline.
- Native menu `⋮` -> `تجربة كاملة ببيانات مصطنعة` opens a bundled fake product at
  100 TRY with size L and color Haki. Test quote uses 50 IQD/TRY plus 10% markup
  (5500 IQD at quantity 1). All screens mark these as synthetic, not admin prices.
  The test item is not purchasable. This enables isolated end-to-end preview testing.
- Always states shipping is excluded and is determined after employee review.

## Real pricing / order integration is blocked, not silently simulated

The existing admin code reads `currencies(name,rate)` and
`settings(key=site_commission,value)`. Read-only anonymous requests on 2026-10-22
returned HTTP 200 with empty arrays. That can mean policy filtering or missing
rows; a subsequent read-only SQL inspection confirmed these specific tables/keys
are empty (not a claim about every pricing source). `get_site_settings`
returned public branding, with no conversion fields. No schema/policy was changed.

AdminPricing is a candidate read-only adapter behind a disabled live-contract gate.
Empty/duplicate/malformed responses
block live conversion and confirmation. Its TRY/TL rate direction and percentage
formula must be confirmed against the actual global pricing contract before any
real-price use; the synthetic formula is not evidence for the real formula.
No fallback rate, hard-coded production conversion, service role or admin credential
is included. The live route currently cannot complete conversion from these reads.

The old order.html writes real `orders` and has no demonstrated test-mode contract.
It is deliberately NOT called for captured products. To verify a server-side
KINTO test order, we need an agreed test customer and an existing isolated backend
or approved test-order mechanism. Do not insert a "test" row into production and
call it isolated. Current full-path test ends in app-private test storage.

## Architecture and policy decision

Native Android WebView plus an isolated shopping process is the Android path;
shared retailer JS adapters and JSON product contract can be reused by a later
WKWebView host. On iOS the retailer browser must use a distinct WKWebsiteDataStore
and a narrowly validated message channel, not KINTO session data. No iOS source,
build, or device result is claimed yet. Other retailers need individual adapters.

No anti-bot, TLS, fingerprint, or site-access bypass. Blocked sites fail visibly.
Google's Webviews/Affiliate Spam policy restricts apps primarily showing another
website without owner permission. Apple 4.2 requires adequate app utility and 5.2
addresses content/IP rights. Retailer permissions/content rights and review
readiness remain release gates; this APK is not approved for either store.

- https://support.google.com/googleplay/android-developer/answer/9899034
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges

## Build / signing

Package: **com.kinto.preview.hybrid**, version 0.1-preview, Android 9+.
Target/compile API 35 for this existing-lab-based private preview. Upgrade/test
API 36 before Google Play submission. No claim of current store compliance.
Separate test certificate; no change to com.kinto.app, com.kinto.trendyollab,
assetlinks.json, hosting/CDN, Supabase, or existing sessions. Private keystore and
password files stay outside the checkout and are never uploaded as source/artifacts.
Loss of this disposable test key may require uninstalling a preview to replace it;
production key recovery is a separate pre-release task.

Gradle: JDK17 / Gradle8.11.1 / SDK35, `gradle -p mobile/hybrid/android
:app:assembleDebug :app:lintDebug`. Local Gradle dependency resolution failed due
to the environment's network/proxy. No local Android Lint pass is claimed.

The verified alternative `tools/build-preview.sh` uses Android SDK 35 official
javac, D8, AAPT2, zipalign and apksigner, with no extra runtime dependencies.
Set JAVA_HOME, ANDROID_HOME, KINTO_BUILD_OUTPUT, KINTO_PREVIEW_KEYSTORE,
KINTO_PREVIEW_PASSWORD_FILE; the output and secrets must be outside this checkout.
It produces a debuggable private preview APK, verifies v2/v3 signatures and dumps
package/minSDK/permissions. It does not publish. Keep Gradle as the standard
release pipeline after dependencies can resolve; the SDK-only build is preview-only.

## Verification / limits

- Latest main checked and seven deployed PWA files byte-matched on 2026-10-22.
- Original reader/SPA/variant/campaign tests: 18 passed.
- JVM UrlPolicy and CartRules checks passed; PricingCheck passed quantity,
  exact decimal totals/rounding and invalid input cases (synthetic values only).
- All Android Java classes compiled against API35; APK packaged, aligned and
  signature verified. INTERNET is its only declared permission.
- Existing PWA contract passed. Website files are unchanged.
- No actual order, customer fixture row, payment, stock or database write was made.
- Emulator/device result is reported separately with delivery; do not infer it
  from these build and host-side tests. Real login, chat, invoice dialogs/PDF,
  camera/file upload, payment return, and real Trendyol capture remain device gates
  unless a specific result is reported.

Before store release: restore/check existing listing/account/key ownership,
retailer rights, privacy/data safety, deletion flow, final icons/screenshots,
account/payment device tests, signed release and owner approval. No merge or
store deployment authorized.
