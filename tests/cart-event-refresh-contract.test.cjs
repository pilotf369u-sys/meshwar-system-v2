// Offline-only regression contract: no Supabase access, no production browser.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const src = fs.readFileSync('js/local-cart-v93.js','utf8');
test('cloud cart no longer polls every eight seconds', () => {
  assert.doesNotMatch(src,/cloudPollTimer/);
  assert.doesNotMatch(src,/setInterval\s*\([^;]*8000/);
  assert.match(src,/function refreshCloudCartIfIdle\(\)/);
});
test('refetches only on cart open or foreground events', () => {
  assert.match(src,/function open\(\)\{syncScope\(\);render\(\);refreshCloudCartIfIdle\(\)/);
  assert.match(src,/document\.addEventListener\('visibilitychange'/);
  assert.match(src,/window\.addEventListener\('focus',refreshCloudCartIfIdle\)/);
  assert.match(src,/window\.addEventListener\('pageshow'/);
  assert.match(src,/if\(!cloudReady\)\{initializeCloudCart\(\);return\}/);
  assert.match(src,/if\(document\.hidden\|\|checkoutBusy\|\|cloudDirty\|\|cloudConflict\|\|cloudSyncing\)return/);
});
test('V189 safe cloud-only cart writes, stock validation and checkout remain in place', () => {
  for (const token of [
    'rpc/customer_cart_get_v189',
    'rpc/customer_cart_put_v189',
    'CART_REVISION_CONFLICT',
    'p_expected_revision',
    'validateCheckoutStock',
    'async function removeSubmitted(keys)',
    'rpc/kinto_checkout_session_v1',
    "version:'v189-cloud-only'",
    'if(!cloudDirty)return renderConfirmedView()'
  ]) assert.ok(src.includes(token), 'Missing safety contract: '+token);
  assert.doesNotMatch(src,/localStorage\.setItem\(scope\.key/);
});
