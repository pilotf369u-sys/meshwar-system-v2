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

test('customer dashboard restores its selected tab before reveal', async () => {
  const html = await readFile(path.join(root, 'dashboard.html'), 'utf8');
  const deeplink = await readFile(path.join(root, 'js/customer-dashboard-deeplink-v158.js'), 'utf8');
  expect(html).toContain('customer-tab-restoring');
  expect(html).toContain('20260920-v133-refresh-position');
  expect(deeplink).toContain("sessionStorage.setItem(tabSessionKey(),tab)");
  expect(deeplink).toContain("url.searchParams.set('tab',tab)");
  expect(deeplink).toContain('finishTabRestore()');
  expect(deeplink).not.toMatch(/\.from\(['\"]orders['\"]\)/);
});

test('customer dashboard leaves to public pages with a refresh-stable route', async () => {
  const html = await readFile(path.join(root, 'dashboard.html'), 'utf8');
  const drawer = await readFile(path.join(root, 'js/customer-navigation-drawer-v156.js'), 'utf8');
  expect(html).toContain('20260920-v134-public-refresh-route');
  expect(drawer).toContain('function leaveDashboard(href)');
  expect(drawer).toContain('location.replace(url.href)');
  for (const href of ['index.html', 'local-stores.html', 'global-stores.html']) {
    expect(drawer).toContain(`href:'${href}',publicRoute:true`);
  }
  expect(drawer).not.toMatch(/\.from\(['\"]orders['\"]\)/);
});

test('customer runs as a top-level page so public refresh cannot restore the orders shell', async () => {
  const dashboard = await readFile(path.join(root, 'dashboard.html'), 'utf8');
  const shell = await readFile(path.join(root, 'external-shipping-shell.html'), 'utf8');
  const login = await readFile(path.join(root, 'login.html'), 'utf8');
  const favorites = await readFile(path.join(root, 'js/customer-favorites-nav-v148.js'), 'utf8');
  const theme = await readFile(path.join(root, 'js/global-theme-toggle-v1.js'), 'utf8');
  expect(login).toContain("if(screen==='customer')");
  expect(login).toContain("return'dashboard.html'");
  expect(shell).toContain("if(screen==='customer'){location.replace(target");
  expect(shell.indexOf("if(screen==='customer'){location.replace(target")).toBeLessThan(shell.indexOf('frame.src=target'));
  for (const asset of ['dashboard-polish-v17.css','customer-landing-responsive-v1.css','customer-kinto-theme-v126.css','public-customer-navigation-v157.css','customer-light-polish-v1.js']) {
    expect(dashboard, asset).toContain(asset);
  }
  for (const source of [dashboard, favorites, theme]) {
    expect(source).not.toContain('kinto_customer_public_refresh_guard');
    expect(source).not.toContain('kinto_customer_public_refresh_route');
  }
});
