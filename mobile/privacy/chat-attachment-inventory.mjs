// Offline review aid only. No network, database mutation or deletion authorization.
// Inputs must be a coherent authorized export; this module cannot establish coverage.
export function attachmentKey(value, storageOrigin) {
 if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\\]/.test(value)) return null;
 try {
  const origin = new URL(storageOrigin);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return null;
  // Inspect raw path before URL normalization can hide traversal.
  const raw = value.split(/[?#]/, 1)[0];
  if (/%(?:2f|5c|25|00)/i.test(raw) || raw.split('/').some(x => { try { return ['.', '..'].includes(decodeURIComponent(x)); } catch { return true; } })) return null;
  const url = new URL(value);
  if (url.origin !== origin.origin || url.username || url.password || url.hash) return null;
  const match = url.pathname.match(/^\/storage\/v1\/object\/(?:public|sign|authenticated)\/chat-attachments\/(.+)$/);
  if (!match) return null;
  const key = decodeURIComponent(match[1]);
  if (!key || key.split('/').some(x => !x || x === '.' || x === '..') || /[\u0000-\u001f\u007f\\%]/.test(key)) return null;
  return key;
 } catch { return null; }
}
export function inventoryAttachments({ customerId, messages, protectedReferences, storageOrigin }) {
 if (typeof customerId !== 'string' || !customerId || !Array.isArray(messages) || !Array.isArray(protectedReferences)) throw Error('INVALID_INVENTORY');
 const rows = messages.filter(x => x.customer_id === customerId && x.file_url);
 return rows.map(row => {
  const key = attachmentKey(row.file_url, storageOrigin);
  const holds = ['COVERAGE_NOT_VERIFIED', 'HUMAN_RETENTION_REVIEW_REQUIRED', 'UPLOAD_QUIESCENCE_NOT_VERIFIED'];
  if (!key) holds.push('UNRESOLVED_REFERENCE');
  else {
   if (messages.some(x => x !== row && attachmentKey(x.file_url, storageOrigin) === key)) holds.push('SHARED_MESSAGE_REFERENCE');
   if (protectedReferences.some(x => attachmentKey(x.url, storageOrigin) === key)) holds.push('PROTECTED_OPERATIONAL_REFERENCE');
   if (messages.some(x => x.file_url && attachmentKey(x.file_url, storageOrigin) === null) || protectedReferences.some(x => attachmentKey(x.url, storageOrigin) === null)) holds.push('UNRESOLVED_OTHER_REFERENCE');
  }
  // Do not emit signed URLs, message bodies, contacts or object keys into reports.
  return { message_id: typeof row.id === 'string' ? row.id : null, holds, deletion_authorized: false, account_deleted: false };
 });
}
