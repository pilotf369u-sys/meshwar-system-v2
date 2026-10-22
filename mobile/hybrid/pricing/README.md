# Global pricing v1 — staged activation

Source starts from main 19949817036f30b1e6054ed240f0f9b7ad9d1927,
with tested Android preview a1107b8df2e51c0fb310e47d98f64a1c58853728 restored.
Rollback app: rollback/pre-global-pricing-20261022. No live SQL, hosting or store deployment.

Contract: every currency stores units per ONE USD. USD is always 1.
Formula: source price × quantity × target-per-USD × (100 + commission percent)
÷ (source-per-USD × 100). Commission is a markup on merchandise cost, not a
margin deducted from selling price. Round upward only once at the final amount:
whole IQD, two decimals for other display currencies. No shipping is computed.
Illustrative TEST: 1000 TRY / 40 TRY-per-USD × 1300 IQD-per-USD × 1.10 = 35750 IQD.
These are synthetic examples, not market rates or owner-approved rates.

The existing admin pricing tab receives an additive global pricing section.
Existing settings, currencies table, local store commissions, orders, auth,
payments and invoices are unchanged. Currency direction is explicit, codes are
unique and missing/zero/nonfinite values fail closed. The chosen display currency
must exist. Store source currency comes from the verified reader; current Android
reader supports TRY on Trendyol and does not guess other currencies.

SQL draft: sql/kinto-global-pricing-v1.sql. It creates new private configuration
and audit tables only, default DISABLED, with no invented exchange rates.
Public read/estimate RPCs expose pricing only. Save checks the existing real
private.require_admin_session_v147(text) guard and uses a locked revision check.
No new table grants or changes to old tables/functions/triggers. Rollback SQL
revokes only the new API and retains saved configuration/audit data.

Isolated PostgreSQL tests stub that existing guard with a fake test-only token;
the real production guard's existence was verified by a read-only query. No real
admin token was requested or used. Activation still needs owner approval for SQL,
review of the staged admin code, actual admin rates and manual Hostinger publish.

The Android button displays an estimate for one unit and explicitly excludes
shipping. It rereads product/variant prices and refreshes public settings, with
fresh settings required again on capture. Confirmation retains editable options,
quantity and explicit acknowledgment. Data remains a local TEST order with
serverSubmitted=false. Shipping remains null. A future server order submission
must recompute/validate current revision on the server and freeze the accepted
quote; the client quote is never permission to charge or a trustworthy order price.

Preview 4 is a separate disposable test identity. Nothing is published to stores.
