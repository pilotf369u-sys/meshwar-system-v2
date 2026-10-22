# Hostinger package validation — updated 2026-10-22

## Current protected package
- Exact tested preparation commit: `2c6f9a81bba82cf07949820d46e901aefe36d9fe`.
- Package contains 290 files: the original 289 production frontend files plus root `.htaccess`.
- ZIP SHA-256: `dd001a4daffd585f24fcbb1efa21c836eb6680aa7885a0d8be8b54c7e6e44ea7`.
- Compared against the previous ZIP: all 289 frontend files are byte-for-byte unchanged; only `.htaccess` is added.
- The packaged `.htaccess` is byte-for-byte equal to the committed file.
- Static HTML references, CSS URLs, manifest icons and ZIP CRC integrity passed.
- The packaging script now requires `.htaccess` in its exact source commit. It intentionally rejects old commits which lack the protection file.

## Previous frontend runtime validation
The original ZIP from `e975a283522e9f20faf2b9816c6dd68cccdb85f3` contained 289 files, SHA-256 `3eabe04ac1314a4e5ae7cd683014cf9f5567652b63d451d42379b8278ea7709a`.
All 119 existing Playwright tests passed against its extracted files: 0 failures, errors or skips; 50.12 seconds. Tests used simulated fixtures with Chromium DNS for *.supabase.co blocked. These are not live database/payment tests. The 289 frontend files have not changed, so this suite was not rerun for the configuration-only addition. Python's static HTTP server does not enforce Apache/LiteSpeed .htaccess rules.

## Observed Hostinger checks
The owner manually installed the same .htaccess on shopkinto.com. Screenshots show default.php remains accessible and requests for /sql/kinto-readiness-probe.sql and /.git/config display Forbidden. The SQL probe is a nonexistent path; its rejection demonstrates path filtering, not protection of every existing file. The Git path might also have server-level protection. These checks are limited observations and must be repeated after deployment. No application files have been published by this preparation.
The owner downloaded default.php and the manually created protection file for rollback. A download may strip the leading dot: restore the exact filename `.htaccess` when uploading it.

## Reproduce
```sh
python3 scripts/prepare-hostinger-release.py --source 2c6f9a81bba82cf07949820d46e901aefe36d9fe --output /tmp/kinto-hostinger-protected-review
```
Use a new directory outside the checkout. The script reads committed bytes with git archive and never deploys. Keep the ZIP and release-review.json outside public_html; only the ZIP contents belong in the web root.
The workflow is manual packaging only, contents:read, no deployment credentials or publication. A new workflow is normally unavailable in the default branch Run workflow UI until merged.

## Native Git import
Native Git import does not use the ZIP allowlist: the full source may be copied. Root .htaccess must therefore be tracked in the selected deployment branch before import. Do not rely on preservation of an untracked server file. The current deny rules cover the repository's backend/development directories, hidden paths except .well-known, selected development metadata and script/backup extensions. They do not replace database access controls or a full security audit.
Before first deployment, merge the reviewed preparation only after required checks pass, then explicitly synchronize 00-hostinger-release with the approved main commit and verify equality again. The temporary branch must not be updated automatically. After ticket 25000062 is resolved, the owner wants Hostinger switched back to main with automatic deployment disabled.

## Remaining deployment checks
1. Capture final deployment SHA and verify the selected branch contains `.htaccess`.
2. Verify Hostinger's actual auto-deployment toggle is OFF. The initial setup UI did not show this control; Hostinger documents it on the post-setup overview. Do not infer OFF from a support statement.
3. Ensure import does not require deleting the protection file or emptying the directory. If it does, stop and choose a protected deployment arrangement before proceeding.
4. Verify HTTPS, domain/www policy, auth callback URLs and allowed origins before live use; change backend settings only when justified.
5. Repeat HTTP deny tests and application asset/page smoke checks after deployment; test real login and role workflows before launch.
6. File rollback: restore the prior public_html files with the correct .htaccess filename. This does not roll back database changes.

No merge, Hostinger publication, SQL execution, Supabase setting change, PWA PR #832 merge or real transaction was performed.
