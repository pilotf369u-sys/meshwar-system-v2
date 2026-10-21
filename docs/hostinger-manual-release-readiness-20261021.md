# Hostinger manual release preparation — 2026-10-21

## Status
Preparation only. No Hostinger deployment, automatic deployment, DNS change, database change, or application code change has been performed by this preparation. Hostinger settings must be inspected separately; statements in support chat do not verify the actual deployment configuration.

## Verified source
- Repository: pilotf369u-sys/meshwar-system-v2.
- main was resolved via git ls-remote to e975a283522e9f20faf2b9816c6dd68cccdb85f3.
- 00-hostinger-release was created at that exact commit and appeared in the Hostinger branch selector. It is a fixed snapshot and does not automatically follow main.
- User wants main's name preserved and every Hostinger release initiated manually.
- GitHub access was returned by the user to Only select repositories for this repository.
- Hostinger branch selector stops in fix/*; main exists on GitHub. Incomplete pagination is a hypothesis, not a confirmed vendor diagnosis.

## Repository inspection
The checked-out source contains static HTML pages and css/, js/, images/, meshwar-images/, and videos/ directories. package.json defines Playwright and payment test commands; it does not define a production build command. Source also contains sql/, supabase/, tests/, ci/, scripts/, tools/, docs/, previews/, and a payment isolated preview HTML page. The whole repository has not been approved as a public_html deployment package.

## Required work before first deployment
1. Re-resolve main and record the exact approved release commit; do not rely on a stale snapshot.
2. Prepare an explicit web-file allowlist, trace local dependencies from production pages, and exclude database migrations, server functions, tests, development tools, documentation and isolated preview pages unless a production dependency is established. Preserve relative paths. Do not execute SQL or move Supabase data.
3. Inspect Hostinger's actual Git deployment settings and ensure automatic deployment is disabled before allowing future pushes to trigger deployment. Do not assume the initial setup is manual. If the UI cannot provide this guarantee, stop before deployment and clarify with support.
4. Inspect public_html and download a backup of existing hosting files before replacement. Keep backups outside the publicly served directory. Record a practical file restoration procedure.
5. Review production domain dependencies: canonical origin, redirects, authentication callbacks, allowed origins for external services and email links. No production service settings are changed by this document. Confirm whether www will be supported and configure consistently.
6. Verify the release package with static link/dependency checks and the relevant existing checks. Record checks actually run; prior passing results are not a new test of Hostinger.
7. After the user initiates the first deployment, test HTTPS, homepage, assets, navigation, customer login and the authorized role panels on shopkinto.com. Distinguish read-only checks from order/payment operations; do not create production transactions implicitly.
8. Confirm electronic payment remains a simulator until a real provider is separately integrated; hosting does not activate real card processing.

## Subsequent manual releases
Continue development and PR merges on main as usual. Neither a merge nor a push should deploy to Hostinger automatically. For each release, record the selected commit, passing checks, file backup and rollback instructions, then manually deploy the reviewed files. If 00-hostinger-release is used, update it deliberately to the approved release only after reviewing the deployment configuration. Never rename main as a workaround.

## Mobile application
Keep draft PWA PR #832 separate and unmerged. Do not silently include the PWA branch in the website release. Test final-domain behavior separately before later app work.

## Boundaries
Hostinger file backups do not back up external Supabase data. Existing GitHub Pages and Vercel services remain in place during preparation. No changes to sales, login logic, tracking, orders, invoices, stock or financial calculations are part of this work.
