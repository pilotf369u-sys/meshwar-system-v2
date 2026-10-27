# iOS App Review and security gates — KINTO
Reviewed: 2026-10-27. Applies to the iOS preview branch. Apple determines final acceptance; this is not a certification.

## Current confirmed gaps
1. Account deletion: main's `account-deletion.html` prepares a mailto message and instructs the customer to send it by email. Apple's account-deletion guidance says apps outside highly regulated industries should not require an email, phone call, or other support flow to complete deletion. Treat the present path as a review risk; check the deployed page and end-to-end flow before release. Do not change the database, auth, hosting or deletion operations without the owner's authorization. A direct in-app request mechanism needs its own design, authorization and tests.
2. The simulator foundation blocks popup creation. Existing KINTO invoices use document windows; these must be implemented and checked against the existing customer invoice. Current foundation is not a usable customer release.
3. External-store readers were exercised in synthetic fixtures, not via actual live product captures on an iPhone. Product confirmation, pricing, review, handoff, receipt and recovery are not connected. Do not submit a purchase or imply readiness.
4. Isolation: the synthetic WebKit cookie and localStorage test passed for the tested scenario. It does not cover all frames, redirects, popups, media permissions, downloads, scripts, session leakage, payment flows, persistence or actual devices. Account and retailer frames are not yet comprehensively validated. Keep the external store in a separate WKWebsiteDataStore; do not expose an unrestricted native JS bridge or KINTO credentials.
5. Retailer rights: guideline 5.2.2 requires permission under each third-party service's terms and authorization on request. Verify and document the access and content rights; do not infer that Android acceptance or a website being public supplies permission.
6. Minimum functionality: guideline 4.2 requires sufficient usefulness beyond a repackaged website. The integrated shopping tools must work for reviewers. No guarantee of approval.
7. Account and review access: verify all customer flows, provide a legitimate review account or approved demo mode and explain how to exercise the app. Record actual iPhone/iPad test results and crashes.
8. Privacy: inventory data collected by KINTO and third parties, identify their purpose and verify privacy labels and policy URLs. Determine whether Apple tracking rules apply to actual behavior; do not guess.
9. User-generated content: inspect chat and product reviews against guideline 1.2; verify applicable reporting, blocking, filtering and published contact requirements against actual features.
10. Physical goods use payment methods other than in-app purchase under 3.1.3(e). Preserve the existing payment flows; test provider redirects and returns without exposing KINTO sessions.
11. App Store metadata, privacy policy, age rating, screenshot accuracy, app icon, accessibility, iPhone/iPad display and permissions need review. Do not claim these are complete.
12. Only simulator binaries exist. A signed TestFlight build, real device testing, membership and eventual owner-authorized submission remain outstanding.

## Sources
- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/support/offering-account-deletion-in-your-app/
- https://developer.apple.com/app-store/app-privacy-details/
- https://developer.apple.com/help/app-review/before-submitting-for-review/complete-review/
