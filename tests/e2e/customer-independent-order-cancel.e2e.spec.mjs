import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');

test('each independent pre-payment order exposes its own cancel action', async () => {
  const source = await readFile(path.join(root, 'dashboard.html'), 'utf8');

  expect(source).toContain("'بانتظار رد الموظف'");
  expect(source).toContain("function canCustomerCancelStatus(s){const v=String(s||'').trim();return Boolean(v)&&!CUSTOMER_CANCEL_BLOCKED.includes(v);}");
  expect(source).toContain(".eq('id',o.id).eq('customer_id',currentCustomerCloud.id).eq('status',latest.status)");

  const blocked = source.match(/const CUSTOMER_CANCEL_BLOCKED=\[(.*?)\];/s)?.[1] || '';
  expect(blocked).toContain("'تم التسديد'");
  expect(blocked).toContain("'قيد الطلب'");
  expect(blocked).not.toContain("'بانتظار رد الموظف'");
});
