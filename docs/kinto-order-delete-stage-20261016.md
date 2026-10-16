# Remove unused direct order deletion

## Existing work retained

Production catalogs confirm enabled local-price, global-price, paid-transition, paid-marker, payment-type, external-shipping and settlement guards. The vendor segment-status and shipping RPCs already validate a vendor session and select the segment by its store. Those mechanisms are not rewritten or claimed as new work here.

## Specific remaining gap

The orders table still grants DELETE to anon/authenticated, with a permissive ALL policy. The settlement guard blocks deleting claimed/cash-settled orders, but permits other physical deletions. No production deletion was attempted. Repository inventory found no browser orders DELETE call (including raw REST DELETE); customer cancellation uses status updates or existing reconciliation RPCs. Catalog inspection found no public/private function with a static DELETE FROM orders statement. These checks do not cover unknown external consumers or dynamically assembled SQL outside this repository.

Remove only the unused table DELETE privilege. Keep existing SELECT/INSERT/UPDATE privileges, RLS policies, payment/stock/tracking logic and every trigger. Owner/service-role maintenance remains available. This does not close broad direct status/assignment/other-field access, reads or JSON snapshot edits.

## Validation and deployment

Isolated API-role tests reproduce deletion before the change, deny filtered/unfiltered/no-match deletion afterward, retain all rows on denial, preserve allowed cancellation/tracking updates and insertion/reads, retain owner deletion, verify idempotence and exact baseline rollback. A catalog-backed settlement trigger fixture preserves the distinction between settled and other rows. Native PostgreSQL 17 repeats the same test. Existing full E2E remains enabled.

Backup branch: `backup/before-order-delete-acl-20261016` at `12abfb92a032391e2e93795b7596c058683af3b4`.

After green checks, run `sql/kinto-order-delete-lockdown-v1.sql`, then catalog-only `sql/kinto-order-delete-verify-v1.sql`. There is no frontend rollout dependency or second lockdown stage. Merge the PR to retain the tested SQL. Emergency rollback restores only the two original API DELETE grants. No production rows or DDL were changed during preparation.
