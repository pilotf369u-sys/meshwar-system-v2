# Zara price-reading retry — preview 18

Base and rollback: validated Hepsiburada preview 17, remote f9502e11f949d13b5679328226bdc31130e58f45; rollback/before-zara-v18-20261024.

Reuses the prior Zara reader without merging its website or SQL changes. Adds the observed mobile fixed-info-panel purchase surface, missing-color optionality, display-only price while size-dependent options are pending, and exact Turkish product/CDN boundaries. Stable read checks never cache a prior product price. Ordinary visible current TRY price remains distinct from crossed-out prices.

Evidence: sanitized fresh public mobile markup (2026-10-24) has no .product-detail-card-info or .product-detail-info root. Its actual price 2190 TRY resides in .product-detail-card-info__fixed-info-panel. Replay must assert visible source, not merely an equal SEO fallback price. Earlier observed desktop/footer excerpts also retained.

Scope: Android app and isolated checks only. Trendyol and Hepsiburada readers remain byte-identical to preview 17. No website, SQL, Supabase, hosting, production identity, certificate, or existing commerce-flow changes. Shared button gets an additional exact Zara URL branch; existing branches retained and regression tested.

Zara remains a reading/confirmation/local-draft trial. Sending Zara drafts is explicitly blocked in the app because production world-order validation has not been enabled for Zara. No SQL or production write is authorized or executed. After device acceptance, separately review the minimal frontend/server store admission change before enabling review submission.

Candidate: com.kinto.preview.hybrid.v18, version 18, disposable signing material generated outside checkout. Fixtures excluded from non-debuggable candidate. No merge, Hostinger deployment or store release.
