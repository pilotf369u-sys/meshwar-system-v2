# Launch 28 — visual refinement only

Rollback: prior27 a499d969f33226f1320333bc5108552775886bde; separate branch app/launch-smooth-v28-20261024. No merge, deploy or production signing.

One smooth 2-second cosine breathing cycle (3.5% scale, no opacity flicker), followed by 560ms eased zoom to 2.65x and fade. No transform reset at reveal. Loading starts underneath immediately. No normal preparation text. Slow loading keeps branded screen until ready or existing 12-second connection retry; errors remain actionable. Reduced-motion uses no animation. No repeated warm-return splash.

Only LaunchOverlay cosmetic logic and preview28 identity/build/test references changed. All six readers, shared product button, pricing, routing, order handoff and sessions must remain byte-identical to27. Actual phone visual acceptance is still required; CI results will be recorded after completion.
