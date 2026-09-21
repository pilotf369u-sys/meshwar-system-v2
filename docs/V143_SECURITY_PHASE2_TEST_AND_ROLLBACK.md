# KINTO V143 — Phase 2 test and rollback checklist

## Frozen recovery points

- Production baseline before launch hardening: `636a134173fea22cc288e2b8814f0236df41729a`
- Phase 1 code checkpoint: `996a5dd`
- Recovery branch: `restore/kinto-after-security-phase1-v143`
- Recovery tag: `kinto-after-security-phase1-v143`
- Database phase 1 rollback:
  `supabase/read-only/20260921_v143_revoke_browser_ddl_privileges_rollback.sql`

Do not run a rollback unless a phase-specific validation fails and the failure is
confirmed to have started after that phase.

## Before phase 2

Record one known working account for each role without putting passwords in Git:

- Customer code/phone
- Employee phone
- Branch code/phone
- Courier phone
- Vendor identity

Confirm the following on production before applying phase 2:

1. Customer login succeeds.
2. Employee login succeeds.
3. Customer can send one text message and one image.
4. Employee can see both and reply with one text message and one image.
5. Existing orders, invoices, and tracking open normally.

## Phase 2 SQL validation

Immediately after running the additive session migration, but before deploying
frontend changes:

1. Log in using the existing customer page.
2. Log in using the existing employee page.
3. Open customer orders and employee orders.
4. Send one text message each way.

Expected: behavior is identical to the pre-migration baseline. Phase 2 SQL must
not remove or rename legacy columns, policies, functions, or grants.

## Phase 2 frontend validation

Use the preview branch first. Do not merge to `main` until every item passes.

### Customer

1. Open a private/incognito window.
2. Log in with a known customer code/phone and password.
3. Refresh the dashboard; the session must remain valid.
4. Open active orders and order history.
5. Open one invoice without changing the order.
6. Open chat and send `V143 customer text test`.
7. Upload one new image.
8. Refresh chat; both text and image must remain visible.
9. Log out, refresh, and confirm the dashboard no longer opens as that customer.

### Employee

1. Open a second private/incognito window.
2. Log in with a known employee account.
3. Refresh the employee dashboard; the session must remain valid.
4. Confirm the normal pipeline and order counts load.
5. Open the same customer chat.
6. Confirm the customer test text and image appear.
7. Send `V143 employee text test` and one image.
8. Refresh and confirm both replies remain visible.
9. Do not change order status, prices, payments, branches, or courier assignment
   during this authentication test.

### Chat image target

For a newly uploaded chat image:

1. Open Supabase Storage > `chat-attachments`.
2. Find the newest test object by its timestamp.
3. Confirm it opens normally.
4. Confirm its stored size is close to 100 KB. A small variance is acceptable;
   the upload must not fail merely because an already-compressed image cannot be
   reduced to exactly 100 KB.
5. Confirm an older pre-V143 image still opens.

### Isolation checks

1. While logged out, directly opening a customer or employee dashboard URL must
   redirect to login or show an unauthorized state.
2. Changing an ID in a dashboard URL must not switch to another account.
3. A customer must see only their own messages and orders.
4. An employee may see the operational customer conversations required by the
   existing workflow, but the employee identity must come from the verified
   session rather than only from a URL parameter.

## Pass criteria

Phase 2 passes only when:

- All old login paths continue working during the compatibility period.
- New verified sessions survive refresh and are removed on logout.
- Customer/employee text and image chat works in both directions.
- Existing images remain available.
- Orders, invoices, statuses, payments, selling, tracking, and Supabase data are
  unchanged by the phase.
- CI and E2E checks for the touched surfaces are green.

## Stop and rollback conditions

Stop immediately and do not merge if any of these occurs:

- A valid existing account can no longer log in.
- A dashboard displays another user's data.
- Text or image chat fails in either direction.
- Old attachment URLs stop opening.
- Any order, invoice, payment, status, branch, vendor, or delivery behavior changes.
- The browser enters a login loop or loses the session on refresh.

Frontend rollback: redeploy the phase 1 checkpoint/tag.

Database rollback: use only the rollback file delivered with the exact phase 2
migration. Do not use the phase 1 grant rollback for an unrelated phase 2 issue.
