# KINTO iOS — initial assessment (2026-10-27)

Status: investigation only. No iOS app, signed build, device test, submission, or App Store compliance is claimed.

- Working base and rollback point: main e7d9abcc5cf8c18478918023b989143dd7531c2a.
- Android release reference: origin/app/play-aab-20261026, 3d55936e8c411c278ebb6005f75aa79bc8232b34. This branch is a reference, not merged into main.
- Main has an Android hybrid shell but no iOS project. Android release reference includes six retailer JavaScript readers: Trendyol, Hepsiburada, Zara, Madame Coco, Mango and MAD Parfum. The native Android shell and its platform-specific handoff cannot simply run on iOS.
- Automated tests on the release reference: `node --test mobile/hybrid/android/checks/*reader.test.cjs`: 54 passed, covering the Trendyol, Hepsiburada and Zara test suites. This is synthetic JS coverage, not evidence of a real iPhone or all-store result.

## Implementation constraints

- Separate trusted KINTO account WKWebView from retailer WKWebView using distinct website data stores. A separate nonpersistent retailer store is a candidate, subject to device verification. Do not expose KINTO credentials, cookies, storage, permissions or unrestricted native bridges to retailer content. Carefully gate every navigation, redirect, popup and frame; validate exact HTTPS origins and product URLs, with fail-closed behavior.
- Invoke readers only in the intended retailer page and validate untrusted captured data, origin, current URL and freshness in native code. Require explicit customer confirmation before handoff. Reuse the established server contract only after inspecting and testing it; never fabricate a successful submission, price or availability.
- Reuse existing pricing configuration and order flow without modifying backend, hosting, databases or authentication. Explicitly show that shipping is determined by staff after review and purchase is subject to payment and availability.
- Reproduce invoice popups, file selection, media, navigation and payment return as needed; verify on a real iPhone using isolated test data. Test each retailer separately including price, variants, image, redirects, unavailability and blocked sites.
- App Review requires adequate functionality, working review access, privacy disclosures, account deletion where applicable and appropriate rights for third-party services; Apple decides acceptance. Physical goods use payment methods other than in-app purchase under guideline 3.1.3(e).
- Xcode/macOS, signing and Apple account are required for iOS builds and device/TestFlight distribution. No Xcode is present in this execution environment. A simulator/device build and security verification are release gates, not implied by JavaScript tests.
