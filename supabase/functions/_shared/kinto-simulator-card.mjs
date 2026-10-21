// KINTO's no-charge simulator accepts exactly one published test card.
// This module validates only; callers must never persist or log the input.
/** @param {unknown} card */
export function isKintoSimulatorCard(card) {
  if (!card || typeof card !== 'object' || Array.isArray(card)) return false;
  const number = String(card.number ?? '').replace(/[\s-]/g, '');
  const expiry = String(card.expiry ?? '').trim();
  const cvv = String(card.cvv ?? '').trim();
  return number === '4242424242424242' && expiry === '12/30' && cvv === '123';
}

/** @param {unknown} scenario */
export function isSimulatorFailureScenario(scenario) {
  return ['failure', 'cancel', 'unknown', 'disconnect'].includes(String(scenario));
}
