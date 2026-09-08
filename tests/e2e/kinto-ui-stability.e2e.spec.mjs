import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../..');
const dashboards = ['dashboard.html','admin-dashboard.html','employee-dashboard.html','delivery-dashboard.html','branch-dashboard.html','vendor-dashboard.html'];

test('role dashboards load the isolated KINTO stability layer', async () => {
  for (const file of dashboards) {
    const source = await readFile(path.join(root, file), 'utf8');
    expect(source, file).toContain('css/kinto-ui-stability-v123.css');
    expect(source, file).toContain('js/kinto-ui-stability-v123.js');
  }
});

test('stability layer is scoped and preserves business renderers', async () => {
  const css = await readFile(path.join(root, 'css/kinto-ui-stability-v123.css'), 'utf8');
  const js = await readFile(path.join(root, 'js/kinto-ui-stability-v123.js'), 'utf8');
  expect(css).toContain('html.kinto-stability');
  expect(css).toContain('scrollbar-gutter:stable');
  expect(css).toContain('kinto-skeleton-row');
  expect(js).toContain("root.classList.add('kinto-stability')");
  expect(js).toContain('MutationObserver');
  expect(js).not.toMatch(/innerHTML\s*=/);
  expect(js).not.toMatch(/\.from\(['\"]orders['\"]\)/);
});

test('customer polling skips identical Supabase payload renders', async () => {
  const source = await readFile(path.join(root, 'dashboard.html'), 'utf8');
  expect(source).toContain("let customerOrdersRenderSignature=''");
  expect(source).toContain('if(signature===customerOrdersRenderSignature)return');
  expect(source).toContain('customerOrdersRenderSignature=signature');
});
