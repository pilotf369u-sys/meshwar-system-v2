// Offline planning only. No database/network/filesystem access or deletion authority.
// Input must be an explicitly scoped export; never infer ownership from contact data.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tables = ['orders','segments','worldOrders','paymentAttempts'];
const canonical = value => typeof value === 'string' && uuid.test(value) ? value.toLowerCase() : null;
function object(value) {
  if (typeof value === 'string') { try { value = JSON.parse(value); } catch { return null; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}
export function previewTransactionalAccount(input) {
  if (!input || !canonical(input.customerId)) throw Error('INVALID_CUSTOMER');
  if (Object.keys(input).some(k => !['customerId',...tables].includes(k))) throw Error('UNKNOWN_INPUT');
  for (const table of tables) {
    if (!Array.isArray(input[table]) || input[table].length > 2000) throw Error('INCOMPLETE_OR_OVERSIZED_INPUT');
    const ids = new Set();
    for (const row of input[table]) {
      if (!object(row) || !canonical(row.id) || ids.has(canonical(row.id))) throw Error('INVALID_OR_DUPLICATE_RECORD');
      ids.add(canonical(row.id));
    }
  }
  const cid = canonical(input.customerId), findings = [];
  const add = (scope, reason, count) => { if (count) findings.push({scope, reason, count}); };
  const own = table => input[table].filter(r => canonical(r.customer_id) === cid);
  // Unresolvable links remain explicit holds; name/phone is never consulted.
  for (const table of ['orders','worldOrders','paymentAttempts']) {
    add(table,'UNRESOLVED_CUSTOMER_LINK',input[table].filter(r => !canonical(r.customer_id)).length);
  }
  const orders = own('orders'), world = own('worldOrders'), payments = own('paymentAttempts');
  const orderIds = new Set(orders.map(r => canonical(r.id)));
  const knownOrderIds = new Set(input.orders.map(r => canonical(r.id)));
  const segments = input.segments.filter(r => orderIds.has(canonical(r.order_id)));
  add('segments','UNRESOLVED_ORDER_LINK',input.segments.filter(r => !knownOrderIds.has(canonical(r.order_id))).length);
  add('orders','TRANSACTION_RETENTION_REVIEW',orders.length);
  add('orders','DETAILS_UNPARSABLE',orders.filter(r => !object(r.details)).length);
  add('segments','INVOICE_DEPENDENCY_REVIEW',segments.length);
  add('segments','SNAPSHOT_MISSING_OR_EMPTY',segments.filter(r => {const s=object(r.customer_snapshot);return !s || Object.keys(s).length===0;}).length);
  // A nonempty snapshot is NOT evidence of completeness or safe profile removal.
  add('worldOrders','CONTACT_AND_OPERATION_RETENTION_REVIEW',world.length);
  add('worldOrders','REQUEST_UNPARSABLE',world.filter(r => !object(r.request)).length);
  add('paymentAttempts','PAYMENT_RETENTION_REVIEW',payments.length);
  add('paymentAttempts','PAYMENT_OUTCOME_UNRESOLVED',payments.filter(r => !['succeeded','failed','cancelled','expired'].includes(r.status)).length);
  return {
    format:'KINTO_TRANSACTION_PREVIEW_1', offline_only:true,
    deletion_authorized:false, coverage_complete:false, production_ready:false,
    selected_counts:{orders:orders.length,segments:segments.length,worldOrders:world.length,paymentAttempts:payments.length},
    findings,
    mandatory_holds:['OTHER_TABLES_NOT_COVERED','INVOICE_FALLBACK_NOT_QUALIFIED','TRIGGERS_AND_CONCURRENCY_NOT_QUALIFIED','MEDIA_AND_BACKUPS_NOT_QUALIFIED','CURRENT_DATA_NOT_REVALIDATED']
  };
}
