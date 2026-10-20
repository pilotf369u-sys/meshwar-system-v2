const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const vendorHtml = fs.readFileSync(path.join(root, 'vendor-dashboard-v2.html'), 'utf8');

function extract(startMarker, endMarker) {
  const start = vendorHtml.indexOf(startMarker);
  const end = vendorHtml.indexOf(endMarker, start);
  assert(start >= 0 && end > start, `could not locate ${startMarker}`);
  return vendorHtml.slice(start, end);
}

let selectedColumns = '';
let routedInvoice = null;
const notices = [];
const vendorOrder = {
  id: 'kn-1',
  order_code: 'KN-000123',
  reference_order_no: 'REF-123',
  total_price: 217000,
  currency: 'IQD',
  status: 'تم التسديد',
  created_at: '2026-10-20T00:00:00Z',
  details: {
    source: 'local_store',
    store_id: 'store-1',
    store_name: 'KINTO',
    product_id: 'product-1',
    product_name: 'منتج اختبار',
    quantity: 1,
    unit_price_local: 218000,
    line_total_local: 218000,
    items: [{
      product_id: 'product-1',
      product_name: 'منتج اختبار',
      store_id: 'store-1',
      store_name: 'KINTO',
      quantity: 1,
      unit_price_local: 218000,
      line_total_local: 218000,
      currency: 'IQD',
    }],
  },
  delivery_payment_type: 'product_paid_delivery_cod',
  reward_discount_amount: 1000,
  reward_discount_currency: 'IQD',
  reward_discount_snapshot: { amount: 1000, currency: 'IQD', source: 'kinto_store_coupon_v310' },
  delivery_fee: 0,
  external_shipping_fee: 0,
};

const context = {
  vendorStore: { id: 'store-1' },
  orders: [],
  sb: {
    from(table) {
      assert.equal(table, 'orders');
      return {
        select(columns) {
          selectedColumns = columns;
          return {
            order() {
              return { limit: async () => ({ data: [vendorOrder], error: null }) };
            },
          };
        },
      };
    },
  },
  normalizeOrderDetails(value) { return value || {}; },
  renderVendorOrders() {},
  renderFinance() {},
  renderStats() {},
  showNotice(message) { notices.push(message); },
  window: {
    KintoBundleV93: {
      printInvoice(order, options) { routedInvoice = { order, options }; },
    },
  },
};
vm.createContext(context);
vm.runInContext(
  extract('async function loadOrders()', '\nasync function printVendorOrderInvoice'),
  context,
);
vm.runInContext(
  extract('async function printVendorOrderInvoice', '\nfunction openVendorOrderDetails'),
  context,
);
vm.runInContext(
  extract('function vendorHasConfirmedElectronicCollection', '\nasync function printVendorOrderInvoice'),
  context,
);

(async () => {
  await context.loadOrders();
  assert.match(selectedColumns, /delivery_payment_type/);
  assert.match(selectedColumns, /reward_discount_amount/);
  assert.match(selectedColumns, /reward_discount_snapshot/);
  assert.match(selectedColumns, /delivery_fee/);
  assert.equal(context.orders.length, 1);
  assert.equal(context.orders[0].delivery_payment_type, 'product_paid_delivery_cod');
  assert.equal(context.orders[0].total_price, 217000);
  assert.equal(context.vendorHasConfirmedElectronicCollection(context.orders[0]), true);

  await context.printVendorOrderInvoice('kn-1');
  assert.equal(routedInvoice.order, context.orders[0]);
  assert.deepEqual(JSON.parse(JSON.stringify(routedInvoice.options)), { canonicalOnly: true });

  context.orders = [{ ...vendorOrder, id: 'manual', delivery_payment_type: 'cod_full' }];
  routedInvoice = null;
  await context.printVendorOrderInvoice('manual');
  assert.equal(routedInvoice, null, 'manual order does not receive the new electronic invoice route');
  assert.match(notices.at(-1), /لا توجد فاتورة دفع إلكتروني/);

  const fourPanels = [
    'dashboard.html',
    'employee-dashboard.html',
    'admin-dashboard.html',
    'vendor-dashboard-v2.html',
  ];
  for (const page of fourPanels) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    assert.match(html, /js\/kinto-bundle-ui-v93\.js\?v=20261020-p5-shared-invoice-all-panels-v1/);
  }
  assert.match(vendorHtml, /عرض \/ طباعة الفاتورة الإلكترونية/);

  for (const page of ['employee-dashboard.html', 'admin-dashboard.html']) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const match = html.match(/<script id="kinto-v93-bundle-adapter">([\s\S]*?)<\/script>/);
    assert(match, `${page} must have the shared invoice adapter`);
    let enhanced = null;
    const box = { innerText: 'تفاصيل KN-000123', offsetParent: {}, dataset: {}, querySelector: () => null };
    const adapterContext = {
      cloudOrders: [vendorOrder],
      window: { KintoBundleV93: { enhance: (...args) => { enhanced = args; } } },
      document: {
        readyState: 'complete', body: {},
        querySelector(selector) { return selector === '#modalOrderDetailsBody' ? box : null; },
        querySelectorAll: () => [], addEventListener() {},
      },
      MutationObserver: class { observe() {} },
      requestAnimationFrame: callback => callback(),
      setTimeout,
    };
    vm.createContext(adapterContext);
    vm.runInContext(match[1], adapterContext);
    assert.equal(enhanced?.[0], box, `${page} modal reaches the shared bundle enhancer`);
    assert.equal(enhanced?.[1], vendorOrder);
    assert.deepEqual(JSON.parse(JSON.stringify(enhanced?.[2])), { storeScoped: true, storeInvoiceButtons: false });
  }
  console.log('PASS vendor invoice uses saved collection fields and the shared KINTO invoice renderer');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
