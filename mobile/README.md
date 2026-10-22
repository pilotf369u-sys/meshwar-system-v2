# KINTO mobile stores — isolated Android foundation

Status: TWA foundation SUPERSEDED as the complete application architecture.
Do not continue the TWA-only build for the requested production app.
Global-store tools are REQUIRED scope, not a later optional feature.

## Architecture correction — recovered Trendyol experiment

Recovered source: `app/android-trendyol-lab-v1`, PR #952 (open, not merged),
commit `72d39a6fe5ad93a10e5a86702e8392f11089d9d3`.
Files: `android-lab/app/src/main/java/com/kinto/trendyollab/MainActivity.java`,
`UrlPolicy.java`, `CartRules.java`, `android-lab/app/src/main/assets/product-reader.js`,
`order-button.js`, and `android-lab/checks/product-reader.test.cjs`.
Do not merge the old branch wholesale: it carries an older website baseline.
Its README includes obsolete early-version statements; current code and PR describe V6.

Re-ran the recovered reader/SPA fixtures: 18/18 PASS. This is fixture verification,
not a new live Trendyol or iPhone test. Java boundary checks could not run locally
because javac is absent; Android compile/lint also remain pending here.
The PR reports V5 phone confirmation for size 42/Haki and cart save; V6 basket
campaign changes still require device verification. No iOS result was found.

Required behavior:
- Browse supported global sites with KINTO product tools.
- Convert using ONLY the admin-approved exchange rate and percentage commission;
  discover the authoritative existing settings and formula before implementing.
- Show product estimate excluding shipping. Customer wording:
  **السعر للمنتج فقط، ولا يشمل الشحن. تُحدد تكلفة الشحن بعد مراجعة الموظف للطلب.**
- Confirm product, seller, selected options, quantity and observed price before
  adding to the KINTO global-order flow. Existing local-store checkout is untouched.
- The old lab cart is LOCAL ONLY: no exchange conversion, real ordering,
  availability verification or employee routing exists there yet.

Selected architecture direction: a hybrid/native app with an isolated external
shopping browser: Android WebView and iOS WKWebView. Reuse the reader/button
JavaScript and its fixtures; port the browser host/navigation and confirmation UI.
Keep KINTO authenticated commerce separate from third-party browsing. Never expose
KINTO session tokens, payment privileges or a general native bridge to store pages.
Read untrusted DOM as candidate product data, validate it and require user confirmation;
server-side authoritative pricing and order validation remain necessary.
TWA may be evaluated as a KINTO-only component, but cannot implement the whole scope.
Do not assume Capacitor's default browser plugin supports injection: verify a
separate native shopping module before choosing a framework dependency.

Each retailer needs its own adapter and Android/iOS device test matrix. Do not
bypass anti-bot challenges or SSL checks; blocked/unsupported sites must stop the
capture and explain the limitation. Conditional/Plus/basket offers must not become
unconditional guaranteed prices. Reuse the lab's fail-closed handling.

Policy gates: Google Play Webviews/Affiliate Spam policy restricts apps primarily
providing another site's WebView without owner permission. Check retailer rights
and permissions before release; technical injection success is not permission.
Apple 4.2 and 5.2 require sufficient functionality and appropriate content rights.
No acceptance guarantee or all-retailers compatibility claim is made.
References:
- https://support.google.com/googleplay/android-developer/answer/9899034
- https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges
- https://developer.apple.com/documentation/webkit/wkwebview/evaluatejavascript(_:completionhandler:)
- https://developer.apple.com/app-store/review/guidelines/

Next implementation: selectively recover the lab at its pinned SHA, audit its
boundaries, prototype the equivalent WKWebView host, then integrate the approved
rate/commission read path and global-order flow on this isolated branch. Do not
invent a conversion formula or route experimental items through local checkout.

The sections below retain the initial TWA-only audit for traceability; the
architecture correction above takes precedence.
Base/rollback: `dc686cdfaf2d7d78027f86ed6f57642f001f578a`.
Rollback branch: `rollback/pre-mobile-stores-20261022`.
Work branch: `app/android-store-foundation-20261022`.
No website, auth, payment, database or invoice source is modified.

## Audit on 2026-10-22

Both main and 00-hostinger-release pointed to the base SHA. No Android/iOS
project, APK/AAB, Gradle project, Capacitor/Cordova project, or signing keystore
was found in that committed tree. This does not rule out an older project on
another branch, a PC, or a previous service. Recover it before production signing.

The following live HTTPS files matched checkout bytes exactly (all HTTP 200):

| File | SHA-256 |
| --- | --- |
| index.html | a50d061c23cf854897cd4bf47099f4ffbe2e1d2557799126a10c72f3e1854027 |
| manifest.json | f33dec8baa10af421c62bcf979f5277ff4765894244a9444a6b22e1cde333089 |
| service-worker.js | b151c34a00e077660e00e1dd728261d68eb436e8da09e37731e771741b0c05f4 |
| offline.html | 03f10db1f7dee87027283f4833f1192ba2330daa15f3e8e1094b3ea204138175 |
| js/kinto-pwa-v275.js | 729a21a6ef7e5cd99fd4554e0c7bef95f96d621acafbd8e2eb7568df5fcde74f |
| js/kinto-connectivity-v275.js | ef54ef15528e489af2f72ac9cff95b814c7210acfb01df294230b879e12841b8 |
| .well-known/assetlinks.json | a28d105dc12b43ab2431586cd3a8981c9d8046f00b8346281dceea7ca92f3d13 |

This confirms the checked PWA update is live, not every repository file or CDN
account setting. No redeployment is needed to establish this fact.
Repeat: `python mobile/tools/verify-hosting.py` (read-only).

Existing assetlinks declares `com.kinto.app` and one certificate. Its private key
owner and whether it is an old test certificate or Play signing certificate are
unverified. Never replace it with a generated key or commit any private key.

## Superseded Android-only starting point

TWA via Google's android-browser-helper preserves the existing browser-origin
sessions, site checkout and live site updates. It avoids duplicating commerce
code into a WebView. Website availability remains necessary. PWA installability
does not establish Play approval. The preview deliberately uses
`com.kinto.app.preview`, so it cannot overwrite an existing com.kinto.app install.
It will show Custom Tab browser UI until its own package/certificate is explicitly
linked on the website. No live assetlinks change is included.

Third-party stores/payment domains are not asserted as owned/verified and may
show browser chrome or open externally. TWA cannot inject a cart button into
Trendyol/Zara or arbitrary third-party sites. This shopping integration is REQUIRED scope and is not implemented by the
initial TWA foundation; the architecture correction above supersedes that choice. Test payment return flows explicitly on a device.

## Build (not publish)

Requires JDK 17, Gradle 8.11.1, Android SDK platform 36 and build-tools 35.0.0.
Open `mobile/android` in a compatible Android Studio, or run:

```
cd mobile/android
gradle :app:assembleDebug :app:bundleRelease :app:lintDebug :app:signingReport
```

Gradle is installed separately; no wrapper JAR is included. Versions are pinned.
The manual-only GitHub workflow `kinto-android-preview.yml` performs these tasks
and uploads a preview APK, an UNSIGNED AAB and lint report. It has no publishing,
hosting, database, secrets or release upload step. Preview signing keys generated
on ephemeral runners are disposable; they are not the production identity.
An unsigned AAB cannot be submitted to Play. Release versionCode 1 is provisional
and must exceed any existing Play version before publication.

## Release gates and owner steps

1. Recover any previous APK/project/keystore and identify existing Play listing.
   Confirm account ownership, package ID and old highest version code. Never send
   passwords/private keys in chat. The supplied live fingerprint alone is not a key.
2. Build/lint successfully, install preview on Android Chrome, then test login,
   saved session, back button/modals, rotation, product variants, stock limits,
   cart persistence, ordinary and campaign orders, electronic/manual payment and
   returns from bank pages, order tracking, invoices, downloads, uploads, tel and
   WhatsApp links, network interruption and recovery. Run real transactions only
   through a separately agreed test procedure; source checks are not device tests.
3. Prepare final icon/adaptive icon, screenshots, description, support contact,
   public privacy policy, actual Data Safety inventory (including Supabase and
   third-party SDKs), content rating, app access/reviewer credentials, and account
   deletion in-app plus a public deletion-request web link where required.
   Current account deletion/privacy readiness has NOT been established.
4. Owner opens/verifies Play Console account in the correct legal name/country.
   Personal vs organization is a real legal identity choice, not a testing bypass.
   Organizations may require D-U-N-S. Do not tie identity to an assumed country.
5. Enable Play App Signing with a deliberate key strategy; keep upload key in
   owner-controlled secure backup. Add the actual PLAY APP SIGNING SHA-256 to
   assetlinks in a separate reviewed website change (upload key is different).
   Do not remove a still-needed historical certificate without checking it.
6. Upload signed AAB to internal testing only after owner approval. Validate TWA
   association from Play-installed build. New personal accounts subject to the
   policy need at least 12 continuously opted-in closed testers for 14 days,
   then production access application; acceptance is not automatic.
7. Owner approves production submission separately. No merge/deploy/publish is
   authorized by this foundation. Hostinger remains manual and CDN unchanged.

The existing Hostinger package script selects site assets and omits some PWA
root/.well-known files; the live files exist now, but future packaging must be
audited separately before a hosting release. This change does not edit packaging.

## iPhone next

TWA is Android only. After Android validation, evaluate a dedicated iOS hybrid
shell (e.g. Capacitor with tested local assets and native integrations) versus
native UI. Do not simply assume an iframe/remote WebView is acceptable. Apple
4.2 requires utility beyond a repackaged website. Specify useful native features
such as opt-in order notifications, sharing and reliable document handling, then
implement/test them without changing commerce rules. Xcode/macOS or a paid macOS
build service, signing, TestFlight and real iPhone tests are required. Audit
login providers, privacy manifests/SDK disclosures, account deletion and payment
redirects before submission. No iOS project or acceptance guarantee is included.

## Costs and official references (checked 2026-10-22)

| Item | Published fee / budget |
| --- | --- |
| Google Play developer registration | USD 25 once; local taxes/conversion may apply |
| Apple Developer Program | USD 99 per year, or local currency where available |
| First-year registration total | USD 124 before taxes/conversion |
| Android Studio / TWA tooling | No tool licence purchase needed |
| Mac or cloud macOS builds, CI overages, devices | Additional, depends on chosen provider/equipment |
| Current hosting/Supabase/payment processing | Existing separate costs, not replaced by an app |

Physical-goods checkout is distinct from digital in-app purchases; do not add
store billing or change the existing gateway as part of this foundation. Confirm
the actual catalog against each store's rules before submission.

- https://support.google.com/googleplay/android-developer/answer/6112435
- https://support.google.com/googleplay/android-developer/answer/14151465
- https://support.google.com/googleplay/android-developer/answer/11926878
- https://developer.chrome.com/docs/android/trusted-web-activity/quick-start
- https://developer.apple.com/programs/
- https://developer.apple.com/app-store/review/guidelines/

## Verification performed for this foundation

- Seven live PWA file comparisons passed.
- Existing PWA hosting/cache contract passed (root and GitHub subpath).
- Existing payment P2/P3/G16/admin mode tests: 20 passed; these are local
  simulator/static tests, not live checkout or database integration tests.
- Android source XML parsed; source diff checked for isolation.
- APK/AAB compilation, Android lint, device tests and store review are pending.
  This environment has Java but no installed Gradle/Android SDK. Do not describe
  this foundation as a built, signed or ready-to-upload app.

Rollback: leave main/hosting as-is, or discard this work branch. No database or
production rollback is needed because none was changed.
