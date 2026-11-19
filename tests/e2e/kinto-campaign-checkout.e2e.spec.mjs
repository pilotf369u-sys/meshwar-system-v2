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

async function openCampaign(page, { kind, threshold, mode, available = true, loseReserveResponse = false, losePayResponse = false, recoveredStatus = null, modeAfterPay = mode, payConflict = false, startConflict = false, paymentExpiresAt = '2099-01-01', statusGate }) {
  const calls = [];
  const campaign = {
    title: 'Campaign fixture', campaign_id: campaignId, store_id: storeId,
    starts_at: '2020-01-01', ends_at: '2099-01-01', kind, threshold_units: threshold,
    max_uses_per_customer: 5, max_units_per_customer: 2, products,
  };
  let reserveCount = 0;
  let paid = false;
  let payCount = 0;
  let startCount = 0;

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
      case 'customer_session_identity_v150':
        return json({ok: true, customer: {id: route.request().postDataJSON().p_session_token === 'other-session' ? 'other' : 'original'}});
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
          case 'mode': return reply({ effective_mode: paid ? modeAfterPay : mode, transition_state: 'stable', checkout_available: available });
          case 'campaign_reserve': {
            reserveCount += 1;
            if (loseReserveResponse && reserveCount === 1) return route.abort();
            const lines = body.items.map(item => ({
              ...item, currency: 'IQD', unit_price_local: 3000, line_total_local: item.quantity * 3000,
            }));
            return reply({ attempt_id: 'attempt', kp_number: 'KP-FIXTURE', status: 'reserved',
              quote: { lines, amount: lines.reduce((total, line) => total + line.line_total_local, 0), currency: 'IQD' } });
          }
          case 'start':
            startCount += 1;
            if (startConflict && startCount === 1) return json({ok:false,error:'temporary start conflict',code:'55P03'},409);
            return reply({ status: 'pending' });
          case 'status':
            await statusGate;
            return reply({status: recoveredStatus || (startConflict && startCount === 1 ? 'reserved' : (paid ? 'paid' : 'pending')), kp_number: 'KP-FIXTURE',
              expires_at: paymentExpiresAt === null ? undefined : paymentExpiresAt});
          case 'simulate': return reply({status:body.scenario==='cancel'?'cancelled':'failed',kp_number:'KP-FIXTURE'});
          case 'pay':
            payCount += 1;
            if (payConflict && payCount === 1) return json({ok:false,error:'temporary conflict',code:'55P03'},409);
            if (losePayResponse === 'unknown') return route.abort();
            paid = true;
            if (losePayResponse) return route.abort();
            return reply({ status: 'paid', kp_number: 'KP-FIXTURE', real_collection_allowed: false });
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
    window.KintoCustomerSessionV150 = { read: () => JSON.parse(sessionStorage.getItem('kinto_customer_review_session_v132') || 'null') };
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


test('reopening after lost payment response reads the existing attempt without reserving or paying again', async ({ page }) => {
  const calls = await openCampaign(page, { kind: 'buy_n', threshold: 3, mode: 'electronic', losePayResponse: true, modeAfterPay: 'manual' });
  await select(page, 'buy_n');
  await page.getByRole('button', {name: 'متابعة الدفع التجريبي'}).click();
  await page.getByRole('button', {name: 'تأكيد الدفع التجريبي'}).click();
  await expect(page.getByText(/تعذر استلام الرد/)).toBeVisible();
  await page.getByLabel('إغلاق', {exact: true}).click();
  await select(page, 'buy_n');
  await expect(page.getByText('تم التسديد تجريبياً')).toBeVisible();
  expect(calls.filter(call => ['campaign_reserve','pay','status'].includes(call.action)).map(call => call.action))
    .toEqual(['campaign_reserve','pay','status']);
});

for (const [status, title] of [['expired','لم يُعتمد الطلب'], ['reconciliation_required','الدفع قيد المطابقة']]) {
  test('reopening a '+status+' attempt never creates a new reservation', async ({page}) => {
    const calls = await openCampaign(page,{kind:'buy_n',threshold:3,mode:'electronic',recoveredStatus:status});
    await select(page,'buy_n');
    await expect(page.getByRole('button',{name:'متابعة الدفع التجريبي'})).toBeVisible();
    await page.getByLabel('إغلاق',{exact:true}).click();
    await select(page,'buy_n');
    await expect(page.getByText(title,{exact:true})).toBeVisible();
    expect(calls.filter(call=>call.action==='campaign_reserve')).toHaveLength(1);
    expect(calls.at(-1).action).toBe('status');
  });
}

test('switching the session during checkout blocks payment and reopening as another customer', async ({ page }) => {
  const calls = await openCampaign(page, { kind: 'buy_n', threshold: 3, mode: 'electronic' });
  await select(page, 'buy_n');
  await page.getByRole('button', {name: 'متابعة الدفع التجريبي'}).click();
  await expect(page.getByRole('button', {name: 'تأكيد الدفع التجريبي'})).toBeVisible();
  await page.evaluate(()=>sessionStorage.setItem('kinto_customer_review_session_v132',JSON.stringify({
    token:'other-session',expiresAt:'2099-01-01'
  })));
  await page.getByRole('button', {name: 'تأكيد الدفع التجريبي'}).click();
  await expect(page.getByText(/تعذر استلام الرد/)).toBeVisible();
  await page.getByLabel('إغلاق',{exact:true}).click();
  await select(page,'buy_n');
  await expect(page.getByText(/مرتبطة بحساب آخر/)).toBeVisible();
  expect(calls.filter(call=>call.action==='campaign_reserve')).toHaveLength(1);
  expect(calls.some(call=>call.action==='pay'||call.action==='status')).toBe(false);
});


test('an expired session blocks payment without clearing the saved attempt', async ({page}) => {
  const calls = await openCampaign(page,{kind:'buy_n',threshold:3,mode:'electronic'});
  await select(page,'buy_n');
  await page.getByRole('button',{name:'متابعة الدفع التجريبي'}).click();
  await expect(page.getByRole('button',{name:'تأكيد الدفع التجريبي'})).toBeVisible();
  await page.evaluate(()=>sessionStorage.removeItem('kinto_customer_review_session_v132'));
  await page.getByRole('button',{name:'تأكيد الدفع التجريبي'}).click();
  await expect(page.getByText(/تعذر استلام الرد/)).toBeVisible();
  expect(calls.some(call=>call.action==='pay')).toBe(false);
  expect(await page.evaluate(()=>Object.keys(sessionStorage).some(key=>key.startsWith('kinto-p5-campaign:')))).toBe(true);
});


for (const [kind, threshold] of [['choose_n', 2], ['buy_n', 3], ['limited_purchase', null]]) {
  test(kind+' resumes the same attempt after a temporary P4 lock', async ({page}) => {
    const calls = await openCampaign(page,{kind,threshold,mode:'electronic',payConflict:true});
    await select(page,kind);
    await page.getByRole('button',{name:'متابعة الدفع التجريبي'}).click();
    const payButton = page.getByRole('button',{name:'تأكيد الدفع التجريبي'});
    await payButton.click();
    await expect(payButton).toBeVisible({timeout:4000});
    expect(calls.filter(x=>x.action==='pay')).toHaveLength(1);
    await payButton.dblclick();
    await expect(page.getByText('تم التسديد تجريبياً')).toBeVisible();
    expect(calls.filter(x=>x.action==='campaign_reserve')).toHaveLength(1);
    expect(calls.filter(x=>x.action==='pay').map(x=>x.attempt_id)).toEqual(['attempt','attempt']);
  });
}

for (const [button, result] of [['اختبار الرفض','مرفوضة'], ['إلغاء الدفع','ملغاة']]) {
  test('campaign '+result+' shows a terminal result without a new payment', async ({page}) => {
    const calls = await openCampaign(page,{kind:'buy_n',threshold:3,mode:'electronic'});
    await select(page,'buy_n');
    await page.getByRole('button',{name:'متابعة الدفع التجريبي'}).click();
    await page.getByRole('button',{name:button}).click();
    await expect(page.getByText('لم يُعتمد الطلب')).toBeVisible();
    await expect(page.getByText(new RegExp(result))).toBeVisible();
    expect(calls.filter(x=>x.action==='pay')).toHaveLength(0);
    expect(calls.filter(x=>x.action==='simulate')).toHaveLength(1);
  });
}

test('temporary conflict after the hold deadline does not offer payment again', async ({page}) => {
  const calls = await openCampaign(page,{kind:'buy_n',threshold:3,mode:'electronic',payConflict:true,paymentExpiresAt:'2000-01-01'});
  await select(page,'buy_n');
  await page.getByRole('button',{name:'متابعة الدفع التجريبي'}).click();
  const payButton = page.getByRole('button',{name:'تأكيد الدفع التجريبي'});
  await payButton.click();
  await expect(page.getByText(/انتهت مهلة الحجز/)).toBeVisible();
  await expect(payButton).toHaveCount(0);
  expect(calls.filter(x=>x.action==='pay')).toHaveLength(1);
});


async function reopenAfterConfirmationError(page, kind, reload) {
  await select(page, kind);
  await page.getByRole('button', { name: 'متابعة الدفع التجريبي' }).click();
  await page.getByRole('button', { name: 'تأكيد الدفع التجريبي' }).click();
  await expect(page.getByText(/تعذر استلام الرد/)).toBeVisible();
  if (reload) await page.reload();
  else await page.getByLabel('إغلاق', { exact: true }).click();
  await select(page, kind);
}

for (const [kind, threshold] of [['choose_n', 2], ['buy_n', 3], ['limited_purchase', null]]) {
  for (const reload of [true, false]) {
    test(`${kind} ${reload ? 'reload' : 'reopen'} checks the saved attempt before offering one retry`, async ({ page }) => {
      let releaseStatus;
      const statusGate = new Promise(resolve => { releaseStatus = resolve; });
      const calls = await openCampaign(page, { kind, threshold, mode: 'electronic', payConflict: true, statusGate });
      const confirm = page.getByRole('button', { name: 'تأكيد الدفع التجريبي' });
      try {
        await reopenAfterConfirmationError(page, kind, reload);
        await expect.poll(() => calls.filter(call => call.action === 'status').map(call => call.attempt_id))
          .toEqual(['attempt']);
        await expect(confirm).toBeHidden();
        expect(calls.filter(call => call.action === 'pay')).toHaveLength(1);
      } finally {
        releaseStatus();
      }
      await expect(confirm).toBeVisible();
      expect(calls.filter(call => call.action === 'pay')).toHaveLength(1);
      await confirm.dblclick();
      await expect(page.getByText('تم التسديد تجريبياً')).toBeVisible();
      expect(calls.filter(call => call.action === 'campaign_reserve')).toHaveLength(1);
      expect(calls.filter(call => call.action === 'start')).toHaveLength(1);
      expect(calls.filter(call => call.action === 'pay').map(call => call.attempt_id)).toEqual(['attempt', 'attempt']);
    });
  }

  for (const [reason, fixture] of [
    ['missing expiry', { payConflict: true, paymentExpiresAt: null }],
    ['unrecognized expiry', { payConflict: true, paymentExpiresAt: 'unknown' }],
    ['lost payment response with a still-pending status', { losePayResponse: 'unknown' }],
    ['unknown outcome requiring reconciliation', { losePayResponse: 'unknown', recoveredStatus: 'reconciliation_required' }],
  ]) {
    test(`${kind} reload does not offer payment after ${reason}`, async ({ page }) => {
      const calls = await openCampaign(page, { kind, threshold, mode: 'electronic', ...fixture });
      await reopenAfterConfirmationError(page, kind, true);
      const heading = fixture.recoveredStatus ? 'الدفع قيد المطابقة' : 'جارٍ التحقق';
      await expect(page.getByText(heading, { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'التحقق مجدداً' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'تأكيد الدفع التجريبي' })).toBeHidden();
      expect(calls.filter(call => call.action === 'status').map(call => call.attempt_id)).toEqual(['attempt']);
      expect(calls.filter(call => call.action === 'campaign_reserve')).toHaveLength(1);
      expect(calls.filter(call => call.action === 'start')).toHaveLength(1);
      expect(calls.filter(call => call.action === 'pay').map(call => call.attempt_id)).toEqual(['attempt']);
    });
  }
}

for (const kind of ['choose_n','buy_n','limited_purchase']) {
 test(kind+' retries failed start only after server confirms the same reserved attempt', async ({page})=>{
  const calls=await openCampaign(page,{kind,threshold:kind==='choose_n'?2:3,mode:'electronic',startConflict:true});
  await select(page,kind);
  await page.getByRole('button',{name:'متابعة الدفع التجريبي'}).click();
  await expect(page.getByText(/رمز التشخيص: 55P03/)).toBeVisible();
  await expect(page.getByRole('button',{name:'إعادة محاولة البدء'})).toBeVisible();
  expect(calls.filter(x=>x.action==='status').map(x=>x.attempt_id)).toEqual(['attempt']);
  await page.getByRole('button',{name:'إعادة محاولة البدء'}).click();
  await expect(page.getByRole('button',{name:'تأكيد الدفع التجريبي'})).toBeVisible();
  expect(calls.filter(x=>x.action==='campaign_reserve')).toHaveLength(1);
  expect(calls.filter(x=>x.action==='start').map(x=>x.attempt_id)).toEqual(['attempt','attempt']);
 });
 test(kind+' blocks start retry when the hold deadline is absent',async ({page})=>{
  const calls=await openCampaign(page,{kind,threshold:kind==='choose_n'?2:3,mode:'electronic',startConflict:true,paymentExpiresAt:null});
  await select(page,kind);
  await page.getByRole('button',{name:'متابعة الدفع التجريبي'}).click();
  await expect(page.getByText(/مهلة الحجز غير صالحة أو انتهت/)).toBeVisible();
  await expect(page.getByRole('button',{name:'إعادة محاولة البدء'})).toHaveCount(0);
  expect(calls.filter(x=>x.action==='start')).toHaveLength(1);
 });
}

for(const kind of ['choose_n','buy_n','limited_purchase']) {
 test(kind+' permits fresh reservation only after server confirms prior attempt expired',async ({page})=>{
  const calls=await openCampaign(page,{kind,threshold:kind==='choose_n'?2:3,mode:'electronic',startConflict:true,recoveredStatus:'expired'});
  await select(page,kind);
  await page.getByRole('button',{name:'متابعة الدفع التجريبي'}).click();
  await expect(page.getByRole('button',{name:'محاولة جديدة للحملة'})).toBeVisible();
  expect(calls.filter(x=>x.action==='campaign_reserve')).toHaveLength(1);
  await page.getByRole('button',{name:'محاولة جديدة للحملة'}).click();
  await expect(page.getByRole('button',{name:'متابعة الدفع التجريبي'})).toBeVisible();
  expect(calls.filter(x=>x.action==='campaign_reserve')).toHaveLength(2);
  expect(calls.filter(x=>x.action==='pay')).toHaveLength(0);
 });
}
