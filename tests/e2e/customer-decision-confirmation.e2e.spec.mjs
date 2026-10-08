import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('customer decision page is appended only to its dedicated invoice window', async () => {
  const source = await readFile(path.join(root, 'dashboard.html'), 'utf8');

  expect(source).toContain("openCustomerDecisionPage(${index},'approve')");
  expect(source).toContain("openCustomerDecisionPage(${index},'cancel')");
  expect(source).toContain('window.KintoBundleV93.printInvoice(o,{invoiceWindow:existingPage,canonicalOnly:canonical,prepareOrder:');
  expect(source).toContain('await reconcileCustomerInvoiceV58(o)');
  expect(source).toContain('_invoicePreparationErrorV59');
  expect(source).toContain("const printActions=main?.querySelector('.actions')");
  expect(source).toContain('printActions.before(section)');
  expect(source).toContain('section.className=\'customer-decision\'');
  expect(source).toContain('customer-decision-stock-alert');
  expect(source).toContain('طلبت ${issue.requested}، المتاح الآن ${issue.available}');
  expect(source).not.toContain('openCustomerDecisionSupport');
  expect(source).not.toContain('openCustomerDecisionTerms');
  expect(source).not.toContain('تحتاج مساعدة؟ تواصل مع الدعم');
  expect(source).not.toContain('اطمئن، شرائك من منصتنا');
  expect(source).toContain('customer-decision-shipping');
  expect(source).toContain('يُحدَّد بعد اعتماد الطلب');
  expect(source).toContain('openCustomerDeliveredInvoice(${index})');
  expect(source).toContain('تأكيد استلام الطلب');
  expect(source).toContain('customer_confirm_order_receipt_v60');
  expect(source).toContain('قيّم المنتجات');
  expect(source).not.toContain('customer-decision-summary');
  expect(source).not.toContain('عنوان التسليم المسجل');
  expect(source).not.toContain('customerDecisionModal');
});

test('decision modal delegates to the existing guarded order mutations', async () => {
  const source = await readFile(path.join(root, 'dashboard.html'), 'utf8');

  expect(source).toContain("if(action==='approve'){if(await approveOrder(index,page))page?.close()}");
  expect(source).toContain("else if(action==='cancel'){await cancelOrder(index,true);page?.close()}");
  expect(source).toContain(".eq('id',o.id).eq('customer_id',currentCustomerCloud.id).eq('status',latest.status)");
});
