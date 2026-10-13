# KINTO Trendyol Android experiment

Isolated Android app, not a release or the current PWA. No Supabase SDK, production login, API, price conversion, stock mutation or real checkout. URLs and titles are saved only in app-private device preferences; backup is disabled.

Open Trendyol, navigate to a product, press the injected green/gold KINTO button (or the native fallback below the browser), confirm the URL and inspect the experimental cart. The initial test proves only WebView browsing + DOM button + local URL capture. Selected variants and price are not captured yet.

Uses the device's ordinary WebView; no fingerprint changes, certificate overrides, native JavaScript bridge or anti-bot bypass. If Trendyol refuses browsing, report the screen and stop; do not treat button rendering as proof of complete integration.

## Build
Java 17, Android SDK 35, Gradle 8.11.1: `gradle -p android-lab :app:assembleDebug :app:lintDebug`.
APK: `android-lab/app/build/outputs/apk/debug/app-debug.apk`.
GitHub Actions builds this on the isolated `app/android-trendyol-lab-v1` branch. Debug signed APK is for device testing only; uninstall may be needed between separately signed debug builds. Android 8+ required.

## Device acceptance
1. Open Trendyol and a product without entering payment details.
2. Verify injected button appears; distinguish native fallback from successful DOM injection.
3. Confirm captured URL matches displayed product; test navigating to a second product without reloading.
4. Saved links survive app restart; duplicate identical URL is rejected.
5. Cart remains local and does not appear in KINTO orders.
6. If site blocks this WebView, record the limitation; no bypass.
