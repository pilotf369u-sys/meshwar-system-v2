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
  querySelector() { return new Element(); }
}

async function mount({ initialMode = 'manual', effectiveMode = 'manual', transitionState = 'stable', ready = false } = {}) {
  const calls = [];
  let selectedMode = initialMode, effective = effectiveMode, transition = transitionState;
  let simulatorEnabled = false, admissionReady = false, emergencyStop = true;
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
      if (action === 'get') return { data: { payment_mode: selectedMode, gateway_environment: 'sandbox', gateways_enabled: false, gateway_integration_ready: ready, effective_payment_mode: effective }, error: null };
      if (action === 'set_mode') { selectedMode = args.p_payment_mode; return { data: { payment_mode: selectedMode, gateway_environment: 'sandbox', gateways_enabled: false, gateway_integration_ready: ready, effective_payment_mode: effective }, error: null }; }
      return { data: { payment_mode: selectedMode, gateway_environment: 'sandbox', gateways_enabled: false, gateway_integration_ready: ready, effective_payment_mode: effective }, error: null };
    }
    if (name === 'kinto_payment_p4_admin_read') return { data: { effective_mode: effective, transition_state: transition, electronic_admission_ready: admissionReady, active_holds: 0, unresolved_attempts: 0, unresolved_attempt_list: [] }, error: null };
    if (name === 'kinto_payment_mode_transition_p4') { effective = args.p_target_mode; selectedMode = args.p_target_mode; transition = 'stable'; return { data: { ok: true, effective_mode: effective, transition_state: 'stable' }, error: null }; }
    if (name === 'kinto_payment_p6_simulator_admin_v1') {
      const action = args.p_action;
      if (action === 'prepare') { simulatorEnabled = true; admissionReady = true; }
      if (action === 'open') emergencyStop = false;
      if (action === 'close') { simulatorEnabled = false; admissionReady = false; }
      return { data: { ok: true, payment_mode: selectedMode, effective_mode: effective, transition_state: transition,
        simulator_enabled: simulatorEnabled, electronic_admission_ready: admissionReady, emergency_stop: emergencyStop,
        active_holds: 0, unresolved_attempts: 0, real_collection_allowed: false }, error: null };
    }
    if (name === 'kinto_payment_provider_admin_p2') { if (args.p_action === 'emergency_stop') emergencyStop = true; return { data: { ok: true }, error: null }; }
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
  const context = { window, document, URL, confirm: () => true, prompt: () => 'return to manual safely', console };
  vm.runInNewContext(script, context, { filename: 'admin-payment-methods-g16.js' });
  domReady();
  await window.loadAdminPaymentMethodsG16();
  return { calls, elements };
}

test('saving electronic Sandbox prepares and opens P6 after the guarded P4 transition', async () => {
  const { calls, elements } = await mount({ initialMode: 'manual', effectiveMode: 'manual', transitionState: 'stable', ready: false });
  elements.g16PaymentMode.value = 'electronic';

  await elements.g16SaveRuntime.onclick();

  const names = calls.map(call => call.name + ':' + (call.args?.p_action || call.args?.p_target_mode || ''));
  assert.ok(names.includes('kinto_payment_mode_admin_g16:set_mode'));
  assert.ok(names.includes('kinto_payment_p6_simulator_admin_v1:prepare'));
  assert.ok(names.includes('kinto_payment_mode_transition_p4:electronic'));
  assert.ok(names.includes('kinto_payment_p6_simulator_admin_v1:open'));
  assert.ok(names.indexOf('kinto_payment_p6_simulator_admin_v1:prepare') < names.indexOf('kinto_payment_mode_transition_p4:electronic'));
  assert.ok(names.indexOf('kinto_payment_mode_transition_p4:electronic') < names.indexOf('kinto_payment_p6_simulator_admin_v1:open'));
  assert.match(elements.g16RuntimeStatus.textContent, /تم تجهيز المحاكي والانتقال إليه بأمان/);
});

test('saving manual runs emergency stop, safe P4 transition, then closes P6', async () => {
  const { calls, elements } = await mount({ initialMode: 'electronic', effectiveMode: 'electronic', transitionState: 'stable', ready: true });
  elements.g16PaymentMode.value = 'manual';

  await elements.g16SaveRuntime.onclick();

  const names = calls.map(call => call.name + ':' + (call.args?.p_action || call.args?.p_target_mode || ''));
  assert.ok(names.includes('kinto_payment_provider_admin_p2:emergency_stop'));
  assert.ok(names.includes('kinto_payment_mode_transition_p4:manual'));
  assert.ok(names.includes('kinto_payment_p6_simulator_admin_v1:close'));
  assert.ok(names.indexOf('kinto_payment_provider_admin_p2:emergency_stop') < names.indexOf('kinto_payment_mode_transition_p4:manual'));
  assert.ok(names.indexOf('kinto_payment_mode_transition_p4:manual') < names.indexOf('kinto_payment_p6_simulator_admin_v1:close'));
  assert.match(elements.g16RuntimeStatus.textContent, /عاد المسار اليدوي/);
});

test('an existing P4 drain cannot be bypassed by saving a Sandbox preference', async () => {
  const { calls, elements } = await mount({ initialMode: 'manual', effectiveMode: 'manual', transitionState: 'draining', ready: false });
  elements.g16PaymentMode.value = 'electronic';

  await elements.g16SaveRuntime.onclick();

  assert.ok(calls.some(call => call.name === 'kinto_payment_mode_transition_p4' && call.args.p_target_mode === 'electronic'));
  assert.ok(!calls.some(call => call.name === 'kinto_payment_mode_admin_g16' && call.args.p_action === 'set_mode'));
});
