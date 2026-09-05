import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const read = file => readFile(path.join(root, file), 'utf8');

test('V98 shipping settings are session-protected and lost-update safe', async () => {
  const [sql, ui] = await Promise.all([
    read('supabase/migrations/20260905_v98_vendor_shipping_settings.sql'),
    read('js/vendor-shipping-settings-v98.js')
  ]);

  expect(sql).toContain('create table if not exists public.vendor_shipping_profiles');
  expect(sql).toContain('create table if not exists public.vendor_shipping_companies');
  expect(sql).toContain('create table if not exists public.vendor_shipping_rates');
  expect(sql).toContain('private.require_vendor_session(p_session_token)');
  expect(sql).toContain('SHIPPING_SETTINGS_VERSION_CONFLICT');
  expect(sql).toContain('for update;');
  expect(ui).toContain("vendor_get_shipping_settings");
  expect(ui).toContain("vendor_save_shipping_settings");
  expect(ui).toContain('p_expected_version:state.version');
});

test('V98 snapshots one resolved vendor quote on every independent order', async () => {
  const [sql, compatSql, uuidCompatSql, cart, invoice, vendorInvoice] = await Promise.all([
    read('supabase/migrations/20260905_v98_vendor_shipping_settings.sql'),
    read('supabase/migrations/20260905_v98_shipping_details_type_compat.sql'),
    read('supabase/migrations/20260905_v98_shipping_uuid_text_compat.sql'),
    read('js/local-cart-v93.js'),
    read('js/kinto-bundle-ui-v93.js'),
    read('js/vendor-v94-multistore-orders.js')
  ]);

  expect(sql).toContain("'checkout_contract', '') <> 'independent_vendor_orders'");
  expect(sql).toContain('private.v94_jsonb_object(to_jsonb(new.details))');
  expect(sql).not.toContain('private.v94_jsonb_object(new.details)');
  expect(sql).toContain('c.id::text = new.customer_id::text');
  expect(sql).not.toContain('c.id = new.customer_id');
  expect(sql).toContain('))::text;');
  expect(compatSql).toContain('private.v94_jsonb_object(to_jsonb(new.details))');
  expect(compatSql).not.toContain('private.v94_jsonb_object(new.details)');
  expect(compatSql).toContain('c.id::text = new.customer_id::text');
  expect(uuidCompatSql).toContain('c.id::text = new.customer_id::text');
  expect(uuidCompatSql).not.toContain('c.id = new.customer_id');
  expect(sql).toContain('SHIPPING_DESTINATION_UNSUPPORTED');
  expect(sql).toContain('SHIPPING_CURRENCY_MISMATCH');
  expect(sql).toContain("'shipping_snapshot', v_quote");
  expect(sql).toContain("'grand_total_local'");
  expect(cart).toContain('تُضاف تعرفة توصيل التاجر تلقائياً');
  expect(invoice).toContain('توصيل المتجر');
  expect(vendorInvoice).toContain('vendor_get_order_segment_shipping');
  expect(vendorInvoice).toContain('data.grandTotal');
});

test('V98 schema prepares realtime consumers without exposing direct table access', async () => {
  const sql = await read('supabase/migrations/20260905_v98_vendor_shipping_settings.sql');

  expect(sql).toContain('updated_at timestamptz not null default now()');
  expect(sql).toContain('alter table public.vendor_shipping_rates enable row level security');
  expect(sql).toContain('revoke all on public.vendor_shipping_rates from public, anon, authenticated');
  expect(sql).toContain('shipping_company_name text');
  expect(sql).toContain('shipping_snapshot jsonb');
});

test('V99 vendor order list projects immutable shipping and realtime row identity', async () => {
  const [sql, compatSql, adapter, dashboard] = await Promise.all([
    read('supabase/migrations/20260905_v99_vendor_order_shipping_projection.sql'),
    read('supabase/migrations/20260905_v100_vendor_shipping_snapshot_key_compat.sql'),
    read('js/vendor-v94-multistore-orders.js'),
    read('vendor-dashboard-v2.html')
  ]);

  expect(sql).toContain('private.require_vendor_session(p_session_token)');
  expect(sql).toContain('o.shipping_company_name');
  expect(sql).toContain('o.delivery_fee');
  expect(sql).toContain('o.shipping_snapshot');
  expect(sql).toContain('segment_updated_at timestamptz');
  expect(compatSql).toContain("o.shipping_snapshot ->> 'provider'");
  expect(compatSql).toContain("o.shipping_snapshot ->> 'cost'");
  expect(compatSql).toContain("v.order_details #>> '{shipping_snapshot,provider}'");
  expect(compatSql).toContain('private.v94_jsonb_object(to_jsonb(o.details))');
  expect(adapter).toContain('shipping.provider');
  expect(adapter).toContain('shipping.cost');
  expect(adapter).toContain('snapshot.provider');
  expect(adapter).toContain('snapshot.cost');
  expect(adapter).toContain('data-vendor-shipping-snapshot');
  expect(adapter).toContain('data-vendor-segment-id');
  expect(adapter).toContain('data-vendor-order-id');
  expect(adapter).toContain('data-segment-updated-at');
  expect(dashboard).toContain('<th>الشحن</th>');
});

test('V101 checkout carries destination and resolves an active same-currency fallback', async () => {
  const [sql, cart] = await Promise.all([
    read('supabase/migrations/20260905_v101_checkout_shipping_destination_fallback.sql'),
    read('js/local-cart-v93.js')
  ]);

  expect(cart).toContain('customers?select=*');
  expect(cart).toContain('shippingDestination(customer)');
  expect(cart).toContain("rpc/checkout_independent_vendor_orders_v101");
  expect(sql).toContain("'app.checkout_customer_shipping'");
  expect(sql).toContain('private.v101_location_key');
  expect(sql).toContain("v_mode := 'default_fallback'");
  expect(sql).toContain("upper(r.currency) = v_currency");
  expect(sql).toContain("'provider', v_match.company_name");
  expect(sql).toContain("'cost', v_match.delivery_fee");
  expect(sql).toContain('SHIPPING_RATE_NOT_CONFIGURED_FOR_ORDER_CURRENCY');
});

test('V102 preserves cross-currency fallback and coalesces vendor table rendering', async () => {
  const [sql, adapter, dashboard] = await Promise.all([
    read('supabase/migrations/20260905_v102_shipping_currency_fallback_and_ui_stability.sql'),
    read('js/vendor-v94-multistore-orders.js'),
    read('vendor-dashboard-v2.html')
  ]);

  expect(sql).toContain('private.v102_resolve_shipping_quote');
  expect(sql).toContain("v_mode := 'cross_currency_default'");
  expect(sql).toContain("'mixed_currency'");
  expect(sql).toContain("'grand_total_components'");
  expect(adapter).toContain('segmentLoadPromise');
  expect(adapter).toContain('segmentReloadQueued');
  expect(adapter).toContain('if(markup!==lastOrdersMarkup)');
  expect(adapter).not.toContain("setTimeout(()=>{if(runtime.getStore())loadSegmentOrders()},100)");
  expect(adapter).toContain("meshwar:vendor-segment-adapter-ready");
  expect(dashboard).toContain('window.MeshwarVendorV94?.loadOrders');
  expect(dashboard).toContain('loadDashboardOrders()');
  expect(dashboard).toContain("meshwar:vendor-segment-adapter-ready");
  expect(dashboard).not.toContain('setTimeout(()=>openDashboard(),180)');
});
