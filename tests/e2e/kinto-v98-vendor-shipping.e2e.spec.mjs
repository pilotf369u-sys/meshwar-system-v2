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

test('V103 projects customer location and atomically mirrors independent order status', async () => {
  const [sql, adapter, shell] = await Promise.all([
    read('supabase/migrations/20260905_v103_vendor_location_and_global_status_sync.sql'),
    read('js/vendor-v94-multistore-orders.js'),
    read('vendor-dashboard.html')
  ]);

  expect(sql).toContain('customer_location jsonb');
  expect(sql).toContain('private.v103_sync_independent_order_status');
  expect(sql).toContain('set status = $2');
  expect(sql).toContain("'canonical_order_status'");
  expect(sql).toContain("notify pgrst, 'reload schema'");
  expect(adapter).toContain('function orderLocation(o)');
  expect(adapter).toContain('📍');
  expect(adapter).toContain('حالة الشحنة');
  expect(shell).toContain('v103-location-status-sync');
});

test('V104 lets the owning vendor atomically control shipping per independent order', async () => {
  const [sql, adapter, shell] = await Promise.all([
    read('supabase/migrations/20260905_v104_vendor_order_shipping_control.sql'),
    read('js/vendor-v94-multistore-orders.js'),
    read('vendor-dashboard.html')
  ]);

  expect(sql).toContain('shipping_version bigint not null default 0');
  expect(sql).toContain('private.require_vendor_session(p_session_token)');
  expect(sql).toContain('for update;');
  expect(sql).toContain('ORDER_SHIPPING_VERSION_CONFLICT');
  expect(sql).toContain('SHIPPING_COMPANY_NOT_AVAILABLE');
  expect(sql).toContain("'free_shipping'");
  expect(sql).toContain("'vendor_manual_selection'");
  expect(sql).toContain('shipping_snapshot = $5');
  expect(sql).toContain('update public.order_store_segments');
  expect(adapter).toContain('vendor_get_order_shipping_control');
  expect(adapter).toContain('vendor_update_order_shipping');
  expect(adapter).toContain('vendorFreeShippingChanged');
  expect(adapter).toContain('p_expected_version:Number(panel.dataset.version)');
  expect(shell).toContain('v112-rewards');
});

test('V105 defers shipping to the vendor and keeps every invoice on canonical data', async () => {
  const [sql, adapter, invoice, shell] = await Promise.all([
    read('supabase/migrations/20260905_v105_vendor_assigned_shipping_source.sql'),
    read('js/vendor-v94-multistore-orders.js'),
    read('js/kinto-bundle-ui-v93.js'),
    read('vendor-dashboard.html')
  ]);
  expect(sql).toContain("'vendor_assignment_pending'");
  expect(sql).toContain('new.shipping_company_name := null');
  expect(sql).toContain('new.delivery_fee := 0');
  expect(sql).toContain('vendor_list_order_shipping_controls');
  expect(adapter).toContain('shippingTableControl');
  expect(adapter).toContain('saveVendorTableShipping');
  expect(adapter).toContain('p_segment_ids:ids');
  expect(invoice).toContain('hydrateCanonicalShipping(order)');
  expect(invoice).toContain('بانتظار تحديد التاجر');
  expect(invoice).toContain('t.deliveryCurrency');
  expect(shell).toContain('v112-rewards');
});

test('V112 supports multi-currency rewards and invoice-safe order discounts', async () => {
  const [admin, employee, sharedInvoice, vendorInvoice, rewardUi, migration] = await Promise.all([
    read('admin-dashboard.html'), read('employee-dashboard.html'),
    read('js/kinto-bundle-ui-v93.js'), read('js/vendor-v94-multistore-orders.js'),
    read('js/rewards-loyalty-v112.js'),
    read('supabase/migrations/20260905_v112_multicurrency_rewards_order_discount.sql')
  ]);
  expect(admin).toContain('rewards-loyalty-v112.js?v=20260905-v112');
  expect(employee).toContain('rewards-loyalty-v112.js?v?v=20260905-v112'.replace('?v?v','?v'));
  expect(rewardUi).toContain("const CURRENCIES=['USD','IQD','TRY']");
  expect(rewardUi).toContain("rpc('adjust_customer_reward_balance'");
  expect(rewardUi).toContain("rpc('apply_order_reward_discount'");
  expect(migration).toContain('reward_balances jsonb');
  expect(migration).toContain('create or replace function public.apply_order_reward_discount');
  for (const source of [sharedInvoice, vendorInvoice]) {
    expect(source).toContain('خصم المكافآت / الولاء');
    expect(source).toContain('reward_discount_currency');
    expect(source).toContain('reward-discount');
  }
});

test('V113 matches text order customer ids to UUID customer rows safely', async () => {
  const migration = await read('supabase/migrations/20260905_v113_reward_uuid_text_compat.sql');
  expect(migration).toContain('id::text = v_order.customer_id::text');
  expect(migration).toContain('create or replace function public.apply_order_reward_discount');
  expect(migration).toContain("notify pgrst, 'reload schema'");
});

test('V107 shows one canonical color-coded collection status in every invoice', async () => {
  const [sql, sharedInvoice, vendorInvoice, courier] = await Promise.all([
    read('supabase/migrations/20260905_v107_invoice_collection_status_projection.sql'),
    read('js/kinto-bundle-ui-v93.js'),
    read('js/vendor-v94-multistore-orders.js'),
    read('delivery-dashboard.html')
  ]);

  for (const source of [sharedInvoice, vendorInvoice, courier]) {
    expect(source).toContain('تحصيل كامل عند الاستلام');
    expect(source).toContain('البضاعة مدفوعة');
    expect(source).toContain('مدفوع مقدماً شامل التوصيل');
  }
  expect(sharedInvoice).toContain('delivery_payment_type');
  expect(sharedInvoice).toContain('collection-status ${collection.tone}');
  expect(vendorInvoice).toContain('invoiceCollectionInfo');
  expect(vendorInvoice).toContain('collection-status ${collection.tone}');
  expect(courier).toContain('deliveryCollectionBadge(o)');
  expect(sql).toContain("'delivery_payment_type', o.delivery_payment_type");
  expect(sql).toContain('private.require_vendor_session(p_session_token)');
});

test('V108 renders one compact canonical order timeline in every invoice', async () => {
  const [sharedInvoice, vendorInvoice] = await Promise.all([
    read('js/kinto-bundle-ui-v93.js'),
    read('js/vendor-v94-multistore-orders.js')
  ]);

  for (const source of [sharedInvoice, vendorInvoice]) {
    expect(source).toContain('invoice-track');
    expect(source).toContain('استلام الطلب');
    expect(source).toContain('التجهيز');
    expect(source).toContain('الشحن والتوصيل');
    expect(source).toContain('تم التسليم');
    expect(source).toContain('rejected');
    expect(source).not.toContain('<small>الحالة الحالية:');
  }
  expect(sharedInvoice).toContain('invoiceTimeline(order?.status)');
  expect(vendorInvoice).toContain('vendorInvoiceTimeline(data.status)');
});

test('V111 gives invoice tracking a clean path, stronger gold glow and no duplicate status', async () => {
  const [sharedInvoice, vendorInvoice] = await Promise.all([
    read('js/kinto-bundle-ui-v93.js'),
    read('js/vendor-v94-multistore-orders.js')
  ]);

  for (const source of [sharedInvoice, vendorInvoice]) {
    expect(source).toContain('<svg viewBox="0 0 24 24">');
    expect(source).toContain('M3 6h11v10H3z');
    expect(source).toContain('m9 9 6 6m0-6-6 6');
    expect(source).toContain('track-step:not(:last-of-type)::after');
    expect(source).toContain('@keyframes trackGlow');
    expect(source).toContain('@keyframes trackGoldGlow');
    expect(source).toContain('0 0 18px rgba(212,167,44,1)');
    expect(source).toContain('.track-step::after{display:none!important}');
    expect(source).not.toContain('<small>الحالة الحالية:');
    expect(source).toContain('.date-block>span{display:block}');
    expect(source).toContain('max-width:145px!important');
  }
});

test('V114 supports orders tables without updated_at', async () => {
  const migration = await read('supabase/migrations/20260905_v114_reward_orders_without_updated_at.sql');

  expect(migration).toContain('create or replace function public.apply_order_reward_discount');
  expect(migration).not.toContain('updated_at');
  expect(migration).toContain('reward_discount_snapshot = v_snapshot');
});

test('V115 opens invoices deterministically from customer, employee and admin details', async () => {
  const [hotfix, customer, employee, admin] = await Promise.all([
    read('js/invoice-details-hotfix-v115.js'),
    read('dashboard.html'),
    read('employee-dashboard.html'),
    read('admin-dashboard.html')
  ]);

  expect(hotfix).toContain("wrap('openCustomerOrderDetails'");
  expect(hotfix).toContain("wrap('openOrderDetailsById'");
  expect(hotfix).toContain("wrap('openOrderDetailsModalData'");
  expect(hotfix).toContain('window.KintoBundleV93.enhance');
  for (const page of [customer, employee, admin]) {
    expect(page).toContain('defer src="js/invoice-details-hotfix-v115.js?v=20260905-v116"');
  }
});

test('V117 preserves the invoice action when legacy bundle details are malformed', async () => {
  const invoice = await read('js/kinto-bundle-ui-v93.js');
  expect(invoice).toContain("d.items.filter(x=>x&&typeof x==='object')");
  expect(invoice).toContain("invoice action preserved");
  expect(invoice.indexOf("container.appendChild(actions)")).toBeLessThan(invoice.indexOf("container.insertAdjacentHTML('beforeend',bundleHtml(order))"));
});
