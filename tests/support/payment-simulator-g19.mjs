/**
 * Test-only, server-side, no-charge simulator. It accepts only an explicitly isolated
 * runtime, uses a supplied server catalog (never browser prices), and keeps
 * all state in this process for deterministic tests. It never calls Supabase,
 * a payment provider, or the order engine. Keep it outside Supabase functions
 * so it cannot be deployed or imported by a production endpoint accidentally.
 */
import { assertNewPaymentAllowed } from '../../supabase/functions/_shared/kinto-payment-gateway-g18.mjs';

export class PaymentSimulatorError extends Error {
  constructor(code) { super(code); this.name = 'PaymentSimulatorError'; this.code = code; }
}

const clone = value => structuredClone(value);
const bytesToHex = bytes => [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
const hexToBytes = hex => new Uint8Array(String(hex).match(/.{1,2}/g)?.map(pair => Number.parseInt(pair, 16)) || []);

export class KintoPaymentSimulator {
  #state;
  #secret;
  #now;
  #lock = Promise.resolve();

  constructor({ environment, projectRef, productionProjectRef, secret, catalog, coupons = [], quoteTtlMs = 10 * 60_000, reservationTtlMs = 15 * 60_000, now = () => Date.now() }) {
    if (environment !== 'isolated' || !projectRef || projectRef === productionProjectRef || !productionProjectRef) {
      throw new PaymentSimulatorError('ISOLATED_PROJECT_REQUIRED');
    }
    if (!secret || String(secret).length < 32) throw new PaymentSimulatorError('SIMULATOR_SECRET_REQUIRED');
    if (!Array.isArray(catalog) || !catalog.length) throw new PaymentSimulatorError('SERVER_CATALOG_REQUIRED');
    this.#secret = new TextEncoder().encode(secret);
    this.#now = now;
    this.quoteTtlMs = quoteTtlMs;
    this.reservationTtlMs = reservationTtlMs;
    this.#state = {
      mode: 'manual', globalPaused: true, provider: { key: 'kinto-simulator-g19', enabled: true, paused: true },
      catalog: new Map(catalog.map(product => [String(product.sku), clone(product)])),
      coupons: new Map(coupons.map(coupon => [String(coupon.code), clone(coupon)])),
      quotes: new Map(), reservations: new Map(), intents: new Map(), idempotency: new Map(), events: new Map(),
      orders: new Map(), invoices: new Map(), stockDeductionCount: new Map(), audit: [],
    };
  }

  async #serial(task) {
    const previous = this.#lock;
    let release;
    this.#lock = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await task(); } finally { release(); }
  }

  setPaymentMode(mode) {
    if (!['manual', 'electronic'].includes(mode)) throw new PaymentSimulatorError('INVALID_PAYMENT_MODE');
    this.#state.mode = mode;
    if (mode === 'manual') { this.#state.globalPaused = true; this.#state.audit.push({ action: 'manual_fallback', at: this.#now() }); }
    return this.runtime();
  }

  pauseAll(reason) {
    if (String(reason || '').trim().length < 8) throw new PaymentSimulatorError('PAUSE_REASON_REQUIRED');
    this.#state.globalPaused = true;
    this.#state.audit.push({ action: 'global_pause', reason: String(reason).trim().slice(0, 500), at: this.#now() });
    return this.runtime();
  }

  pauseProvider(reason) {
    if (String(reason || '').trim().length < 8) throw new PaymentSimulatorError('PAUSE_REASON_REQUIRED');
    this.#state.provider.paused = true;
    this.#state.audit.push({ action: 'provider_pause', provider: this.#state.provider.key, reason: String(reason).trim().slice(0, 500), at: this.#now() });
    return this.runtime();
  }

  resumeForTests() {
    this.#state.provider.paused = false;
    this.#state.globalPaused = false;
    this.#state.mode = 'electronic';
    this.#state.audit.push({ action: 'resume_test_mode', at: this.#now() });
    return this.runtime();
  }

  runtime() {
    return clone({ payment_mode: this.#state.mode, new_payments_paused: this.#state.globalPaused,
      active_provider_paused: this.#state.provider.paused, gateways_enabled: this.#state.provider.enabled,
      active_gateway_provider: this.#state.provider.key });
  }

  async quote({ customerId, items, couponCodes = [] }) {
    if (!customerId || !Array.isArray(items) || items.length < 1 || items.length > 100) throw new PaymentSimulatorError('INVALID_CART');
    const merged = new Map();
    for (const item of items) {
      const sku = String(item?.sku || ''), quantity = Number(item?.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000) throw new PaymentSimulatorError('INVALID_QUANTITY');
      const product = this.#state.catalog.get(sku);
      if (!product || product.active === false) throw new PaymentSimulatorError('PRODUCT_UNAVAILABLE');
      const existing = merged.get(sku);
      const mergedQuantity = quantity + (existing?.quantity || 0);
      if (mergedQuantity > 1000) throw new PaymentSimulatorError('INVALID_QUANTITY');
      merged.set(sku, { product, quantity: mergedQuantity });
    }
    for (const { product, quantity } of merged.values()) {
      if (product.stock < quantity) throw new PaymentSimulatorError('INSUFFICIENT_STOCK');
      if (!Number.isSafeInteger(product.unitMinor) || product.unitMinor < 0) throw new PaymentSimulatorError('INVALID_SERVER_PRICE');
    }
    const currencies = new Set([...merged.values()].map(({ product }) => product.currency));
    if (currencies.size !== 1 || !/^[A-Z]{3}$/.test([...currencies][0] || '')) throw new PaymentSimulatorError('CURRENCY_CONVERSION_REQUIRED');
    const selectedCoupons = [];
    const usedStores = new Set();
    for (const code of couponCodes) {
      const coupon = this.#state.coupons.get(String(code));
      if (!coupon || coupon.active !== true || usedStores.has(coupon.storeId)) throw new PaymentSimulatorError('COUPON_INVALID');
      const storeTotal = [...merged.values()].filter(x => x.product.storeId === coupon.storeId)
        .reduce((sum, x) => sum + x.product.unitMinor * x.quantity, 0);
      if (!storeTotal || (coupon.minimumMinor && storeTotal < coupon.minimumMinor)) throw new PaymentSimulatorError('COUPON_NOT_ELIGIBLE');
      const discount = coupon.kind === 'fixed'
        ? Math.min(storeTotal, coupon.valueMinor)
        : coupon.kind === 'basis_points'
          ? Math.floor(storeTotal * Math.min(10000, Math.max(0, coupon.basisPoints)) / 10000)
          : NaN;
      if (!Number.isSafeInteger(discount) || discount < 0) throw new PaymentSimulatorError('COUPON_INVALID');
      selectedCoupons.push({ code: coupon.code, storeId: coupon.storeId, discountMinor: discount });
      usedStores.add(coupon.storeId);
    }
    const lines = [...merged.values()].map(({ product, quantity }) => {
      return { sku: product.sku, productId: product.productId, name: product.name, storeId: product.storeId,
        storeName: product.storeName, optionKey: product.optionKey || null, quantity, unitMinor: product.unitMinor,
        currency: product.currency, imageUrl: product.imageUrl || null, couponDiscountMinor: 0 };
    });
    for (const coupon of selectedCoupons) {
      const storeLines = lines.filter(line => line.storeId === coupon.storeId);
      let remaining = coupon.discountMinor;
      for (const line of storeLines) {
        const value = line.unitMinor * line.quantity;
        const share = storeLines.at(-1) === line ? remaining : Math.floor(coupon.discountMinor * value / storeLines.reduce((n, row) => n + row.unitMinor * row.quantity, 0));
        line.couponDiscountMinor = share;
        remaining -= share;
      }
    }
    const productTotal = lines.reduce((sum, line) => sum + line.unitMinor * line.quantity, 0);
    const discountTotal = lines.reduce((sum, line) => sum + line.couponDiscountMinor, 0);
    if (!Number.isSafeInteger(productTotal) || !Number.isSafeInteger(discountTotal)) throw new PaymentSimulatorError('AMOUNT_INVALID');
    const quote = { id: crypto.randomUUID(), customerId: String(customerId), currency: [...currencies][0],
      lines, productTotalMinor: productTotal, discountMinor: discountTotal, amountMinor: productTotal - discountTotal,
      shippingIncluded: false, createdAt: this.#now(), expiresAt: this.#now() + this.quoteTtlMs, status: 'quoted' };
    if (quote.amountMinor <= 0) throw new PaymentSimulatorError('AMOUNT_INVALID');
    this.#state.quotes.set(quote.id, quote);
    return clone(quote);
  }

  async reserve(quoteId) {
    return this.#serial(async () => {
      const quote = this.#state.quotes.get(quoteId);
      if (!quote || quote.status !== 'quoted' || quote.expiresAt <= this.#now()) throw new PaymentSimulatorError('QUOTE_EXPIRED');
      const reserved = new Map();
      for (const [id, row] of this.#state.reservations) {
        if (row.status === 'active' && row.expiresAt > this.#now()) reserved.set(id, row);
      }
      for (const line of quote.lines) {
        const active = [...reserved.values()].flatMap(row => row.lines).filter(item => item.sku === line.sku).reduce((n, item) => n + item.quantity, 0);
        const product = this.#state.catalog.get(line.sku);
        if (active + line.quantity > product.stock) throw new PaymentSimulatorError('INSUFFICIENT_STOCK');
      }
      const reservation = { id: crypto.randomUUID(), quoteId, status: 'active', createdAt: this.#now(),
        expiresAt: this.#now() + this.reservationTtlMs, lines: clone(quote.lines) };
      this.#state.reservations.set(reservation.id, reservation);
      quote.status = 'reserved'; quote.reservationId = reservation.id;
      return clone(reservation);
    });
  }

  async createPayment({ quoteId, idempotencyKey, scenario = 'success' }) {
    return this.#serial(async () => {
      if (!['success', 'decline', 'delay', 'duplicate'].includes(scenario)) throw new PaymentSimulatorError('INVALID_SIMULATION_SCENARIO');
      if (!String(idempotencyKey || '').trim() || String(idempotencyKey).length > 200) throw new PaymentSimulatorError('IDEMPOTENCY_KEY_REQUIRED');
      const quote = this.#state.quotes.get(quoteId);
      if (this.#state.idempotency.has(idempotencyKey)) return clone(this.#state.intents.get(this.#state.idempotency.get(idempotencyKey)));
      if (!quote || quote.status !== 'reserved') throw new PaymentSimulatorError('ACTIVE_RESERVATION_REQUIRED');
      const reservation = this.#state.reservations.get(quote.reservationId);
      if (!reservation || reservation.status !== 'active' || reservation.expiresAt <= this.#now()) throw new PaymentSimulatorError('ACTIVE_RESERVATION_REQUIRED');
      try { assertNewPaymentAllowed({ ...this.runtime(), active_provider_paused: this.#state.provider.paused }, this.#state.provider.key); }
      catch (error) { throw new PaymentSimulatorError(error.code || 'NEW_PAYMENTS_PAUSED'); }
      const intent = { id: crypto.randomUUID(), paymentReference: `KP-${crypto.randomUUID().replaceAll('-', '').toUpperCase()}`,
        customerId: quote.customerId, quoteId, reservationId: quote.reservationId,
        providerKey: this.#state.provider.key, providerEnvironment: 'isolated',
        providerReference: `sim-${crypto.randomUUID()}`, amountMinor: quote.amountMinor, currency: quote.currency,
        status: 'pending', scenario, createdAt: this.#now(), checkoutGroupId: null, orders: [] };
      this.#state.intents.set(intent.id, intent);
      this.#state.idempotency.set(idempotencyKey, intent.id);
      quote.status = 'payment_pending';
      if (scenario === 'decline') await this.#deliver(intent, 'declined');
      else if (scenario === 'success') await this.#deliver(intent, 'captured');
      else if (scenario === 'duplicate') {
        await this.#deliver(intent, 'captured', 'duplicate-capture');
        await this.#deliver(intent, 'captured', 'duplicate-capture');
      }
      return clone(intent);
    });
  }

  async deliverDelayed(paymentId) {
    return this.#serial(async () => {
      const intent = this.#state.intents.get(paymentId);
      if (!intent || intent.scenario !== 'delay') throw new PaymentSimulatorError('DELAYED_PAYMENT_NOT_FOUND');
      await this.#deliver(intent, 'captured', 'delayed-capture');
      return clone(intent);
    });
  }

  async #deliver(intent, status, eventSuffix = 'capture') {
    const event = { providerKey: intent.providerKey, providerEventId: `${intent.id}-${eventSuffix}`,
      intentId: intent.id, providerReference: intent.providerReference, amountMinor: intent.amountMinor,
      currency: intent.currency, status, createdAt: this.#now() };
    const raw = JSON.stringify(event), signature = await this.#sign(raw);
    return this.receiveWebhook({ rawBody: raw, signature });
  }

  async receiveWebhook({ rawBody, signature }) {
    const raw = String(rawBody || '');
    if (!await this.#verify(raw, signature)) throw new PaymentSimulatorError('SIMULATOR_SIGNATURE_INVALID');
    let event;
    try { event = JSON.parse(raw); } catch { throw new PaymentSimulatorError('WEBHOOK_INVALID_JSON'); }
    if (!event?.providerEventId || !event?.intentId) throw new PaymentSimulatorError('WEBHOOK_IDENTITY_MISSING');
    if (!['captured', 'declined'].includes(event.status)) throw new PaymentSimulatorError('WEBHOOK_STATUS_UNSUPPORTED');
    const intent = this.#state.intents.get(event.intentId);
    if (!intent) throw new PaymentSimulatorError('INTENT_NOT_FOUND');
    if (this.#state.events.has(event.providerEventId)) return { duplicate: true };
    this.#state.events.set(event.providerEventId, { event, raw, signature, processedAt: this.#now() });
    if (event.providerKey !== intent.providerKey || event.providerReference !== intent.providerReference ||
        event.amountMinor !== intent.amountMinor || event.currency !== intent.currency) {
      intent.status = 'reconciliation_required';
      throw new PaymentSimulatorError('PAYMENT_MISMATCH');
    }
    if (event.status === 'declined') {
      intent.status = 'failed';
      this.#state.quotes.get(intent.quoteId).status = 'payment_failed';
      const reservation = this.#state.reservations.get(intent.reservationId);
      if (reservation?.status === 'active') reservation.status = 'released';
      return { duplicate: false, status: intent.status };
    }
    if (intent.status === 'captured') return { duplicate: true, status: intent.status };
    const reservation = this.#state.reservations.get(intent.reservationId);
    if (!reservation || reservation.status !== 'active' || reservation.expiresAt <= this.#now()) {
      intent.status = 'reconciliation_required';
      intent.refundRequired = true;
      this.#state.quotes.get(intent.quoteId).status = 'reconciliation_required';
      if (reservation?.status === 'active') reservation.status = 'expired';
      return { duplicate: false, status: intent.status, refundRequired: true };
    }
    await this.#finalize(intent, reservation);
    return { duplicate: false, status: intent.status };
  }

  async #finalize(intent, reservation) {
    const quote = this.#state.quotes.get(intent.quoteId);
    if (!quote || quote.customerId !== intent.customerId || quote.amountMinor !== intent.amountMinor || quote.currency !== intent.currency) {
      intent.status = 'reconciliation_required'; intent.refundRequired = true; quote.status = 'reconciliation_required'; return;
    }
    const grouped = new Map();
    for (const line of quote.lines) {
      if (!grouped.has(line.storeId)) grouped.set(line.storeId, []);
      grouped.get(line.storeId).push(clone(line));
    }
    const groupId = crypto.randomUUID();
    const created = [];
    for (const [storeId, lines] of grouped) {
      const orderId = crypto.randomUUID();
      const subtotal = lines.reduce((sum, line) => sum + line.unitMinor * line.quantity - line.couponDiscountMinor, 0);
      const order = { id: orderId, orderCode: `KN-${String(this.#state.orders.size + created.length + 1).padStart(6, '0')}`,
        checkoutGroupId: groupId, paymentIntentId: intent.id, paymentReference: intent.paymentReference,
        customerId: intent.customerId, storeId, storeName: lines[0].storeName, items: lines, totalMinor: subtotal,
        currency: intent.currency, status: 'تم التسديد', createdAt: this.#now() };
      created.push(order);
    }
    // Prepare all rows and stock updates before publishing any visible order.
    const needed = new Map();
    for (const line of quote.lines) needed.set(line.sku, (needed.get(line.sku) || 0) + line.quantity);
    for (const [sku, qty] of needed) {
      const product = this.#state.catalog.get(sku);
      if (!product || product.stock < qty) {
        intent.status = 'reconciliation_required'; intent.refundRequired = true; quote.status = 'reconciliation_required'; return;
      }
    }
    for (const [sku, qty] of needed) {
      const product = this.#state.catalog.get(sku);
      product.stock -= qty;
      this.#state.stockDeductionCount.set(sku, (this.#state.stockDeductionCount.get(sku) || 0) + 1);
    }
    for (const order of created) {
      this.#state.orders.set(order.id, order);
      this.#state.invoices.set(order.id, { orderId: order.id, orderCode: order.orderCode, storeId: order.storeId,
        customerId: order.customerId, totalMinor: order.totalMinor, currency: order.currency, lines: clone(order.items) });
    }
    reservation.status = 'consumed';
    quote.status = 'paid';
    intent.status = 'captured'; intent.checkoutGroupId = groupId;
    intent.orders = created.map(({ id, orderCode, storeId }) => ({ id, orderCode, storeId }));
  }

  async #sign(raw) {
    const key = await crypto.subtle.importKey('raw', this.#secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return bytesToHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
  }

  async #verify(raw, signature) {
    const key = await crypto.subtle.importKey('raw', this.#secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('HMAC', key, hexToBytes(signature), new TextEncoder().encode(raw));
  }

  customerPayments(customerId) {
    return [...this.#state.intents.values()].filter(intent => intent.customerId === customerId && intent.status !== 'pending')
      .map(intent => ({ paymentReference: intent.paymentReference, status: intent.status, amountMinor: intent.amountMinor,
        currency: intent.currency, orders: clone(intent.orders), refundRequired: Boolean(intent.refundRequired) }));
  }

  visibleOrdersFor(storeId) {
    return [...this.#state.orders.values()].filter(order => order.storeId === storeId).map(clone);
  }

  invoiceFor(orderId, customerId) {
    const invoice = this.#state.invoices.get(orderId);
    return invoice && invoice.customerId === customerId ? clone(invoice) : null;
  }

  invoicesForStore(storeId) {
    return [...this.#state.invoices.values()].filter(invoice => invoice.storeId === storeId).map(clone);
  }

  stockFor(sku) { return this.#state.catalog.get(sku)?.stock ?? null; }
  stockDeductionsFor(sku) { return this.#state.stockDeductionCount.get(sku) || 0; }
  reservationFor(quoteId) { const quote = this.#state.quotes.get(quoteId); return quote ? clone(this.#state.reservations.get(quote.reservationId) || null) : null; }
  intentFor(id) { return clone(this.#state.intents.get(id) || null); }
  counts() { return { intents: this.#state.intents.size, events: this.#state.events.size, orders: this.#state.orders.size, invoices: this.#state.invoices.size }; }
}
