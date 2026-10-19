-- Safe rollback for Payment-P4. This intentionally refuses to delete any attempt,
-- event, reservation, or transition audit. Resolve/export records before a separate
-- reviewed archival rollback. Never run against production without explicit approval.
begin;

do $rollback_guard$
begin
  if to_regclass('private.kinto_payment_runtime_p4') is null then
    raise notice 'Payment-P4 runtime is absent; nothing to roll back.';
    return;
  end if;
  if exists(select 1 from private.kinto_payment_runtime_p4
      where effective_mode<>'manual' or transition_state<>'stable' or target_mode is not null) then
    raise exception 'P4_ROLLBACK_BLOCKED_NON_MANUAL_OR_TRANSITIONING_MODE';
  end if;
  if exists(select 1 from private.kinto_payment_attempts_p4)
     or exists(select 1 from private.kinto_stock_holds_p4)
     or exists(select 1 from private.kinto_payment_events_p4)
     or exists(select 1 from private.kinto_payment_mode_audit_p4)
     or exists(select 1 from private.kinto_payment_reconciliation_audit_p4) then
    raise exception 'P4_ROLLBACK_BLOCKED_RETAIN_ATTEMPT_AND_AUDIT_DATA';
  end if;
end;
$rollback_guard$;

drop trigger if exists trg_kinto_payment_p4_order_insert_gate on public.orders;
drop trigger if exists trg_kinto_payment_p4_paid_mode_gate on public.orders;
drop function if exists private.kinto_payment_hold_gate_p4();
drop function if exists private.kinto_payment_paid_mode_gate_p4();
drop function if exists public.kinto_payment_mode_transition_p4(text,text,uuid[],boolean);
drop function if exists public.kinto_payment_attempt_reserve_p4(uuid,text,text,numeric,jsonb,jsonb);
drop function if exists public.kinto_payment_attempt_mark_pending_p4(uuid,text);
drop function if exists public.kinto_payment_attempt_event_p4(uuid,text,text,text,text);
drop function if exists public.kinto_payment_attempt_reconcile_p4(text,uuid,text,text);
drop function if exists public.kinto_payment_attempt_expire_p4(integer);
drop function if exists public.kinto_payment_p4_admin_read(text);
drop function if exists public.kinto_payment_p4_attempt_read_admin(text,uuid);
drop function if exists private.kinto_payment_options_valid_p4(jsonb,jsonb);
drop table if exists private.kinto_payment_mode_audit_p4;
drop table if exists private.kinto_payment_reconciliation_audit_p4;
drop table if exists private.kinto_payment_events_p4;
drop table if exists private.kinto_stock_hold_lines_p4;
drop table if exists private.kinto_stock_holds_p4;
drop table if exists private.kinto_payment_attempts_p4;
drop table if exists private.kinto_payment_runtime_p4;

commit;
