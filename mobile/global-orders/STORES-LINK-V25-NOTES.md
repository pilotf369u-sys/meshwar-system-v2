# Accepted store adapters into existing global-order workflow

Owner requested completing actual orders, not stopping at reader/price success. Based on owner-accepted APK24 and frozen baseline/stores-v24-accepted-20261024. Work branch app/world-all-stores-20261024; rollback before-world-all-stores-20261024 locally and frozen baseline remotely.

Reuses the exact Trendyol/Hepsi MainActivity reviewProduct -> trusted customer dashboard -> kinto_world_submit_v1 -> existing employee/fulfillment workflow. Removed only four-source native refusal; synthetic fixtures still cannot submit, selected draft remains one product with stable request key and only trusted receipt removes it. All six reader assets, button, Pricing/AdminPricing, UrlPolicy, session code and employee/payment/fulfillment functions remain unchanged.

Website core adds exact Turkish Zara/Mango/MAD product routes and tenant image paths, alongside already prepared Madame support. Customer/employee panels use a new cache version so old core does not hide source labels/images. No new customer registration, employee panel or payment workflow.

sql/kinto-world-stores-v2.sql changes ONLY URL/image admission inside existing submit function. Transaction source guard accepts known Hepsi/Madame/new body hashes, rejects unknown production source before touching it. All server pricing, actor ownership, normalized request, advisory lock, replay/conflict and event behavior retained. Rollback restores Madame admission without deleting historical orders; existing rollback can restore Hepsi after review if required.

Verification: existing full isolated global workflow plus full separate Zara/Mango/MAD SQL journeys, consent/profile/compact-card browser fixtures, per-store domain/image negatives, old Trendyol/Hepsi/Madame regressions, one-product replay/concurrency, expiry/revocation/privacy, branch/courier delivery and preservation of unrelated functions/triggers/local-order sentinel. Native private APK25 pipeline builds unsigned candidate and disposable-key signed test package, reruns MAD identity/price cases and accepted asset checks; new offline native handoff test injects synthetic verified captures into DEBUG preferences, checks exactly one product/options/key and retries without any session/server submission. Does not claim one connected real-device/production journey before activation.

Activation order (REQUIRES owner merge/deployment/SQL approval):
1. Rebase/transplant only reviewed website/core/cache and SQL integration onto latest main; inspect any current changes before merge. Do not blindly merge stacked app history.
2. Read-only verify production submit body hash; run reviewed guarded SQL with a saved old definition and rollback. No live SQL run by this development task.
3. Publish reviewed website updates through normal manual Hostinger release; verify actual live files/cache version and customer/staff login.
4. Install signed private APK25 only after website/server admission verified, then owner accepts each store end-to-end. Existing APK24 retains its source refusal and cannot be enabled by hosting alone. Preview25 has a separate test package; unsent APK24 local drafts are not automatically transferred.
5. Any production smoke writes require agreed TEST customer/staff/data and cleanup; never real order/payment. Staff review controls perfume/carrier eligibility and shipping. Purchasing still requires bank-verified payment and fresh availability; no automatic gateway collection added.

No main/00-hostinger-release merge, Hostinger deploy, Supabase production execution, production signing/fingerprint change or store publication performed. Results of final CI runs are recorded in the draft PR. Older unrelated comprehensive22 native accessibility flakiness is not represented as repaired.
