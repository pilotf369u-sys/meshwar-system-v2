# KINTO V143 — Employee verified session: apply and test

This phase affects employee authentication only. It does not change order,
invoice, payment, status, chat, storage, branch, courier, customer, or vendor
data/workflows.

## Current safety points

- Production baseline: `636a134173fea22cc288e2b8814f0236df41729a`
- Post-security-phase-1 recovery tag: `kinto-after-security-phase1-v143`
- Phase 2A database rollback:
  `supabase/read-only/20260921_v143_employee_verified_sessions_rollback.sql`

## Apply order

1. Because V143 was already installed once, run only the repair migration:
   `supabase/migrations/20260922_v144_employee_session_runtime_repair.sql`
2. Confirm **Success. No rows returned**.
3. Before any frontend deployment, verify the old live employee login still
   works. The SQL is additive and the old frontend does not use it yet.
4. Deploy this branch to a preview URL, not production.

## Preview test

Use a private/incognito window:

1. Open the preview login page.
2. Log in with a valid employee account.
3. Confirm the employee name appears and the usual pipeline loads.
4. Open a non-default employee tab and refresh. It must stay on that tab.
5. Open one order and one existing customer conversation without editing them.
6. Refresh again; the employee session must remain valid.
7. Copy the employee dashboard URL.
8. Click **تسجيل الخروج**.
9. Refresh and paste the copied employee URL. It must return to login and must
   not load employee orders.
10. In another private window with no login, change `employeeId` in the copied
    URL. It must still return to login.
11. Confirm the fifth failed employee password attempt shows the 15-minute
    lock message, and that a correct password is accepted after the window.
12. Confirm the issued session expires after 8 hours or immediately after
    explicit logout.

Do not change order status, price, payment, branch, courier, invoice, or message
data during this authentication test.

## Pass/stop gate

Merge only if all ten steps pass. Stop without merging if login loops, refresh
loses the session, logout reopens the dashboard, changing `employeeId` changes
identity, or any existing operational screen behaves differently.

## Rollback

Frontend: return to `kinto-after-security-phase1-v143`.

Database: run only
`supabase/read-only/20260921_v143_employee_verified_sessions_rollback.sql`.
The rollback removes only V143 session functions/tables and does not touch
employees, orders, messages, customers, or storage.
