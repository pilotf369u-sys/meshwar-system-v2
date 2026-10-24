# KINTO — reusable lessons for external-store adapters

Status: 2026-10-24. Owner confirmed on-device success of Android preview 20 after earlier failures. This is an engineering reference, not a guarantee that another store or iOS behaves identically. Do not merge, deploy, or enable a new store's server submission without the applicable authorization.

## Proven baseline and boundaries

- Trendyol: working adapter; preserve its successful price/option behavior.
- Hepsiburada: preview 17 was confirmed working on the owner's device. Preview 20 preserves hepsiburada-reader.js, Pricing.java and AdminPricing.java byte-for-byte. Preserve ordinary-price versus conditional basket/membership-offer policy; never choose an instalment, coupon amount, old crossed-out price, or cheapest unrelated offer.
- Zara: owner explicitly confirmed preview 20 succeeds on device on 2026-10-24. Two preview-19 reports supplied the decisive evidence, after static/synthetic checks had missed the actual failure.
- Separate external browsing process/data from trusted KINTO account/session surfaces. No privileged JS bridge to external pages. Reuse existing customer confirmation, admin pricing and employee-review workflow; preserve local-store operations.

## Hepsiburada lesson

The actual mobile sticky purchase bar is outside the title/variant region. Relevant observed selectors are sticky-price, default-price, checkout-price, premium-price and prev-price. Read the normal current default price; for conditional checkout/membership offers preserve the observed ordinary base price until eligibility is reviewed. Missing or conflicting current prices stay unknown. Match canonical URLs by exact product identity, not identical translated slugs. Selected seller/variant/currency checks remain necessary. Never replace the successful Hepsi adapter with a new generic reader.

## Zara lesson — the decisive reports

1. Product 03548255 initially read 4890 TRY / Bej; later global queries collected six nodes containing 6990 and 4890 and the unrelated color Antrasit grisi. Result: Z_PRICE_AMBIGUOUS and zero matching metadata offers.
2. Product 02678247 initially read 4290 TRY / Siyah; later global queries collected six nodes containing 4890 and 4290 and Antrasit grisi. Same failure.

Zara keeps multiple product-detail carousel articles mounted. getClientRects and computed visibility do not establish that an element belongs to the current product or is horizontally active. Duplicate header/footer prices for ONE product are normal; combining neighbouring articles' fields is wrong. A visible price can disappear from KINTO because validation rejects mixed fields, even while the retailer's own price remains on screen.

Preview 20 binds the modern article using its explicit retailer reference: 3548/255/800 maps to URL product ID 03548255 (first two reference components, padded to eight digits). It requires one matching horizontally active article, then scopes title, prices, colors, sizes and images to that article. Vertical scrolling and a movable footer within the article remain valid. Missing, inactive or ambiguous identity and real conflicts inside the article fail closed. Legacy whole-page parsing is retained only when no modern carousel articles exist. Do not copy Zara's reference format or selectors to another store without observing its real DOM.

## Lifecycle lesson

ShoppingActivity previously lacked saved browsing state. Preview 20 saves/restores allowed external WebView history, with the last allowed URL as fallback; it re-reads admin pricing rather than saving a quote. MainActivity's trusted-account behavior and session isolation stay unchanged. Native synthetic Hepsi/Zara tests navigate to a distinct intercepted HTTPS product URL, force Activity recreation via rotation, and assert restored page and identical synthetic conversion. Ordinary app switching on a real phone remains a separate acceptance case; retailer visibility redirects are not automatically proven to be Android recreation.

## Workflow for each new store

1. Preserve a rollback and a working baseline. Inspect existing experiments, native URL/image policy and server store admission before adding code.
2. Observe the actual mobile purchase surface after hydration, vertical/horizontal scroll, option changes, SPA navigation and background/return. Identify mounted neighbouring cards, hidden responsive copies and conditional prices.
3. Establish exact product identity and current variant/seller/currency before reading fields. Scope every field to that identity. Do not select the first card, first amount, lowest amount, or cached initial price.
4. Keep independent adapters. Reuse the architecture and validation approach, not arbitrary selectors. Preserve working adapters and pricing files with byte comparisons and targeted regressions.
5. When reproduction is missing, collect a bounded local diagnostic: current product ID, rejection code, price candidates, card references/visibility and observed options. Exclude account data, cookies and storage. Copy/upload only by explicit user action. Remove forced diagnostics from normal successful customer flow.
6. Replay the reported failure, including neighbouring cards with differing prices AND colors. Cover duplicate same-price header/footer nodes, real current-card conflicts, missing/duplicate identity, unselected/unavailable options, currency mismatches and transitions to another product.
7. Run native touch/confirmation and lifecycle tests as well as DOM tests. Model carousel clipping/accessibility accurately; a headless DOM pass alone is insufficient. Use synthetic data, never real orders or payment.
8. Obtain real-phone acceptance. Separately enable/review website and server admission when authorized; a working app reader does not imply employee submission is enabled.

## Snapshot of accepted preview 20

- Branch: app/zara-card-scope-v20-20261024; draft PR #1075.
- Remote tested code head: 9add20441af6a3657c5b4259a9598ef11471a223.
- Successful CI run: 40076106736; native job 120819918641.
- Private package: com.kinto.preview.hybrid.v20. Production com.kinto.app signing/fingerprint unchanged; no private keys in repository.
- Zara employee/server submission remains disabled. No website, SQL, Supabase or Hostinger changes were made for this fix.
- On-device success is the owner's confirmation, separate from CI's synthetic proof. This note records success; it does not authorize merge, deployment or store publication.
