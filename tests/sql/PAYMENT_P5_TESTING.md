# Payment-P5 isolated verification

All live database writes in this report were performed on `KINTO-Payment-Test` (`udtegahgxgqvflodjkjt`) only. Nothing was sent to the original Supabase project. The isolated project is PostgreSQL 17 with the KINTO schema and G16/P2/P4 plus existing G20/G5/V47 functions and triggers.

## Direct campaign payment

The new campaign flow uses P4 stock holds for paid products and gifts, and a separate P5 campaign quota hold. It does not create an operational KN at reservation time. On a successful simulator result, one database transaction invokes the existing G20/G5 canonical checkout, verifies the server-computed total, and changes the generated KN to `تم التسديد` through the existing payment guards so V47 runs once. Failure/cancel releases both holds; unknown outcome retains them until P4 reconciliation. No G20, G5, V47, order, or inventory trigger was disabled or replaced.

Live HTTP checks in `payment-p5-campaign.integration.mjs` used the deployed P5 Edge Function and two distinct customer sessions:

- Coupon points on direct-campaign reservation were rejected by the Edge Function and again by the database RPC.
- Two customers racing for the only paid product got one reservation; the other received `PAYMENT_P4_INSUFFICIENT_TOTAL_STOCK`.
- Two customers racing for the only gift got one reservation; the other received `PAYMENT_P4_INSUFFICIENT_TOTAL_STOCK` for the gift line.
- Two customers racing for the final campaign quota got one reservation; the loser received `DEALS_ALLOCATION_LIMIT_REACHED`.
- Replaying an idempotency key returned the same attempt.
- A failed simulator outcome released stock and quota holds. A disconnect moved the attempt to `reconciliation_required` and retained both holds.
- P4 admin reconciliation with test-only `confirmed_no_charge` evidence released the unknown attempt. The P5 sync trigger updated the payment and quota ledgers; a read-only check found zero unresolved attempts.
- A successful simulator outcome called G20/G5, created exactly one KN (`KN-000007`) in `تم التسديد`, and produced one confirmed G5 redemption. The duplicate success request returned `duplicate=true`; no second KN or redemption appeared. The persisted total was 1,000 IQD.
- A separate successful direct campaign with a gift produced `KP-000000017` and one paid KN (`KN-000008`). Its canonical G5 snapshot contained the gift at zero price, `gift_fulfilled=true`, and a confirmed redemption. V47 reduced the paid matrix variant and gift inventory once each. A duplicate success stayed on the same KP/KN. Both product stocks were restored to their baseline after evidence capture.

One live application-level inventory race was also repeated through two independent SQL tool calls, each returning a different PostgreSQL backend PID (`29674` and `29675`). Both sessions concurrently reserved one unit of the same matrix variant; the resulting reservations used the two remaining units after an existing gift-flow hold, matching the configured matrix availability. Both temporary reservations were cancelled after the check. No test used a Node-only stock mock.

The test created four short-lived campaign fixtures (last product, last gift, last quota, and independent-session matrix concurrency), a second disposable customer, and temporary sessions. The campaign fixtures were archived and unpublished; the second customer and temporary sessions were removed. Two successful test KNs remain as paid audit fixtures (`KN-000007` without a gift and `KN-000008` with one gift). Product 333 was restored to stock 1; product 334 was restored to stock 10, matrix `blue_small` 1, and variant counts 10. At the end of the campaign testing the settings were restored to manual mode and all electronic gates were closed. They were later reopened temporarily, with audit entries, for the manual browser session described below.

## Existing cart and customer checks

The earlier HTTP security tests remain documented in `tests/sql/payment-p5-http.integration.mjs` and were not re-run in this continuation, per instruction. Their results include guest/expired/forged-session rejection, cross-customer isolation, server-authoritative amounts, idempotency, and one-winner contention through HTTP. The browser-accessible cart/“مدفوعاتي” journey was not re-run in this continuation.

## Protected browser preview and temporary session

Preview URL: https://meshwar-system-v2-git-feature-kinto-payment-p5-kinto1.vercel.app/payment-p5-isolated-preview.html

The preview is protected by Vercel. The browser available to the operator had previously reached Vercel Login; do not disable protection or make the page public. Open it with an already authorized Vercel team identity. The page calls only the `udtegahgxgqvflodjkjt` project URL, restricts the preview login/logout actions to this exact project and preview origin, and uses only its public publishable key. No service key or customer password is embedded in GitHub or the HTML.

No test customer session has been created because no authorized test-project admin credentials or customer password were provided. The preview now has a test-only account setup flow that uses the existing KINTO `admin_login_v147` and `admin_save_account_v300` procedures. Enter the **test-project admin** credentials and choose a new customer password directly in the protected page. The server creates a clearly marked `P5T-<uuid>` customer, immediately calls `admin_logout_v147`, authenticates the new customer through `customer_review_login_v132`, caps the customer session to 15 minutes, and returns the customer login code plus record UUID. Passwords and tokens are never printed or stored by the page; the fields are cleared after submission. Do not enter production admin credentials, and do not send credentials or session tokens in chat. The customer token remains only in page memory. Select **إنهاء الجلسة** after the test; closing the tab clears the in-memory token and the database session expires within 15 minutes even if logout was not called.

Temporary test-only state (read-only checked on 2026-10-19): G16 `payment_mode=electronic`, `gateways_enabled=false`; P4 `effective_mode=electronic`, stable and ready; P2 emergency stop is off and provider `kinto-simulator` is selected; P5 simulator is on. The provider remains `test_only=true`, `integration_ready=false`, `real_collection_allowed=false`; P5 also enforces `real_collection_allowed=false`. Thus the simulator is available to the test page but no real provider or collection can be used. This is a temporary exception for the isolated project only.

After the manual browser test, run `tests/sql/payment-p5-test-project-close.sql` against **KINTO-Payment-Test only**. It first refuses to proceed if active/reconciliation-required P4 stock holds, pending/reconciliation-required attempts, or active/reconciliation-required campaign holds remain. It then turns on the emergency stop, disables and unselects the simulator, closes P5, returns P4 and G16 to manual, and writes audit rows. If the script refuses because an unknown attempt remains, reconcile it through the approved P4 path before trying again. Never execute this file against `hsmmbloouskqdnptiiad`.

The browser journey has not yet been clicked through in this session: it requires the authorized Vercel identity, a known test-project admin login, and the customer password chosen by the owner. After account setup the page logs the customer in automatically. Click **حالة الدفع**; with the verified test-only settings the function should return `checkout_available=true`, and the page displays **جاهز للاختبار · المحاكي فقط · التحصيل الحقيقي مغلق**. Then use the provided test cart to review, reserve, simulate, check KP/KN and invoice links, and view **مدفوعاتي**. Report any issue without sharing credentials or the session token.

P5 is **not ready for merge** until the interactive browser preview is available and the client journey/“مدفوعاتي” is exercised there. No real gateway or collection was enabled or tested.
