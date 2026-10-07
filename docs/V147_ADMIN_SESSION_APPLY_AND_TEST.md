# KINTO V147 — Admin verified session

This phase secures the admin account only. It does not change orders, invoices,
payments, tracking, messages, customers, vendors, branches, couriers, or employee
sessions.

## Apply order

1. Keep the frontend branch unmerged.
2. In Supabase SQL Editor, run only:
   `supabase/migrations/20260922_v147_admin_verified_sessions.sql`
3. Confirm `Success. No rows returned`.
4. Deploy or merge the V147 frontend only after the SQL succeeds.

## Private-window test

1. Open `login.html` in a new private/incognito window.
2. Sign in with a valid admin account and confirm the normal dashboard loads.
3. Refresh the admin dashboard; it must remain open.
4. Change `adminId` in the URL; the verified admin identity must overwrite it.
5. Open an order read-only and confirm the usual data loads.
6. Click **تسجيل الخروج**, refresh, and paste the old dashboard URL. It must stay on login.
7. Confirm five failed admin passwords trigger the 15-minute message.
8. Confirm customer, vendor, employee, branch, and delivery login still work.

Do not change order status, prices, payments, settlements, invoices, or messages
during the authentication test.

## Rollback

Frontend: revert the V147 PR.

Database: run only:
`supabase/read-only/20260922_v147_admin_verified_sessions_rollback.sql`
