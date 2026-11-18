import { test, expect } from '@playwright/test';

test.use({
  video: 'off',
  launchOptions: { executablePath: process.env.KINTO_TEST_CHROMIUM || undefined },
});

const storeId = '11111111-1111-4111-8111-111111111111';
const campaignId = '22222222-2222-4222-8222-222222222222';
const options = { color: 'blue', size: 'small', volume: 'solid' };
const products = [
  { id: '33333333-3333-4333-8333-333333333333', name: 'Primary product', price: 3000 },
  { id: '44444444-4444-4444-8444-444444444444', name: 'Second product', price: 3000 },
];

async function openCampaign(page, { kind, threshold, mode, available = true, loseReserveResponse = false }) {
  const calls = [];
  const campaign = {
    title: 'Campaign fixture', campaign_id: campaignId, store_id: storeId,
    starts_at: '2020-01-01', ends_at: '2099-01-01', kind, threshold_units: threshold,
    max_uses_per_customer: 5, max_units_per_customer: 2, products,
  };
  let reserveCount = 0;

  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    const name = url.pathname.split('/').at(-1);
    if (url.hostname === '127.0.0.1') {
      if (name === 'store.html') {
        return route.fulfill({ contentType: 'text/html', body:
          '<meta charset="utf-8"><link rel="stylesheet" href="/css/kinto-payment-p5.css"><main class="store-hero"></main>' +
          '<div id="localStoreProductsPanel"></div><script src="/js/customer-payment-p5.js"></script>' +
          '<script src="/js/kinto-deals-customer-g7.js"></script>',
        });
      }
      return route.continue();
    }
    const json = (value, status = 200) => route.fulfill({
      status, json: value, headers: { 'access-control-allow-origin': '*' },
    });
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: {
        'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, GET',
        'access-control-allow-headers': 'content-type, authorization, apikey',
      } });
    }
    switch (name) {
      case 'kinto_local_stores_public_v1':
      case 'local_products': return json([], 404);
      case 'kinto_deals_v1_public_feed_g7': return json([campaign]);
      case 'kinto_deals_v1_public_detail_g14': return json(campaign);
      case 'kinto_deals_v1_public_fixed_options_g20': return json({ [products[0].id]: options });
      case 'kinto_deals_v1_direct_order_g20':
        calls.push({ action: 'manual', ...route.request().postDataJSON() });
        return json({ campaign_order_code: 'KN-FIXTURE' });
      case 'kinto-payment-p5': {
        const body = route.request().postDataJSON();
        calls.push(body);
        const reply = data => json({ ok: true, data });
        switch (body.action) {
          case 'mode': return reply({ effective_mode: mode, transition_state: 'stable', checkout_available: available });
          case 'campaign_reserve': {
            reserveCount += 1;
            if (loseReserveResponse && reserveCount === 1) return route.abort();
            const lines = body.items.map(item => ({
              ...item, currency: 'IQD', unit_price_local: 3000, line_total_local: item.quantity * 3000,
            }));
            return reply({ attempt_id: 'attempt', kp_number: 'KP-FIXTURE', status: 'reserved',
              quote: { lines, amount: lines.reduce((total, line) => total + line.line_total_local, 0), currency: 'IQD' } });
          }
          case 'start': return reply({ status: 'pending' });
          case 'pay': return reply({ status: 'paid', kp_number: 'KP-FIXTURE', real_collection_allowed: false });
          default: return json({ ok: false, error: 'Unexpected action' }, 400);
        }
      }
      default: return route.abort();
    }
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('kinto_customer_review_session_v132', JSON.stringify({
      token: 'fixture-session', expiresAt: '2099-01-01',
    }));
    window.KintoCustomerSessionV150 = { read: () => ({ token: 'fixture-session' }) };
  });
  await page.goto('/store.html?storeId=' + storeId);
  return calls;
}

async function select(page, kind) {
  await page.getByRole('button', { name: 'تفاصيل حملة Campaign fixture' }).click();
  const picks = page.getByRole('button', { name: 'اختيار', exact: true });
  await picks.first().click();
  if (kind === 'choose_n') await picks.first().click();
  const confirm = page.getByRole('button', { name: 'اطلب العرض الآن' });
  await expect(confirm).toBeEnabled();
  await confirm.evaluate(button => {
    button.click();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

for (const mode of ['manual', 'electronic']) {
  for (const [kind, threshold] of [['choose_n', 2], ['buy_n', 1], ['buy_n', 3], ['limited_purchase', null]]) {
    test(`${kind}, ${mode}, threshold ${threshold}`, async ({ page }) => {
      const calls = await openCampaign(page, { kind, threshold, mode });
      await select(page, kind);
      const quantity = kind === 'buy_n' ? threshold : 1;
      if (mode === 'manual') {
        await expect(page.getByRole('button', { name: '✓ تم إنشاء KN-FIXTURE' })).toBeVisible();
        expect(calls.map(call => call.action)).toEqual(['mode', 'manual']);
        expect(calls[1].p_items[0]).toMatchObject({ quantity, selected_options: options });
      } else {
        await page.getByRole('button', { name: 'متابعة الدفع التجريبي' }).click();
        await page.getByRole('button', { name: 'تأكيد الدفع التجريبي' }).click();
        await expect(page.getByText('تم التسديد تجريبياً')).toBeVisible();
        expect(calls.map(call => call.action)).toEqual(['mode', 'campaign_reserve', 'start', 'pay']);
        expect(calls[1].items[0]).toMatchObject({ quantity, selected_options: options });
        expect(calls[1].coupon_points).toBeUndefined();
      }
      expect((calls[1].items || calls[1].p_items)).toHaveLength(kind === 'choose_n' ? 2 : 1);
    });
  }
}

test('unavailable electronic mode fails closed', async ({ page }) => {
  const calls = await openCampaign(page, { kind: 'buy_n', threshold: 3, mode: 'electronic', available: false });
  const alert = page.waitForEvent('dialog').then(async dialog => {
    expect(dialog.message()).toContain('الدفع غير متاح حالياً');
    await dialog.accept();
  });
  await select(page, 'buy_n');
  await alert;
  expect(calls.map(call => call.action)).toEqual(['mode']);
});

test('a lost campaign reservation response reuses the request key after reopening', async ({ page }) => {
  const calls = await openCampaign(page, { kind: 'buy_n', threshold: 3, mode: 'electronic', loseReserveResponse: true });
  await select(page, 'buy_n');
  await expect(page.getByText('تعذرت مراجعة الطلب')).toBeVisible();
  await page.getByLabel('إغلاق', { exact: true }).click();
  await select(page, 'buy_n');
  await expect(page.getByRole('button', { name: 'متابعة الدفع التجريبي' })).toBeVisible();
  const reservations = calls.filter(call => call.action === 'campaign_reserve');
  expect(reservations).toHaveLength(2);
  expect(reservations[1].idempotency_key).toBe(reservations[0].idempotency_key);
});
