# Accepted Android store-reader baseline — 24 October 2026

Owner explicitly confirmed all current stores working on the phone after APK24 and asked to close this package before adding other stores. This supersedes the pending phone acceptance in MAD-24-NOTES.md. Acceptance covers the reported store reading/price/options experience; it is not proof of production order submission or store-release readiness.

Frozen code: 6b584a6e7b0ba7bb56d39d2fe834dbb39fee1d0e; tree 79859b7aac160546b59b0912ac1caa9ded811c4d. Permanent rollback branch: baseline/stores-v24-accepted-20261024. Package com.kinto.preview.hybrid.v24; APK SHA256 af10d9e015bf3bdaf27764cc6b2eb0d9054bf24c45b3f42defbd3e06d3c77d07.

Current accepted reader family: Trendyol, Hepsiburada, Zara, Madame Coco, Mango and MAD Parfum. Preserve each independent reader and existing Pricing/AdminPricing. New adapters must follow docs/KINTO-GLOBAL-STORE-ADAPTER-LESSONS.md plus MANGO-MAD-22-NOTES.md, MAD-23-NOTES.md and MAD-24-NOTES.md. In particular preserve Hepsi conditional-price policy, Zara current-article identity, Mango selected-color/size identity, and MAD exact same-product malformed canonical exception. Do not generalize selectors or bypass identity checks.

Focused APK24 CI run40104187458 passed: 9 Caramel identity cases, 15 prior MAD layout cases, 54 existing reader cases, Java checks, accepted-asset hashes, candidate fixture exclusion, native MAD confirmation/local TEST draft and restoration. Anonymous actual-retailer run40104187441 passed direct and internal MAD navigation at999.99TRY/50ml. Older comprehensive22 suite remains independently flaky; no claim that it was repaired.

Zara/Madame/Mango/MAD production server submission remains blocked; reader acceptance does not enable it. No real purchase/payment tested here. No main merge, Hostinger deployment, Supabase changes, production signing or store publication authorized by this closure. Keep draft PRs open as historical review records; do not close/delete their unmerged code branches. Start future store work from this accepted snapshot with a fresh rollback and branch.
