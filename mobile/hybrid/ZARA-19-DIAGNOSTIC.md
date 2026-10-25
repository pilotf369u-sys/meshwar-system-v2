# Zara 19 — on-device price-loss evidence

Rollback: rollback/before-zara-v19-20261024, remote e37fc4de93bd98b325308328750c67895296662b. Separate diagnostic identity com.kinto.preview.hybrid.v19.

Preview 18 passed sanitized initial DOM and synthetic hydration checks but the user's actual device still loses the price while Zara's own price remains visible. This does not establish the specific failing guard. No speculative price-policy relaxation or cached first-price workaround is included.

Add bounded Zara-only reader diagnostics and six in-memory snapshots of the current product. When pressing the existing Add button on Zara, show a local report with explicit clipboard copy. Captures only product ID, observed price/options, counters, selected purchase-price markup amounts and current-price container visibility/classes, scroll position and monotonic elapsed seconds. Does not read cookies, session/local storage, cart contents or account details. Reports are never uploaded by the app, not persisted, and only copy after an explicit click. The broader current-price containers are diagnostic-only and never enter price selection. Clear provenance: user photos show the symptom; static markup replay is not live scroll reproduction.

Trendyol/Hepsiburada reader files and pricing policy unchanged. Zara source reader price algorithm unchanged; only diagnostic output added. Existing Zara server-submission block retained. No website, SQL, Supabase, hosting or production identity/certificate change. No merge or publishing.

Next device step: reproduce disappearing price, press Add on Zara, Copy report, paste into conversation. This is needed to identify the actual rejecting guard before the next functional fix.
