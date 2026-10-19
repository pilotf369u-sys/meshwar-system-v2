import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const migration=readFileSync('supabase/migrations/20261019230000_kinto_payment_p6_preserve_manual_orders.sql','utf8');
const start=migration.indexOf('create or replace function public.kinto_payment_mode_transition_p4(');
const end=migration.indexOf('$transition$;',start);
assert.ok(start>=0 && end>start,'P4 mode-transition replacement exists');
const fn=migration.slice(start,end);

assert.match(fn,/private\.require_admin_session_v147\(p_session_token\)/,'admin session is checked server-side');
assert.match(fn,/for update/i,'mode transition serializes on the runtime row');
assert.match(fn,/transition_state='draining'/,'transition blocks new admission while switching');
assert.match(fn,/emergency_stop=true/,'return to manual requires the emergency stop');
assert.match(fn,/PAYMENT_ATTEMPTS_REQUIRE_RECONCILIATION/,'unresolved or unknown electronic attempts block switching');
assert.match(fn,/h\.status in \('active','reconciliation_required'\)/,'active and reconciliation holds block switching');
assert.match(fn,/preserved_existing_orders/,'audit and result state document legacy order preservation');
assert.doesNotMatch(fn,/MANUAL_ORDERS_REQUIRE_REVIEW/,'manual legacy orders no longer gate electronic mode');
assert.doesNotMatch(fn,/update\s+public\.orders/i,'mode switch does not mutate order status, stock, or order records');
assert.doesNotMatch(fn,/from\s+public\.orders/i,'legacy order rows are not queried during a mode switch');
assert.doesNotMatch(fn,/cancelled_order_ids|v_cancelled/i,'transition has no legacy cancellation path');
assert.match(migration,/revoke all on function public\.kinto_payment_mode_transition_p4\(text,text,uuid\[\],boolean\) from public,anon,authenticated/i);
assert.match(migration,/grant execute on function public\.kinto_payment_mode_transition_p4\(text,text,uuid\[\],boolean\) to anon,authenticated/i);


// All three mode-switch checks must catch unsettled attempts, even without stock holds.
const unresolvedGuards=[...fn.matchAll(/where a\.status in \('new','reserved','pending','reconciliation_required'\)/g)];
assert.equal(unresolvedGuards.length,3,'all transitions count new/reserved attempts with or without holds');

console.log('PASS: P6 transition preserves existing manual orders; only payment holds/reconciliation gate admission (SQL contract, no live DB write).');
