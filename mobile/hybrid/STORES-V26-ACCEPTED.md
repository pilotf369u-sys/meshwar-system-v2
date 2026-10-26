# Owner-accepted Android baseline26

On 24 October 2026 the owner explicitly confirmed Mango26 size selection, order submission and receipt by the global-order employee. Other current stores had already been reported working and reaching the employee on25. This supersedes pending phone acceptance in MANGO-26-NOTES.md; it does not claim every fulfillment/payment step was manually repeated on26 or store publication readiness.

Frozen tested code:49c3849ce42927109d5602bec7eb2d60c5afeb8f. Rollback baseline/stores-v26-accepted-20261024. Package com.kinto.preview.hybrid.v26. APK SHA256573b3b5d3c0a8ff3d372b50f85eaf8d709b48a28ddda13cd052555344fea8280;185836bytes. Successful CI40113378933, native120929831888.

For future adapters preserve independent reader identity/price rules and admin Pricing/AdminPricing. Mango lesson: displayed converted price with optionsPending can mean price is valid but the retailer selection was not recognized. Do not infer from cart or bypass confirmation. Native explicit available-size list bound to the current product, followed by fresh URL/product/color/TRY/price/availability checks and explicit customer confirmation, succeeded on the owner's phone. No automatic first-size selection or retailer-cart writes. Reuse this approach only with a new store's observed current-product availability data and tests.

Current global order server admission was activated and website integration merged in PR1093 earlier;26 changed only the Android Mango size flow. No further SQL/hosting/main merge/signing change is authorized or performed by this acceptance record. PR1100 remains the review record; do not blindly merge stacked app history to main. Start future store work from this frozen code with a fresh branch and rollback.

