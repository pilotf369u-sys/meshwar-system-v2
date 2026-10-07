import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('V97 checkout delegates independent order creation to the atomic RPC', async () => {
  const source = await readFile(path.join(root, 'js/local-cart-v93.js'), 'utf8');

  expect(source).toContain("rpc/checkout_independent_vendor_orders");
  expect(source).toContain("p_items:rpcItems");
  expect(source).toContain("version:'v97-independent-orders'");

  const rpcProjection = source.match(/rpcItems=items\.map\(x=>\(\{(.+?)\}\)\),result=/s)?.[1] || '';
  expect(rpcProjection).toContain('store_id');
  expect(rpcProjection).toContain('product_id');
  expect(rpcProjection).toContain('selected_options');
  expect(rpcProjection).toContain('quantity');
  expect(rpcProjection).not.toContain('unit_price_local');
  expect(rpcProjection).not.toContain('pricing_snapshot');
});

test('V97 migration enforces server pricing and one order per store', async () => {
  const sql = await readFile(
    path.join(root, 'supabase/migrations/20260905_v97_independent_vendor_checkout.sql'),
    'utf8'
  );

  expect(sql).toContain('create or replace function public.checkout_independent_vendor_orders');
  expect(sql).toContain('security definer');
  expect(sql).toContain('coalesce(p.discount_price, p.base_price)');
  expect(sql).toContain('for v_store in');
  expect(sql).toContain('insert into public.orders');
  expect(sql).toContain("'checkout_contract', 'independent_vendor_orders'");
  expect(sql).toContain("'multi_store', false");
  expect(sql).toContain("'checkout_group_id', v_checkout_group_id");
  expect(sql).toContain('CHECKOUT_INSUFFICIENT_STOCK');
});
