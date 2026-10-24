# Launch 28 — visual refinement only

Rollback: prior27 a499d969f33226f1320333bc5108552775886bde; separate branch app/launch-smooth-v28-20261024. No merge, deploy or production signing.

One smooth 2-second cosine breathing cycle (3.5% scale, no opacity flicker), followed by 560ms eased zoom to 2.65x and fade. No transform reset at reveal. Loading starts underneath immediately. No normal preparation text. Slow loading keeps branded screen until ready or existing 12-second connection retry; errors remain actionable. Reduced-motion uses no animation. No repeated warm-return splash.

Only LaunchOverlay cosmetic logic and preview28 identity/build/test references changed. All six readers, shared product button, pricing, routing, order handoff and sessions must remain byte-identical to27. Actual phone visual acceptance is still required; CI results will be recorded after completion.

Visual review of first28 run40127731409 found separately scheduled view-property fades could leave the brand text while the logo was already faint. Before delivery, unified zoom/text/background into a single ValueAnimator clock with delayed cubic background fade and no separate logo-opacity fade. Added internal native screen recording to verify the actual transition; no user data is recorded. Re-test pending.

Final visual review caught an inherited ImageView overload bug: setAlpha(1) selects 1/255 integer image opacity, not full View opacity. Both sites now explicitly call setAlpha(1f). Added three-frame gold-logo visibility assertion, and start recording after the native cover marker to exclude platform cold-start time. Final rerun targets launch/opacity/offline/warm/privacy checks; prior09635702 native Mango and four-store handoff checks passed and their implementation remains unchanged.

## Verified final result

Runtime commit823920e7c8b64865c04ed27796b8aba99a84180f. Run40129156569: candidate120976949025 and preview120977228013 both SUCCESS. Native logo-opacity, breathing frames, zoom reveal, interface usability, warm return, privacy entry and anonymous offline retry all passed on Android36. Video inspection independently confirms the gold logo width grows from335px to865px before fading. No real account/order/payment writes.

Reader/Java/pricing tests passed again. Native Mango selection and four-store handoff passed on prior09635702 run40128468750; their code/assets remain byte-identical. Every bundled asset and MainActivity/ShoppingActivity/Pricing/AdminPricing/UrlPolicy remains unchanged from27. Pre31 and the owner's real phone were not re-tested in this run; owner acceptance of appearance remains pending.

Delivered candidate (non-debuggable, disposable test key, packagecom.kinto.preview.hybrid.v28): KINTO-0.28-Smooth-Launch.apk,202427bytes, SHA256d47378a2e8e44aac885b75d93f1d713cf6e438587c3821d1171baeb5970df470. Final artifact12574457379; older28 artifacts must not be delivered. DraftPR1105 is unmerged. No Hostinger update, database change, final signing or store upload. Publication gates from27 remain open.
