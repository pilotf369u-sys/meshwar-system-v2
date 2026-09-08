import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('customer decision confirmation is isolated from invoice templates', async () => {
  const source = await readFile(path.join(root, 'dashboard.html'), 'utf8');
  const scopedStyle = source.match(/<style id="customer-decision-confirm-v119">([\s\S]*?)<\/style>/)?.[1] || '';
  const modal = source.match(/<div id="customerDecisionModal"([\s\S]*?)<script>/)?.[1] || '';

  expect(source).toContain("openCustomerDecisionModal(${index},'approve')");
  expect(source).toContain("openCustomerDecisionModal(${index},'cancel')");
  expect(source).toContain('class="modal-overlay customer-decision"');
  expect(scopedStyle).toContain('.customer-decision .customer-decision-card');
  expect(modal).toContain('اطمئن، شرائك من منصتنا');
  expect(modal).toContain('خصومات ولاء حصرية ومستمرة');
  expect(modal).toContain('عنوان التسليم المسجل');
  expect(modal).not.toMatch(/زر الدعم|اتصل بالدعم|تواصل مع الدعم/);

  expect(source).not.toContain('customer-decision-confirm-v119.js');
});

test('decision modal delegates to the existing guarded order mutations', async () => {
  const source = await readFile(path.join(root, 'dashboard.html'), 'utf8');

  expect(source).toContain('await approveOrder(i)');
  expect(source).toContain('await cancelOrder(i,true)');
  expect(source).toContain(".eq('id',o.id).eq('customer_id',currentCustomerCloud.id).eq('status',latest.status)");
  expect(source).toContain("document.addEventListener('keydown'");
});
