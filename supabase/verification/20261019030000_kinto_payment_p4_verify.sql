-- Read-only Payment-P4 post-deploy verification. Never run against production
-- until separately approved. Each query returns state only; there are no writes.
select to_regclass('private.kinto_payment_runtime_p4') as runtime_table,
       to_regclass('private.kinto_payment_attempts_p4') as attempts_table,
       to_regclass('private.kinto_stock_holds_p4') as holds_table,
       to_regclass('private.kinto_stock_hold_lines_p4') as hold_lines_table,
       to_regclass('private.kinto_payment_events_p4') as provider_events_table;

select p.oid::regprocedure as function_signature,
       p.prosecdef as security_definer,
       p.proconfig as function_settings
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('kinto_payment_mode_transition_p4','kinto_payment_attempt_reserve_p4',
                    'kinto_payment_attempt_mark_pending_p4','kinto_payment_attempt_event_p4','kinto_payment_attempt_expire_p4',
                    'kinto_payment_attempt_reconcile_p4','kinto_payment_p4_admin_read','kinto_payment_p4_attempt_read_admin');

select c.relname as table_name,c.relrowsecurity as rls_enabled,
       has_table_privilege('anon',c.oid,'select') as anon_can_select,
       has_table_privilege('authenticated',c.oid,'select') as authenticated_can_select,
       has_table_privilege('anon',c.oid,'insert') as anon_can_insert,
       has_table_privilege('authenticated',c.oid,'insert') as authenticated_can_insert
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='private' and c.relname in (
 'kinto_payment_runtime_p4','kinto_payment_attempts_p4','kinto_stock_holds_p4',
 'kinto_stock_hold_lines_p4','kinto_payment_events_p4','kinto_payment_mode_audit_p4','kinto_payment_reconciliation_audit_p4')
order by c.relname;

select t.tgname,pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where t.tgrelid='public.orders'::regclass and not t.tgisinternal
  and t.tgname in ('trg_kinto_payment_p4_order_insert_gate','trg_kinto_payment_p4_paid_mode_gate')
order by t.tgname;

select effective_mode,transition_state,target_mode,electronic_admission_ready,updated_at
from private.kinto_payment_runtime_p4 where singleton=true;

select (select count(*) from private.kinto_payment_attempts_p4) as attempt_count,
       (select count(*) from private.kinto_stock_holds_p4) as hold_count,
       (select count(*) from private.kinto_payment_events_p4) as provider_event_count,
       (select count(*) from private.kinto_payment_mode_audit_p4) as mode_audit_count,
       (select count(*) from private.kinto_payment_reconciliation_audit_p4) as reconciliation_audit_count,
       (select emergency_stop from public.kinto_payment_runtime_p2 where singleton=true) as p2_emergency_stop,
       (select payment_mode from public.kinto_payment_settings_g16 where singleton=true) as configured_payment_mode;
