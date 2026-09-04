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
  const [sql, compatSql, cart, invoice, vendorInvoice] = await Promise.all([
    read('supabase/migrations/20260905_v98_vendor_shipping_settings.sql'),
    read('supabase/migrations/20260905_v98_shipping_details_type_compat.sql'),
    read('js/local-cart-v93.js'),
    read('js/kinto-bundle-ui-v93.js'),
    read('js/vendor-v94-multistore-orders.js')
  ]);

  expect(sql).toContain("'checkout_contract', '') <> 'independent_vendor_orders'");
  expect(sql).toContain('private.v94_jsonb_object(to_jsonb(new.details))');
  expect(sql).not.toContain('private.v94_jsonb_object(new.details)');
  expect(sql).toContain('))::text;');
  expect(compatSql).toContain('private.v94_jsonb_object(to_jsonb(new.details))');
  expect(compatSql).not.toContain('private.v94_jsonb_object(new.details)');
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
