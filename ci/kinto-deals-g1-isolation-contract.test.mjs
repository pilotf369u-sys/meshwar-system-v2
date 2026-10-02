import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const sql=readFileSync(new URL('../supabase/migrations/20261002_kinto_deals_v1_g1_isolated_off.sql',import.meta.url),'utf8');
test('G1 defaults OFF and cannot flip existing OFF state on reinsert',()=>{
  assert.match(sql,/enabled boolean not null default false/);
  assert.match(sql,/values \('merchant_deals_enabled', false\)\s*on conflict \(key\) do nothing/);
});
test('G1 owns only its own schema and installs no hooks on legacy objects',()=>{
  const tableTargets=[...sql.matchAll(/(?:create table if not exists|alter table)\s+public\.([\w]+)/gi)].map(x=>x[1]);
  assert.ok(tableTargets.length>=10);
  assert.ok(tableTargets.every(x=>x.startsWith('kinto_deals_v1_')),tableTargets.join(','));
  assert.doesNotMatch(sql,/(?:create|drop) trigger\s+[^;]+\s+on public\.(?:orders|local_products|local_stores)/i);
  assert.doesNotMatch(sql,/create or replace function public\.checkout_independent_vendor_orders/i);
});
test('all new tables have RLS, revoke browser access and no permissive policies',()=>{
  for(const table of ['flags','campaigns','products','submissions','redemptions']){
    assert.match(sql,new RegExp('alter table public\\.kinto_deals_v1_'+table+' enable row level security'));
    assert.match(sql,new RegExp('public\\.kinto_deals_v1_'+table));
  }
  assert.match(sql,/from public, anon, authenticated/);
  assert.doesNotMatch(sql,/create policy|grant (select|insert|update|delete|execute)/i);
});
test('cross-store gifts and eligible products are rejected, owner immutable',()=>{
  assert.match(sql,/DEALS_GIFT_MUST_BELONG_TO_STORE/);
  assert.match(sql,/DEALS_PRODUCT_MUST_BELONG_TO_CAMPAIGN_STORE/);
  assert.match(sql,/DEALS_STORE_IMMUTABLE/);
  assert.match(sql,/p\.store_id = new\.store_id/);
  assert.match(sql,/p\.store_id = c\.store_id/);
});
test('redemption ledger is reserved but no checkout or order hook exists',()=>{
  assert.match(sql,/unique \(campaign_id,order_id\)/);
  assert.match(sql,/customer_id uuid not null references public\.customers/);
  assert.doesNotMatch(sql,/create trigger[^;]*on public\.orders/i);
});

test('submissions and reserved redemptions cannot spoof store or customer-order pairing',()=>{
  assert.match(sql,/DEALS_RELATED_STORE_MISMATCH/);
  assert.match(sql,/DEALS_REDEMPTION_CUSTOMER_ORDER_MISMATCH/);
  assert.match(sql,/DEALS_REDEMPTION_GIFT_STORE_MISMATCH/);
  assert.match(sql,/o\.id = new\.order_id and o\.customer_id = new\.customer_id/);
  assert.match(sql,/trg_kinto_deals_v1_submission_store/);
  assert.match(sql,/trg_kinto_deals_v1_redemption_store/);
});
