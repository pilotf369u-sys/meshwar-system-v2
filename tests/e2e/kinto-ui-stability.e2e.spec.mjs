import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';

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

test('public customer pages survive mobile browser refresh restoration', async () => {
  const dashboard = await readFile(path.join(root, 'dashboard.html'), 'utf8');
  const publicNavigation = await readFile(path.join(root, 'js/customer-favorites-nav-v148.js'), 'utf8');
  const earlyIndexNavigation = await readFile(path.join(root, 'js/global-theme-toggle-v1.js'), 'utf8');
  for (const file of ['index.html', 'local-stores.html', 'global-stores.html']) {
    const source = await readFile(path.join(root, file), 'utf8');
    expect(source, file).toContain('js/customer-favorites-nav-v148.js');
  }
  expect(publicNavigation).toContain("routeKey='kinto_customer_public_refresh_route'");
  expect(publicNavigation).toContain("timeKey='kinto_customer_public_refresh_time'");
  expect(publicNavigation).toContain('sessionStorage.setItem(routeKey');
  expect(publicNavigation).toContain("entry.type==='reload'");
  expect(publicNavigation).toContain("['pointerdown','keydown','submit']");
  expect(earlyIndexNavigation).toContain('function armPublicReloadGuard()');
  expect(dashboard).toContain("sessionStorage.getItem(guardKey)==='1'");
  expect(dashboard).toContain('location.replace(routeUrl.href)');
  expect(dashboard).toContain("document.documentElement.style.visibility='hidden'");
});

test('public reload guard rejects an automatic dashboard jump and yields to real user intent', async () => {
  const publicSource = await readFile(path.join(root, 'js/customer-favorites-nav-v148.js'), 'utf8');
  const dashboard = await readFile(path.join(root, 'dashboard.html'), 'utf8');
  const dashboardGuard = dashboard.match(/<script>(\(function\(\)\{try\{const routeKey=.*?\}\)\(\);)<\/script>/s)?.[1];
  expect(dashboardGuard).toBeTruthy();

  const values = new Map(), listeners = new Map();
  const sessionStorage = { setItem: (key, value) => values.set(key, String(value)), getItem: key => values.get(key) ?? null, removeItem: key => values.delete(key) };
  const publicContext = {
    window: {}, sessionStorage,
    location: { pathname: '/local-stores.html', search: '?country=IQ', hash: '#stores' },
    performance: { getEntriesByType: () => [{ type: 'reload' }] },
    addEventListener: (type, listener) => listeners.set(type, listener),
    document: { readyState: 'loading', addEventListener() {}, querySelector: () => ({}) },
    localStorage: { getItem: () => null }, URLSearchParams
  };
  publicContext.window = publicContext;
  vm.runInNewContext(publicSource, publicContext);
  expect(values.get('kinto_customer_public_refresh_guard')).toBe('1');

  let restored = '';
  const dashboardContext = {
    sessionStorage, URL,
    location: { href: 'https://example.test/dashboard.html?customerId=1', replace: value => { restored = value; } },
    document: { documentElement: { style: {} } }, Date
  };
  vm.runInNewContext(dashboardGuard, dashboardContext);
  expect(restored).toBe('https://example.test/local-stores.html?country=IQ#stores');

  values.clear(); listeners.clear(); restored = '';
  delete publicContext.__kintoPublicReloadGuardArmed;
  vm.runInNewContext(publicSource, publicContext);
  listeners.get('pointerdown')?.();
  vm.runInNewContext(dashboardGuard, dashboardContext);
  expect(restored).toBe('');
});
