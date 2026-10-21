# Hostinger package validation — 2026-10-21

## Completed preparation
- Exact website source commit: `e975a283522e9f20faf2b9816c6dd68cccdb85f3` (main at inspection).
- Static ZIP: 289 files, including 22 explicitly listed production HTML entrypoints, manifest.json and approved asset file types in css/, js/, images/, meshwar-images/, videos/.
- ZIP SHA-256: `3eabe04ac1314a4e5ae7cd683014cf9f5567652b63d451d42379b8278ea7709a`.
- All 289 packaged files were compared with `git show <source>:<path>`: byte-for-byte identical.
- Static HTML links/assets, CSS URLs and manifest icons: resolved within the package.
- ZIP CRC integrity check: passed.
- Excluded: sql/, supabase/, tests/, ci/, scripts/, tools/, docs/, previews/, .github/, .git/, payment-p5-isolated-preview.html and development configuration.
- Existing Playwright integration suite executed against an HTTP server serving the extracted ZIP, not the complete source checkout: **119 tests, 0 failures, 0 errors, 0 skipped**; JUnit reported 50.12 seconds.
- Tests use the repository's simulated fixtures. Chromium DNS resolution for *.supabase.co was blocked during this package test. This is not a production database or real payment test.

## Reproduce package
From this preparation branch, run:

```sh
python3 scripts/prepare-hostinger-release.py --source e975a283522e9f20faf2b9816c6dd68cccdb85f3 --output /tmp/kinto-hostinger-review
```

Use a new output directory outside the checkout. The script reads committed bytes using git archive and does not upload anything. `release-review.json` records each file's SHA-256, size and source commit alongside the ZIP. Do not put the review manifest or ZIP itself in public_html; extract the website ZIP contents there only at an approved deployment step.

The proposed `Prepare Hostinger package (no deployment)` workflow runs only via workflow_dispatch, uses contents:read, accepts an exact source commit and uploads a downloadable package artifact. It has no hosting credentials or deployment operation. A new workflow on a draft branch is not generally available through the default branch's Run workflow UI until merged; the local command above already works. No merge has been performed.

## Native Git import is a different deployment method
This ZIP is a reviewed file-upload package. Selecting main in Hostinger Git would import repository contents and does not automatically use this ZIP or its allowlist. Before a native Git deployment, inspect its directory/exclusion capabilities and establish how non-web repository files will be excluded or denied public HTTP access. Do not claim that fixing the branch selector alone completes deployment readiness. The created 00-hostinger-release branch remains an untouched source snapshot; it was not replaced with the ZIP contents.

## Remaining hosting-dependent checks
1. Wait for the branch-selector issue to be resolved or explicitly choose another deployment method.
2. Confirm actual automatic deployment is OFF; do not infer it from support chat.
3. Inspect/back up existing public_html contents and establish file rollback.
4. Verify shopkinto.com and any www policy, HTTPS, authentication callback URLs and allowed origins used by backend/external services.
5. Record the final source commit again if main changes, regenerate and recheck the corresponding package.
6. Perform post-upload smoke checks on the real Hostinger domain before launch.

No Hostinger publication, main update, SQL execution, Supabase setting change, PWA PR #832 merge or real financial transaction was part of this preparation. Existing site behavior is unmodified.
