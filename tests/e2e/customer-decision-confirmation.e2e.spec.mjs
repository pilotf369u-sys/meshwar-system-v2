import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('customer decision page is appended only to its dedicated invoice window', async () => {
  const source = await readFile(path.join(root, 'dashboard.html'), 'utf8');

  expect(source).toContain("openCustomerDecisionPage(${index},'approve')");
  expect(source).toContain("openCustomerDecisionPage(${index},'cancel')");
  expect(source).toContain('window.KintoBundleV93.printInvoice(o)');
  expect(source).toContain("const printActions=main?.querySelector('.actions')");
  expect(source).toContain('printActions.before(section)');
  expect(source).toContain('section.className=\'customer-decision\'');
  expect(source).toContain('اطمئن، شرائك من منصتنا');
  expect(source).toContain('خصومات ولاء حصرية ومستمرة');
  expect(source).not.toContain('customer-decision-summary');
  expect(source).not.toContain('عنوان التسليم المسجل');
  expect(source).not.toContain('customerDecisionModal');
});

test('decision modal delegates to the existing guarded order mutations', async () => {
  const source = await readFile(path.join(root, 'dashboard.html'), 'utf8');

  expect(source).toContain("if(action==='approve')await approveOrder(i)");
  expect(source).toContain("else if(action==='cancel')await cancelOrder(i,true)");
  expect(source).toContain(".eq('id',o.id).eq('customer_id',currentCustomerCloud.id).eq('status',latest.status)");
});
