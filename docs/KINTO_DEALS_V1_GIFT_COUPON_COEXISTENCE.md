# KINTO DEALS V1: Gift and coupon coexistence

Agreed commercial rules, 2026-10-02. Documentation only. No checkout, stock, invoice, loyalty, shipping or auth modification.

- Keep the existing independent per-store order and invoice. Do not create a second payment or fiscal invoice system.
- Show an eligible free gift at its original catalog price struck through and label it "مجانا"; net gift payable is 0 IQD. On the existing store invoice show the catalog value and a corresponding 100% gift-only discount. The same product remains ordinarily priced when purchased normally.
- Qualifying paid product IDs, distinct-item or unit threshold and quantities are validated server-side BEFORE applying a loyalty coupon. A valid coupon does not revoke an earned gift.
- Existing same-store earned loyalty coupon may coexist with gift and ordinary-price limited/exclusive campaigns. Preserve existing maximum 10% of eligible paid merchandise; exclude gift catalog price, gift net amount and all shipping from the coupon base. Do not award loyalty earnings on the gift.
- A future direct product-price discount campaign must not double-discount an already discounted product line. Define exact handling in a separately approved server contract before introducing that campaign type.
- Only ONE gift per store order, even when the paid basket exceeds the threshold. Gift stock is validated and deducted once by the canonical lifecycle, never browser-side.
- Audit coexistence with existing admin-funded KINTO v411 order discount separately before G5 activation; prevent accidental stacking.
- Feature flag remains OFF. G5 needs an audited integration plan, tests, green CI, checkpoint and explicit E2E acceptance before activation.
