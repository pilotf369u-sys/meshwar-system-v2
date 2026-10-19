import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const script = await readFile(new URL('../js/admin-payment-methods-g16.js', import.meta.url), 'utf8');

class Element {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.dataset = {};
    this.style = {};
    this.elements = {};
    this.handlers = {};
    this.classList = { contains: () => false };
    this.hidden = false;
  }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  setAttribute() {}
  append() {}
  insertBefore() {}
  replaceChildren() {}
  scrollIntoView() {}
}

async function mount({ initialMode = 'manual', effectiveMode = 'manual', transitionState = 'stable', ready = false } = {}) {
  const calls = [];
  const ids = [
    'g16PaymentMethods', 'g16Form', 'g16SaveRuntime', 'g16GatewaySwitch', 'g16PaymentMode',
    'g16GatewayEnvironment', 'g16RuntimeStatus', 'g16GatewayState', 'g16RuntimeControls', 'g16List',
    'g16CustomerPreview', 'g16Message', 'g16Reset', 'g16Reload', 'g16ManualFields', 'g16GatewayNote',
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new Element(id)]));
  const fields = ['methodId', 'methodType', 'methodLabel', 'methodProvider', 'recipientName', 'accountReference', 'instructions'];
  elements.g16Form.elements = Object.fromEntries(fields.map(name => [name, new Element(name)]));
  elements.g16PaymentMode.value = initialMode;
  elements.g16GatewayEnvironment.value = 'sandbox';

  const rpc = async (name, args) => {
    calls.push({ name, args });
    if (name === 'kinto_payment_admin_g16') return { data: { methods: [] }, error: null };
    if (name === 'kinto_payment_mode_admin_g16') {
      const action = args.p_action;
      if (action === 'get') return { data: { payment_mode: initialMode, gateway_environment: 'sandbox', gateways_enabled: false, gateway_integration_ready: ready, effective_payment_mode: effectiveMode }, error: null };
      if (action === 'set_mode') return { data: { payment_mode: args.p_payment_mode, gateway_environment: 'sandbox', gateways_enabled: false, gateway_integration_ready: ready, effective_payment_mode: effectiveMode }, error: null };
      return { data: { payment_mode: initialMode, gateway_environment: 'sandbox', gateways_enabled: false, gateway_integration_ready: ready, effective_payment_mode: effectiveMode }, error: null };
    }
    if (name === 'kinto_payment_p4_admin_read') return { data: { effective_mode: effectiveMode, transition_state: transitionState, electronic_admission_ready: false, active_holds: 0, unresolved_attempts: 0, unresolved_attempt_list: [] }, error: null };
    if (name === 'kinto_payment_mode_transition_p4') return { data: { ok: true, effective_mode: args.p_target_mode, transition_state: 'stable' }, error: null };
    throw new Error(`Unexpected RPC: ${name}`);
  };
  let domReady;
  const document = {
    baseURI: 'https://kinto.example/admin-dashboard.html',
    head: new Element('head'),
    getElementById: id => elements[id] || null,
    createElement: () => new Element(),
  };
  const window = {
    KintoAdminSessionV147: { read: () => ({ token: 'admin-session-for-test' }) },
    ensureCustomerSupabase: async () => ({ rpc }),
    loadPaymentProvidersP2: async () => {},
    addEventListener: (name, fn) => { if (name === 'DOMContentLoaded') domReady = fn; },
  };
  const context = { window, document, URL, confirm: () => true, console };
  vm.runInNewContext(script, context, { filename: 'admin-payment-methods-g16.js' });
  domReady();
  await window.loadAdminPaymentMethodsG16();
  return { calls, elements };
}

test('saving electronic Sandbox stores the preference while P4 stays manual and stable', async () => {
  const { calls, elements } = await mount({ initialMode: 'manual', effectiveMode: 'manual', transitionState: 'stable', ready: false });
  elements.g16PaymentMode.value = 'electronic';

  await elements.g16SaveRuntime.onclick();

  assert.ok(calls.some(call => call.name === 'kinto_payment_mode_admin_g16' && call.args.p_action === 'set_mode' && call.args.p_payment_mode === 'electronic'));
  assert.ok(!calls.some(call => call.name === 'kinto_payment_mode_transition_p4'));
  assert.match(elements.g16RuntimeStatus.textContent, /حُفظ اختيار الدفع الإلكتروني Sandbox/);
  assert.match(elements.g16RuntimeStatus.textContent, /الوضع الفعلي يدوياً/);
});

test('saving manual cannot bypass the simulator stop-and-reconcile flow', async () => {
  const { calls, elements } = await mount({ initialMode: 'electronic', effectiveMode: 'electronic', transitionState: 'stable', ready: true });
  elements.g16PaymentMode.value = 'manual';

  await elements.g16SaveRuntime.onclick();

  assert.ok(!calls.some(call => call.name === 'kinto_payment_mode_transition_p4'));
  assert.ok(!calls.some(call => call.name === 'kinto_payment_mode_admin_g16' && call.args.p_action === 'set_mode'));
  assert.match(elements.g16RuntimeStatus.textContent, /إيقاف المحاكي والعودة لليدوي/);
});

test('an existing P4 drain cannot be bypassed by saving a Sandbox preference', async () => {
  const { calls, elements } = await mount({ initialMode: 'manual', effectiveMode: 'manual', transitionState: 'draining', ready: false });
  elements.g16PaymentMode.value = 'electronic';

  await elements.g16SaveRuntime.onclick();

  assert.ok(calls.some(call => call.name === 'kinto_payment_mode_transition_p4' && call.args.p_target_mode === 'electronic'));
  assert.ok(!calls.some(call => call.name === 'kinto_payment_mode_admin_g16' && call.args.p_action === 'set_mode'));
});
