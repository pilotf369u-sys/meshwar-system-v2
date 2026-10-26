# KINTO first Play upload — 26 October 2026

- Base / rollback: e7d9abcc5cf8c18478918023b989143dd7531c2a (main).
- Working branch: app/play-aab-20261026. No merge, Hostinger deployment, database access or Play upload performed.
- Native source: mobile/hybrid from e84bdf60ad403f5f99bbec9e377fc312ffe1926a. Prepared Java/resources and all six retailer readers/order button copied byte-identically. Only bundled account-deletion.html updated to the approved manual request form from current main.
- Application ID com.kinto.app; versionName 1.0; versionCode 28; minSdk 28; target/compile SDK 36; release not debuggable; INTERNET only; backup and cleartext disabled.
- Owner delegated technical signing choice after Console screenshots: Google app-signing certificate exists, zero active installations observed; no upload-key section found; no bundle uploaded in the internal release draft.
- New private upload key created outside every checkout. Its registration is not proven until Play accepts the first upload. If Console requires a different upload certificate, stop and use its upload-key reset procedure; never silently create another key.
- Upload certificate SHA256: 3E:4A:10:39:F7:AB:BE:96:F9:EE:B6:83:9D:65:DC:D5:40:89:17:F3:0F:42:90:2E:23:A1:A4:87:78:4F:86:9A.
- Observed Google app-signing SHA256 from Console asset-links sample: 88:2A:6F:38:9E:76:EE:1C:8D:E6:21:9F:A6:FE:BA:D9:06:68:EA:90:1A:21:A9:D8:A2:95:D8:9A:02:2D:0E:52. Not the upload certificate. Existing website assetlinks.json remains untouched.

## Completed checks

- Reader Node tests: 54/54 pass.
- Java URL policy, cart quantity/variants/exact totals and pricing/rounding/invalid input tests pass.
- Gradle 8.11.1 / Android plugin 8.10.1: bundleRelease, assembleRelease and lintRelease succeed; 0 errors/fatal, 21 warnings.
- Actual AAB manifest confirms identity/version/API/permissions and release flags.
- Actual AAB has exactly 11 allowlisted assets matching source; no synthetic fixture assets or native .so libraries.
- jarsigner verifies AAB signature; apksigner verifies paired release APK, certificate matches intended private upload key.
- Google bundletool 1.18.3 validate and universal APK generation both succeed.
- AAB SHA256: ade043165fec2525b9a9b1464a3d663849688aab58f8ad58cf2e17654ff4e58b.
- APK SHA256: c7fd4d138a453c8908696bf8767b630229c155b93b0eb352ddef7cdac206c67b.

## Remaining external validation

Upload the AAB to the existing internal-test draft and inspect Play processing results. Final signed com.kinto.app was not installed/launched on a device in this run. Owner's accepted preview28 and earlier candidate device evidence remain historical, not a substitute for that final check. Run installation/opening from the Play internal-test link before wider rollout. No assertion of guaranteed policy approval. No real orders, payment or account deletion tested in this run.

Never commit private keystores, password files or the private backup ZIP. Keep two owner-controlled private backups.
