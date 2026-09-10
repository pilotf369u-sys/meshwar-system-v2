import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = file => readFile(path.join(root, file), 'utf8');

test('customer cart keeps local fallback and synchronizes through account RPCs', async () => {
  const source = await read('js/local-cart-v93.js');
  expect(source).toContain("rpc/customer_cart_get_v130");
  expect(source).toContain("rpc/customer_cart_put_v130");
  expect(source).toContain('mergeCartItems(remote,state)');
  expect(source).toContain('localStorage.removeItem(guestKey)');
  expect(source).toContain("version:'v130-cloud-cart'");
});

test('cloud cart migration is account-scoped and blocks direct table access', async () => {
  const sql = await read('supabase/migrations/20260910_v130_customer_cloud_cart.sql');
  expect(sql).toContain('customer_id uuid primary key references public.customers(id)');
  expect(sql).toContain('alter table public.customer_local_carts enable row level security');
  expect(sql).toContain('revoke all on public.customer_local_carts from anon, authenticated');
  expect(sql).toContain('customer_cart_get_v130');
  expect(sql).toContain('customer_cart_put_v130');
});
