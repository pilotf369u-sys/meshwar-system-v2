const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const vendorHtml = fs.readFileSync(path.join(root, 'vendor-dashboard-v2.html'), 'utf8');
const start = vendorHtml.indexOf('async function kintoVendorPaidInvoiceProof');
const end = vendorHtml.indexOf('async function openVendorOrderDetails', start);
assert(start >= 0 && end > start, 'the merchant invoice helper is wired into the actual vendor page');
const helperSource = vendorHtml.slice(start, end);

function makeOrder(overrides = {}) {
  return {
    id: 'order-123',
    order_code: 'KN-000123',
    reference_order_no: 'REF-123',
    status: 'تم التسديد',
    created_at: '2026-10-20T00:00:00Z',
    total_price: 217000,
    currency: 'IQD',
    delivery_payment_type: 'cod_full',
    reward_discount_amount: 1000,
    reward_discount_currency: 'IQD',
    details: {
      source: 'local_store',
      store_id: 'store-1',
      store_name: 'KINTO',
      customer: { name: 'عميل الاختبار', phone: '07700000000' },
      items: [{
        store_id: 'store-1',
        store_name: 'KINTO',
        product_id: 'product-1',
        product_name: 'منتج الاختبار',
        product_image: 'https://example.test/product.jpg',
        quantity: 1,
        unit_price_local: 218000,
        line_total_local: 218000,
        currency: 'IQD',
        selected_options: { color: 'أزرق' },
      }],
    },
    ...overrides,
  };
}

function makeEnvironment({ proof = true, canonicalOrder = null, throwRpc = false } = {}) {
  const order = makeOrder();
  const dbOrder = canonicalOrder || structuredClone(order);
  const state = { rpcCalls: [], invoiceCalls: [], notices: [], popupClosed: false };
  const context = {
    orders: [order],
    vendorStore: { id: 'store-1', store_name: 'KINTO' },
    normalizeOrderDetails(value) {
      if (value && typeof value === 'object') return value;
      try { return JSON.parse(value || '{}'); } catch { return {}; }
    },
    vendorNotifSessionV399() { return { token: 'vendor-session-token' }; },
    sb: {
      async rpc(name, args) {
        state.rpcCalls.push({ name, args });
        if (throwRpc) return { data: null, error: new Error('RPC unavailable') };
        return { data: proof ? [{ order_id: args.p_order_ids[0] }] : [], error: null };
      },
      from(table) {
        assert.equal(table, 'orders');
        return {
          select(columns) {
            assert.equal(columns, '*', 'invoice reads the canonical row only on demand; the main orders query is unchanged');
            return {
              eq(column, id) {
                assert.equal(column, 'id');
                return { limit: async () => ({ data: [String(dbOrder.id) === String(id) ? dbOrder : null].filter(Boolean), error: null }) };
              },
            };
          },
        };
      },
    },
    window: {
      KintoBundleV93: {
        async printInvoice(invoiceOrder, options) {
          state.invoiceCalls.push({ invoiceOrder, options });
        },
      },
    },
    showNotice(message) { state.notices.push(message); },
    document: {},
    console,
    windowOpen() {},
  };
  vm.createContext(context);
  vm.runInContext(helperSource, context);
  return { context, order, dbOrder, state };
}

(async () => {
  {
    const env = makeEnvironment();
    const invoice = await env.context.kintoVendorPreparePaidElectronicInvoice(env.order, 'vendor-session-token');
    assert.equal(invoice.order_code, 'KN-000123');
    assert.equal(invoice.total_price, 217000);
    assert.equal(invoice.reward_discount_amount, 1000);
    assert.equal(invoice.delivery_payment_type, 'product_paid_delivery_cod');
    assert.equal(invoice.details.items[0].product_image, 'https://example.test/product.jpg');
    assert.deepEqual(JSON.parse(JSON.stringify(invoice.details.stores)), [{
      store_id: 'store-1',
      store_name: 'KINTO',
      subtotal_local: 218000,
    }], 'the shared invoice clone contains only the owning store metadata');
    assert.equal(env.order.delivery_payment_type, 'cod_full', 'legacy order row is never modified');
    assert.equal(env.state.rpcCalls[0].name, 'vendor_paid_electronic_invoice_orders_v1');
    assert.deepEqual(JSON.parse(JSON.stringify(env.state.rpcCalls[0].args)), {
      p_session_token: 'vendor-session-token',
      p_order_ids: ['order-123'],
    });
  }

  {
    const env = makeEnvironment();
    env.order.details.source = 'local_cart_bundle';
    env.dbOrder.details.source = 'local_cart_bundle';
    const invoice = await env.context.kintoVendorPreparePaidElectronicInvoice(env.order, 'vendor-session-token');
    assert.equal(invoice.order_code, 'KN-000123', 'legacy cart-bundle KN rows with server KP proof use the shared invoice');
    assert.equal(env.state.rpcCalls.length, 1, 'cart source alone is never trusted; server proof is still required');
  }

  {
    const env = makeEnvironment({ proof: false });
    const invoice = await env.context.kintoVendorPreparePaidElectronicInvoice(env.order, 'vendor-session-token');
    assert.equal(invoice, null, 'a manual order or a failed/pending attempt has no electronic invoice route');
    assert.equal(env.state.rpcCalls.length, 1);
  }

  {
    const env = makeEnvironment();
    env.context.vendorStore.id = 'store-2';
    const invoice = await env.context.kintoVendorPreparePaidElectronicInvoice(env.order, 'vendor-session-token');
    assert.equal(invoice, null, 'a different merchant cannot request this store invoice');
    assert.equal(env.state.rpcCalls.length, 0);
  }

  {
    const otherStore = makeOrder();
    otherStore.details.items.push({
      store_id: 'store-2', product_id: 'foreign-product', product_name: 'منتج متجر آخر',
      quantity: 1, unit_price_local: 999999, line_total_local: 999999, currency: 'IQD',
    });
    const env = makeEnvironment({ canonicalOrder: otherStore });
    await assert.rejects(
      env.context.kintoVendorPreparePaidElectronicInvoice(env.order, 'vendor-session-token'),
      /لا تطابق هذا المتجر/,
      'foreign-store lines fail closed before reaching the shared renderer',
    );
    assert.equal(env.state.invoiceCalls.length, 0);
  }

  {
    const env = makeEnvironment();
    const popup = { closed: false, close() { this.closed = true; } };
    await env.context.kintoVendorPrintPaidElectronicInvoice('order-123', popup);
    assert.equal(env.state.invoiceCalls.length, 1);
    assert.equal(env.state.invoiceCalls[0].invoiceOrder.delivery_payment_type, 'product_paid_delivery_cod');
    assert.deepEqual(JSON.parse(JSON.stringify(env.state.invoiceCalls[0].options)), {
      canonicalOnly: true,
      invoiceWindow: { closed: false },
    });
    assert.equal(env.order.delivery_payment_type, 'cod_full');
  }

  {
    const env = makeEnvironment({ proof: false });
    const popup = { closed: false, close() { this.closed = true; } };
    await env.context.kintoVendorPrintPaidElectronicInvoice('order-123', popup);
    assert.equal(env.state.invoiceCalls.length, 0, 'unverified, failed, and manual payments never reach the shared paid invoice');
    assert.equal(popup.closed, true);
  }

  assert.match(vendorHtml, /<script src="js\/kinto-bundle-ui-v93\.js\?v=20261020-p5-paid-goods-invoice-v1"><\/script>/);
  assert.match(vendorHtml, /await kintoVendorAttachPaidElectronicInvoice\(o,modal,body\)/);
  assert.match(vendorHtml, /function closeVendorOrderDetails\(\)/);

  const loaderStart = vendorHtml.indexOf('async function loadOrders(){');
  const loaderEnd = vendorHtml.indexOf('\n', loaderStart);
  const loader = vendorHtml.slice(loaderStart, loaderEnd);
  assert.match(loader, /select\('id,order_code,total_price,currency,status,created_at,details'\)/,
    'the restored board orders query remains the known-good narrow query');

  const v95 = fs.readFileSync(path.join(root, 'js/vendor-v94-multistore-orders.js'), 'utf8');
  const v95Details = v95.slice(v95.indexOf('async function openDetails(id)'), v95.indexOf('let secureDetails=null,shippingDetails=null;', v95.indexOf('async function openDetails(id)')));
  assert.match(v95Details, /await window\.kintoVendorPrintPaidElectronicInvoice\(orderId,popup\)/, 'confirmed paid KP opens the real customer-style invoice from Details');
  assert.doesNotMatch(v95Details, /if\(!error&&Array\.isArray\(data\).*return runtime\.nativeOpenVendorOrderDetails/, 'paid order must not use the compact six-field modal');

  console.log('PASS merchant invoice route: legacy paid KP proof, shared customer renderer, own-store item scope, and unchanged manual order data.');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
