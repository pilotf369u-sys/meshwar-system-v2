-- Close the temporary Payment-P5 simulator setup on KINTO-Payment-Test only.
-- Run only after the manual browser test. Never run on the original project.
-- This script refuses to close while any stock/campaign hold or payment outcome
-- is unresolved, so unknown results must be reconciled first.
begin;

do $close_p5$
declare
  v_actor constant text := 'owner-authorized-temporary-p5-test';
  v_from_mode text;
  v_selected text;
  v_emergency boolean;
  v_enabled boolean;
  v_count bigint;
begin
  select effective_mode into v_from_mode
    from private.kinto_payment_runtime_p4 where singleton=true for update;
  if not found then raise exception 'P4_RUNTIME_MISSING'; end if;

  select selected_provider_key, emergency_stop into v_selected, v_emergency
    from public.kinto_payment_runtime_p2 where singleton=true for update;
  if not found then raise exception 'P2_RUNTIME_MISSING'; end if;

  select enabled into v_enabled
    from public.kinto_payment_providers_p2 where provider_key='kinto-simulator' for update;
  if not found then raise exception 'P2_SIMULATOR_PROVIDER_MISSING'; end if;

  select count(*) into v_count
    from private.kinto_stock_holds_p4
   where status in ('active','reconciliation_required');
  if v_count>0 then raise exception 'P5_CLOSE_BLOCKED_ACTIVE_OR_UNKNOWN_STOCK_HOLDS:%',v_count; end if;

  select count(*) into v_count
    from private.kinto_payment_attempts_p4
   where status in ('pending','reconciliation_required');
  if v_count>0 then raise exception 'P5_CLOSE_BLOCKED_UNRESOLVED_PAYMENT_ATTEMPTS:%',v_count; end if;

  select count(*) into v_count
    from private.kinto_payment_campaign_holds_p5
   where status in ('active','reconciliation_required');
  if v_count>0 then raise exception 'P5_CLOSE_BLOCKED_ACTIVE_OR_UNKNOWN_CAMPAIGN_HOLDS:%',v_count; end if;

  -- Block new attempts first. Real collection remains false by schema/guard.
  update public.kinto_payment_runtime_p2
     set emergency_stop=true,
         emergency_reason='Temporary P5 test closed; manual mode restored.',
         emergency_actor=v_actor,
         emergency_changed_at=clock_timestamp(),
         updated_at=clock_timestamp()
   where singleton=true;
  insert into public.kinto_payment_provider_audit_p2(actor_id,action,provider_key,old_value,new_value)
  values(v_actor,'emergency_stop',v_selected,
    jsonb_build_object('emergency_stop',v_emergency,'selected_provider_key',v_selected),
    jsonb_build_object('emergency_stop',true,'reason','Temporary P5 test closed'));

  update public.kinto_payment_runtime_p5
     set simulator_enabled=false,real_collection_allowed=false,updated_at=clock_timestamp()
   where singleton=true;

  update public.kinto_payment_providers_p2
     set enabled=false,updated_at=clock_timestamp()
   where provider_key='kinto-simulator';
  if v_enabled then
    insert into public.kinto_payment_provider_audit_p2(actor_id,action,provider_key,old_value,new_value)
    values(v_actor,'provider_disabled','kinto-simulator',
      jsonb_build_object('enabled',true),jsonb_build_object('enabled',false));
  end if;

  update public.kinto_payment_runtime_p2
     set selected_provider_key=null,updated_at=clock_timestamp()
   where singleton=true and selected_provider_key is not null;
  if v_selected is not null then
    insert into public.kinto_payment_provider_audit_p2(actor_id,action,provider_key,old_value,new_value)
    values(v_actor,'provider_selected',v_selected,
      jsonb_build_object('selected_provider_key',v_selected),
      jsonb_build_object('selected_provider_key',null));
  end if;

  update public.kinto_payment_settings_g16
     set payment_mode='manual',gateways_enabled=false,updated_at=clock_timestamp()
   where singleton=true;
  insert into public.kinto_payment_settings_audit_g16(actor_id,action,old_value,new_value)
  values(v_actor,'payment_mode','electronic','manual');

  update private.kinto_payment_runtime_p4
     set effective_mode='manual',transition_state='stable',target_mode=null,
         electronic_admission_ready=false,updated_at=clock_timestamp(),updated_by=v_actor
   where singleton=true;
  insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
  values(v_actor,coalesce(v_from_mode,'electronic'),'manual','completed',
    jsonb_build_object('temporary_p5_test_closed',true,'real_collection_allowed',false,
      'active_stock_holds',0,'unresolved_attempts',0,'active_campaign_holds',0));

  -- Revoke and remove only the one-time P5 test administrator created by the
  -- protected preview. This does not touch any pre-existing KINTO account.
  update public.admin_sessions_v147 s
     set revoked_at=clock_timestamp()
    from private.kinto_payment_p5_test_admin_bootstrap b
   where b.singleton=true and b.admin_id is not null
     and s.admin_id=b.admin_id and s.revoked_at is null;
  delete from public.employees e
   using private.kinto_payment_p5_test_admin_bootstrap b
   where b.singleton=true and b.admin_id is not null and e.id::text=b.admin_id;
  update private.kinto_payment_p5_test_admin_bootstrap
     set enabled=false,closed_at=coalesce(closed_at,clock_timestamp())
   where singleton=true;
end;
$close_p5$;

commit;

-- Read-only verification after the close transaction:
select payment_mode,gateways_enabled from public.kinto_payment_settings_g16 where singleton=true;
select effective_mode,transition_state,electronic_admission_ready from private.kinto_payment_runtime_p4 where singleton=true;
select emergency_stop,selected_provider_key from public.kinto_payment_runtime_p2 where singleton=true;
select enabled,test_only,integration_ready,real_collection_allowed from public.kinto_payment_providers_p2 where provider_key='kinto-simulator';
select simulator_enabled,real_collection_allowed from private.kinto_payment_runtime_p5 where singleton=true;
select enabled,admin_id is null as admin_removed,closed_at is not null as bootstrap_closed
  from private.kinto_payment_p5_test_admin_bootstrap where singleton=true;
