# Standalone-store cart readiness — 2026-10-18

The owner reported the generic cart-not-ready alert when adding a product in store.html. Production metadata confirms both V189 cart RPCs exist and anon can execute them. The inspected API logs show successful product/favorite reads but no cart request in the screenshot window. Production sessions and customer storage were not read from the browser, so their exact contents are not asserted.

## Reproduced failure

The complete shipped store page reproduces the same blocked-cart behavior with a valid saved customer session and no meshwar_customer_id/loggedInUser key (including the viewingCustomerId-only legacy state). The cart scopes itself as guest, skips cloud initialization, and blocks edits indefinitely. A stale valid UUID also directs the initial RPC at the wrong customer even though the session itself is valid. Favorites use the session directly and can still work.

## Fix

Resolve the current customer through the existing customer_session_identity_v150 RPC during cart initialization. Bind the in-memory cart scope to the returned customer ID and token rather than legacy display/account keys. Cart get/put still enforce server-side session ownership and the existing revision CAS; content remains cloud-only. Missing/expired/invalid sessions receive a clear login message and remain unable to read/write a cart. Transient identity failures can retry without enabling edits.

Bump cart script URLs on store, listing, home and customer pages, including the lazy loader. No SQL, database grants, payment/order transitions, price arithmetic or inventory changes.

## Verification

Browser regression loads actual store.html and all its scripts. Four initial-storage cases (missing, viewing-only, stale, canonical) use the actual product modal to add, increase quantity, reload the saved cart and delete. Mock RPCs assert the session owner and revision on every cart write. Three denial cases cover missing, expired and invalid sessions. These are fixture-backed browser tests, not a claim of access to the owner's Chrome session.

Deploy by merging the PR and waiting for Pages deployment; reload the affected store page. Rollback is the backup branch specified in the PR. No cart rows are removed by deployment.
