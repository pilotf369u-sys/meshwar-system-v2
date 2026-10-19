begin;

-- Preserve existing manual orders during payment-mode changes.
-- Historical/manual order lifecycle is independent from admission mode for new checkouts.
-- Payment attempts and active/reconciliation holds remain the only electronic blockers.
create or replace function public.kinto_payment_mode_transition_p4(
 p_session_token text,
 p_target_mode text,
 p_verified_unpaid_order_ids uuid[] default '{}',
 p_admin_confirmed_no_payment boolean default false
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $transition$
declare
 v_admin text;
 ctl private.kinto_payment_runtime_p4%rowtype;
 v_from text;
 v_holds jsonb;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then
   raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000';
 end if;
 if p_target_mode is null or p_target_mode not in ('manual','electronic') then
   raise exception 'INVALID_PAYMENT_MODE' using errcode='22023';
 end if;

 select * into ctl
   from private.kinto_payment_runtime_p4
  where singleton=true
  for update;
 if not found then raise exception 'PAYMENT_P4_MODE_NOT_CONFIGURED' using errcode='55000'; end if;
 v_from:=ctl.effective_mode;

 -- Keep the arguments for RPC compatibility with older clients. They are
 -- intentionally ignored: changing the mode never cancels or edits old orders.
 if ctl.transition_state='stable' and ctl.effective_mode=p_target_mode then
   update public.kinto_payment_settings_g16
      set payment_mode=p_target_mode,updated_at=clock_timestamp()
    where singleton=true;
   return jsonb_build_object('ok',true,'effective_mode',ctl.effective_mode,
     'transition_state','stable','changed',false,'preserved_existing_orders',true,
     'real_collection_allowed',false);
 end if;

 -- Abandoning an electronic drain is safe only with the electronic kill switch
 -- on and no outstanding reservation or provider result needing reconciliation.
 if ctl.transition_state='draining' and ctl.target_mode='electronic' and p_target_mode='manual' then
   if not exists(select 1 from public.kinto_payment_runtime_p2
                  where singleton=true and emergency_stop=true) then
     return jsonb_build_object('ok',false,'error','EMERGENCY_STOP_REQUIRED',
       'effective_mode',ctl.effective_mode,'transition_state',ctl.transition_state,
       'real_collection_allowed',false);
   end if;
   select coalesce(jsonb_agg(jsonb_build_object('attempt_id',a.id,'status',a.status,
       'hold_status',h.status,'expires_at',h.expires_at) order by a.created_at,a.id),'[]'::jsonb)
     into v_holds
     from private.kinto_payment_attempts_p4 a
     left join private.kinto_stock_holds_p4 h on h.attempt_id=a.id
    where a.status in ('new','reserved','pending','reconciliation_required')
       or (a.status='succeeded' and h.status in ('active','reconciliation_required'))
       or h.status in ('active','reconciliation_required');
   if jsonb_array_length(v_holds)>0 then
     insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
       values(v_admin,v_from,'manual','draining',jsonb_build_object('aborted_target','electronic',
         'unresolved_attempts',v_holds));
     return jsonb_build_object('ok',false,'state','draining',
       'error','PAYMENT_ATTEMPTS_REQUIRE_RECONCILIATION','attempts',v_holds,
       'effective_mode',ctl.effective_mode,'real_collection_allowed',false);
   end if;
   update private.kinto_payment_runtime_p4
      set effective_mode='manual',transition_state='stable',target_mode=null,
          updated_at=clock_timestamp(),updated_by=v_admin
    where singleton=true
    returning * into ctl;
   update public.kinto_payment_settings_g16
      set payment_mode='manual',updated_at=clock_timestamp()
    where singleton=true;
   insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
     values(v_admin,v_from,'manual','completed',jsonb_build_object(
       'aborted_target','electronic','preserved_existing_orders',true));
   return jsonb_build_object('ok',true,'effective_mode','manual',
     'transition_state','stable','aborted_transition',true,
     'preserved_existing_orders',true,'real_collection_allowed',false);
 end if;

 if p_target_mode='electronic' then
   if not ctl.electronic_admission_ready then
     insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
       values(v_admin,v_from,p_target_mode,'blocked',
         jsonb_build_object('reason','ELECTRONIC_ADMISSION_NOT_READY'));
     return jsonb_build_object('ok',false,'error','ELECTRONIC_ADMISSION_NOT_READY',
       'effective_mode',ctl.effective_mode,'real_collection_allowed',false);
   end if;
   if ctl.transition_state='stable' then
     update private.kinto_payment_runtime_p4
        set transition_state='draining',target_mode='electronic',
            updated_at=clock_timestamp(),updated_by=v_admin
      where singleton=true
      returning * into ctl;
   elsif ctl.target_mode is distinct from 'electronic' then
     raise exception 'PAYMENT_P4_DIFFERENT_TRANSITION_ACTIVE' using errcode='55000';
   end if;

   -- Block only payment work that can reserve stock or represent a charge.
   -- Legacy/manual orders, including fulfillment-stage orders, are preserved and
   -- never participate in this admission transition.
   select coalesce(jsonb_agg(jsonb_build_object('attempt_id',a.id,'status',a.status,
       'hold_status',h.status,'expires_at',h.expires_at) order by a.created_at,a.id),'[]'::jsonb)
     into v_holds
     from private.kinto_payment_attempts_p4 a
     left join private.kinto_stock_holds_p4 h on h.attempt_id=a.id
    where a.status in ('new','reserved','pending','reconciliation_required')
       or (a.status='succeeded' and h.status in ('active','reconciliation_required'))
       or h.status in ('active','reconciliation_required');
   if jsonb_array_length(v_holds)>0 then
     insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
       values(v_admin,v_from,p_target_mode,'draining',
         jsonb_build_object('unresolved_attempts',v_holds,'preserved_existing_orders',true));
     return jsonb_build_object('ok',false,'state','draining',
       'error','PAYMENT_ATTEMPTS_REQUIRE_RECONCILIATION','attempts',v_holds,
       'effective_mode',ctl.effective_mode,'preserved_existing_orders',true,
       'real_collection_allowed',false);
   end if;

   update private.kinto_payment_runtime_p4
      set effective_mode='electronic',transition_state='stable',target_mode=null,
          updated_at=clock_timestamp(),updated_by=v_admin
    where singleton=true
    returning * into ctl;
   update public.kinto_payment_settings_g16
      set payment_mode='electronic',updated_at=clock_timestamp()
    where singleton=true;
   insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
     values(v_admin,v_from,p_target_mode,'completed',
       jsonb_build_object('preserved_existing_orders',true,
         'real_collection_allowed',false,'note','P2 emergency stop remains authoritative'));
   return jsonb_build_object('ok',true,'effective_mode','electronic',
     'transition_state','stable','preserved_existing_orders',true,
     'real_collection_allowed',false);
 end if;

 -- Returning to manual: electronic admission stops before any reservation changes.
 if not exists(select 1 from public.kinto_payment_runtime_p2
                where singleton=true and emergency_stop=true) then
   return jsonb_build_object('ok',false,'error','EMERGENCY_STOP_REQUIRED',
     'effective_mode',ctl.effective_mode,'transition_state',ctl.transition_state,
     'real_collection_allowed',false);
 end if;
 if ctl.transition_state='stable' then
   update private.kinto_payment_runtime_p4
      set transition_state='draining',target_mode='manual',
          updated_at=clock_timestamp(),updated_by=v_admin
    where singleton=true
    returning * into ctl;
 elsif ctl.target_mode is distinct from 'manual' then
   raise exception 'PAYMENT_P4_DIFFERENT_TRANSITION_ACTIVE' using errcode='55000';
 end if;

 -- These attempts have not reached the provider, so their logical holds can
 -- be safely released. Pending or ambiguous attempts are retained for review.
 update private.kinto_payment_attempts_p4 a
    set status='cancelled',updated_at=clock_timestamp()
   from private.kinto_stock_holds_p4 h
  where h.attempt_id=a.id and h.status='active'
    and a.status in ('new','reserved');
 update private.kinto_stock_holds_p4 h
    set status='released',released_at=clock_timestamp(),release_reason='mode_switch_manual'
   from private.kinto_payment_attempts_p4 a
  where a.id=h.attempt_id and h.status='active' and a.status='cancelled';

 select coalesce(jsonb_agg(jsonb_build_object('attempt_id',a.id,'status',a.status,
       'hold_status',h.status,'expires_at',h.expires_at) order by a.created_at,a.id),'[]'::jsonb)
   into v_holds
   from private.kinto_payment_attempts_p4 a
   left join private.kinto_stock_holds_p4 h on h.attempt_id=a.id
  where a.status in ('new','reserved','pending','reconciliation_required')
     or (a.status='succeeded' and h.status in ('active','reconciliation_required'))
     or h.status in ('active','reconciliation_required');
 if jsonb_array_length(v_holds)>0 then
   insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
     values(v_admin,v_from,p_target_mode,'draining',
       jsonb_build_object('unresolved_attempts',v_holds,'preserved_existing_orders',true));
   return jsonb_build_object('ok',false,'state','draining',
     'error','PAYMENT_ATTEMPTS_REQUIRE_RECONCILIATION','attempts',v_holds,
     'effective_mode',ctl.effective_mode,'preserved_existing_orders',true,
     'real_collection_allowed',false);
 end if;

 update private.kinto_payment_runtime_p4
    set effective_mode='manual',transition_state='stable',target_mode=null,
        updated_at=clock_timestamp(),updated_by=v_admin
  where singleton=true
  returning * into ctl;
 update public.kinto_payment_settings_g16
    set payment_mode='manual',updated_at=clock_timestamp()
  where singleton=true;
 insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
   values(v_admin,v_from,p_target_mode,'completed',
     jsonb_build_object('released_unsent_reservations',true,'preserved_existing_orders',true));
 return jsonb_build_object('ok',true,'effective_mode','manual',
   'transition_state','stable','preserved_existing_orders',true,
   'real_collection_allowed',false);
end;
$transition$;

revoke all on function public.kinto_payment_mode_transition_p4(text,text,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.kinto_payment_mode_transition_p4(text,text,uuid[],boolean) to anon,authenticated;
comment on function public.kinto_payment_mode_transition_p4(text,text,uuid[],boolean) is
 'Changes admission mode for new checkouts only. Existing manual orders retain status and fulfillment lifecycle; unresolved electronic attempts and holds still block unsafe transitions.';

notify pgrst,'reload schema';
commit;
