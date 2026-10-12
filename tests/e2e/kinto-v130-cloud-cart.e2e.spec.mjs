import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const read = file => readFile(path.join(root, file), 'utf8');

test('customer cart uses cloud-only account RPCs', async () => {
  const source = await read('js/local-cart-v93.js');
  expect(source).toContain("rpc/customer_cart_get_v189");
  expect(source).toContain("rpc/customer_cart_put_v189");
  expect(source).not.toContain('mergeCartItems(remote,state)');
  expect(source).toContain('CART_REVISION_CONFLICT');
  expect(source).toContain('if(!cloudDirty)return renderConfirmedView()');
  expect(source).toContain('finally{state=pending}');
  expect(source).toContain("version:'v189-cloud-only'");
});

test('cloud cart migration is account-scoped and blocks direct table access', async () => {
  const sql = await read('supabase/migrations/20260910_v130_customer_cloud_cart.sql');
  expect(sql).toContain('customer_id uuid primary key references public.customers(id)');
  expect(sql).toContain('alter table public.customer_local_carts enable row level security');
  expect(sql).toContain('revoke all on public.customer_local_carts from anon, authenticated');
  expect(sql).toContain('customer_cart_get_v130');
  expect(sql).toContain('customer_cart_put_v130');
});


test('V189 revision migration is additive and rejects stale writers', async () => {
  const sql = await read('supabase/migrations/20261012_kinto_cart_revision_v189.sql');
  expect(sql).toContain('add column if not exists revision_v189');
  expect(sql).toContain('p_expected_revision');
  expect(sql).toContain('CART_REVISION_CONFLICT');
  expect(sql).toContain('kinto_cart_revision_legacy_guard_v189');
  expect(sql).toContain('pg_advisory_xact_lock');
  expect(sql).toContain('revoke execute on function public.customer_cart_get_v130(uuid)');
  expect(sql).toContain('revoke execute on function public.customer_cart_put_v130(uuid, jsonb)');
  expect(sql).not.toMatch(/delete\\s+from\\s+public\\.customer_local_carts/i);
});


test('V189 checkout cleans cloud cart only after confirmed independent orders', async () => {
  const source = await read('js/local-cart-v93.js');
  expect(source).toContain('async function removeSubmitted(keys)');
  expect(source).toContain('await removeSubmitted(submittedKeys)');
  expect(source).toContain("rpc/checkout_independent_vendor_orders_v161");
  expect(source).toContain('p_expected_revision:Number(remote.revision)');
  expect(source).toContain('cloudConflict=true;cloudDirty=false');
  expect(source).not.toContain('localStorage.setItem(scope.key');
  expect(source).not.toContain('state=read(scope.key)');
});


test('V189 verifies cart owner session', async () => {
 const sql=await read('supabase/migrations/20261012_kinto_cart_revision_v189.sql');
 const source=await read('js/local-cart-v93.js');
 expect(sql).toContain('private.require_customer_review_session(p_session_token)');
 expect(sql).toContain('CART_SESSION_FORBIDDEN');
 expect(source).toContain('p_session_token:cloudSessionToken()');
});
