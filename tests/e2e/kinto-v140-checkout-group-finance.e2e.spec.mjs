import {test,expect} from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=file=>fs.readFile(path.join(root,file),'utf8');

test('V140 stores one additive finance envelope per checkout group',async()=>{
  const sql=await read('supabase/migrations/20260921_v140_checkout_group_finance.sql');
  expect(sql).toContain('checkout_group_id uuid primary key');
  expect(sql).toContain('max(coalesce(o.external_shipping_fee, 0))');
  expect(sql).toContain('CHECKOUT_GROUP_FINANCE_LOCKED');
  expect(sql).toContain('private.v112_require_reward_actor');
  expect(sql).not.toMatch(/update public\.orders/i);
  expect(sql).not.toMatch(/insert into public\.orders/i);
});

test('V140 employee UI groups by server checkout id without merging order rows',async()=>{
  const source=await read('js/checkout-group-finance-v140.js');
  expect(source).toContain("checkout_group_id");
  expect(source).toContain("get_checkout_group_finance");
  expect(source).toContain("save_checkout_group_external_shipping");
  expect(source).toContain('مجموعة شراء');
  expect(source).toContain('فاتورة موحدة');
  expect(source).toContain('يُدار مرة واحدة من رأس مجموعة الشراء');
  expect(source).not.toContain(".update({status");
  expect(source).not.toContain("from('orders').update");
});

test('V140 keeps grouped order details on store-only invoices',async()=>{
  const invoice=await read('js/kinto-bundle-ui-v93.js');
  expect(invoice).toContain("checkout_contract==='independent_vendor_orders'");
  expect(invoice).toContain("grouped?'فاتورة المتجر'");
  expect(invoice).toContain('if(actions&&!grouped)');
});

test('role shell loads grouping only after the existing native renderer',async()=>{
  const shell=await read('external-shipping-shell.html');
  expect(shell).toContain("nativeRender.onload=()=>");
  expect(shell).toContain("checkout-group-finance-v140.js");
  expect(shell.indexOf('nativeRender.onload')).toBeLessThan(shell.indexOf('d.head.appendChild(nativeRender)'));
});
