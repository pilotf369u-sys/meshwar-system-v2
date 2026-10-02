/* KINTO DEALS G0: read-only regression map. No application runtime hooks. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('normal cart keeps the existing v101 independent-store checkout', () => {
  const cart = read('js/local-cart-v93.js');
  assert.match(cart, /rpc\/checkout_independent_vendor_orders_v101/);
  assert.match(cart, /function buildStores\(items\)/);
  assert.match(cart, /rpcItems=items\.map/);
  assert.doesNotMatch(cart, /kinto_deals|campaign_id/i, 'G0 must not alter live checkout');
});
test('v101 is a shipping wrapper delegating to the existing independent checkout', () => {
  const sql = read('supabase/migrations/20260905_v101_checkout_shipping_destination_fallback.sql');
  assert.match(sql, /create or replace function public\.checkout_independent_vendor_orders_v101/);
  assert.match(sql, /return public\.checkout_independent_vendor_orders\(/);
});
test('existing paid stock lifecycle and store-segment invoice remain in place', () => {
  const stock = read('supabase/migrations/20260902_local_cart_bundle_checkout_v93.sql');
  const segment = read('supabase/migrations/20260903_v94_order_store_segments.sql');
  assert.match(stock, /new\.status <> 'تم التسديد'/);
  assert.match(stock, /trg_meshwar_local_cart_bundle_stock_lifecycle/);
  assert.match(segment, /create table if not exists public\.order_store_segments/);
  assert.match(segment, /invoice_version/);
});
test('admin customer promotion remains an admin-owned, explicit send action', () => {
  const composer = read('js/admin-customer-notices-v415.js');
  const sql = read('supabase/migrations/20261001_v420_customer_notice_linked_stores.sql');
  assert.match(composer, /admin_send_customer_notice_v420/);
  assert.match(composer, /KintoAdminSessionV147/);
  assert.match(sql, /kinto_customer_notice_stores_v420/);
});
test('merchant campaign entry belongs in actual vendor frame, not a duplicate invoice', () => {
  const shell = read('vendor-dashboard.html');
  const frame = read('vendor-dashboard-v2.html');
  const invoice = read('js/vendor-v94-multistore-orders.js');
  assert.match(shell, /vendor-dashboard-v2\.html/);
  assert.match(frame, /vendorTab-notifications/);
  assert.match(invoice, /function storeInvoiceDocument\(/);
});

test('merchant deals must not hijack the existing KINTO-funded campaign hook', () => {
  const sql = read('supabase/migrations/20261001_v411_campaign_instant_order_discount.sql');
  assert.match(sql, /before insert on public\.orders/);
  assert.match(sql, /'funded_by','kinto'/);
  assert.match(sql, /new\.kinto_campaign_discount_snapshot:=jsonb_build_object/);
});
test('variant and matrix stock are both accounted for at payment', () => {
  const sql = read('supabase/migrations/20260902_local_cart_bundle_variant_stock_fix_v93.sql');
  assert.match(sql, /for update/);
  assert.match(sql, /meshwar_adjust_variant_stock/);
  assert.match(sql, /meshwar_adjust_matrix_stock/);
  assert.match(sql, /bundle_stock_lifecycle_state/);
});
test('verified customer identity RPC exists separately from cart scope', () => {
  const sql = read('supabase/migrations/20260922_v150_customer_session_identity.sql');
  assert.match(sql, /private\.require_customer_review_session\(p_session_token\)/);
});
