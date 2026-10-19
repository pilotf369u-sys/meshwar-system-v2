begin;
create or replace function public.kinto_payment_p5_campaign_simulate_v1(
 p_session_token text,p_attempt_id uuid,p_scenario text,p_event_key uuid,p_shipping jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $campaign_simulate$
declare cid uuid;p private.kinto_payments_p5%rowtype;a private.kinto_payment_attempts_p4%rowtype;h private.kinto_stock_holds_p4%rowtype;
 ch private.kinto_payment_campaign_holds_p5%rowtype;ev text;v_outcome text;checkout jsonb;oid uuid;ord public.orders%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 cid:=private.require_customer_review_session(p_session_token);
 if not exists(select 1 from private.kinto_payment_runtime_p5 where singleton and simulator_enabled and real_collection_allowed=false)
   or not exists(select 1 from public.kinto_payment_runtime_p2 where singleton and emergency_stop=false and selected_provider_key='kinto-simulator') then raise exception 'PAYMENT_P5_SIMULATOR_CLOSED' using errcode='55000'; end if;
 if p_scenario not in ('success','failure','cancel','unknown','disconnect') or p_event_key is null then raise exception 'PAYMENT_P5_SCENARIO_INVALID' using errcode='22023'; end if;
 select * into p from private.kinto_payments_p5 where attempt_id=p_attempt_id and payment_kind='campaign' for update;
 if not found or p.customer_id<>cid::text then raise exception 'PAYMENT_P5_NOT_FOUND' using errcode='P0002'; end if;
 if p.status='paid' then return jsonb_build_object('ok',true,'duplicate',true,'kp_number',p.kp_number,'status','paid','order_ids',p.order_ids); end if;
 select * into a from private.kinto_payment_attempts_p4 where id=p_attempt_id for update;
 select * into h from private.kinto_stock_holds_p4 where attempt_id=p_attempt_id for update;
 select * into ch from private.kinto_payment_campaign_holds_p5 where attempt_id=p_attempt_id for update;
 if a.status<>'pending' or h.status<>'active' or ch.status not in ('active','reconciliation_required') then raise exception 'PAYMENT_P5_ATTEMPT_NOT_PENDING' using errcode='55000'; end if;
 if h.expires_at<=clock_timestamp() and p_scenario='success' then raise exception 'PAYMENT_P5_HOLD_EXPIRED' using errcode='55000'; end if;
 v_outcome:=case when p_scenario='success' then 'succeeded' when p_scenario='failure' then 'failed' when p_scenario='cancel' then 'cancelled' else 'unknown' end;
 ev:='p5:'||p_attempt_id::text||':'||p_event_key::text;
 insert into private.kinto_payment_events_p4(attempt_id,provider_key,provider_event_id,outcome,evidence_digest)
   values(p_attempt_id,a.provider_key,ev,v_outcome,'server-simulator-campaign-v1') on conflict(provider_key,provider_event_id) do nothing;
 if not found and not exists(select 1 from private.kinto_payment_events_p4 where provider_key=a.provider_key and provider_event_id=ev and attempt_id=p_attempt_id and outcome=v_outcome) then
   raise exception 'PAYMENT_P5_EVENT_REPLAY_MISMATCH' using errcode='23505'; end if;
 if v_outcome in ('failed','cancelled') then
   update private.kinto_payment_attempts_p4 set status=v_outcome,updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='released',released_at=clock_timestamp(),release_reason='p5_campaign_'||v_outcome where id=h.id;
   update private.kinto_payment_campaign_holds_p5 set status='released',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   update private.kinto_payments_p5 set status=v_outcome,updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status',v_outcome,'real_collection_allowed',false);
 elsif v_outcome='unknown' then
   update private.kinto_payment_attempts_p4 set status='reconciliation_required',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required' where id=h.id;
   update private.kinto_payment_campaign_holds_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   update private.kinto_payments_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status','reconciliation_required','message','جارٍ التحقق','hold_retained',true);
 end if;
 begin
   insert into private.kinto_payment_finalize_permits_p5(transaction_id,attempt_id,customer_id) values(txid_current(),p_attempt_id,cid::text);
   checkout:=public.kinto_deals_v1_checkout_no_gift_g5d(p_session_token,
     (p.quote_snapshot->>'campaign_id')::uuid,gen_random_uuid(),coalesce(p_shipping,'{}'::jsonb),p.quote_snapshot->'input_items');
   oid:=(checkout->'deal'->>'order_id')::uuid;
   if oid is null then raise exception 'PAYMENT_P5_CAMPAIGN_ORDER_MISSING'; end if;
   select * into ord from public.orders where id=oid for update;
   if not found or ord.customer_id<>cid::text or ord.currency<>p.currency or ord.total_price::numeric<>p.amount then
     raise exception 'PAYMENT_P5_CAMPAIGN_CANONICAL_TOTAL_MISMATCH'; end if;
   update public.orders set status='بانتظار الدفع' where id=oid and customer_id=cid::text;
   if not found then raise exception 'PAYMENT_P5_CAMPAIGN_WAITING_TRANSITION_FAILED'; end if;
   insert into private.kinto_paid_transition_permits_v1(transaction_id,order_id) values(txid_current(),oid);
   update public.orders set status='تم التسديد' where id=oid and customer_id=cid::text;
   if not found then raise exception 'PAYMENT_P5_CAMPAIGN_PAID_TRANSITION_FAILED'; end if;
   delete from private.kinto_paid_transition_permits_v1 where transaction_id=txid_current() and order_id=oid;
   delete from private.kinto_payment_finalize_permits_p5 where transaction_id=txid_current() and attempt_id=p_attempt_id;
   update private.kinto_payment_attempts_p4 set status='succeeded',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='consumed',released_at=clock_timestamp(),release_reason='p5_campaign_finalized' where id=h.id;
   update private.kinto_payment_campaign_holds_p5 set status='consumed',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   update private.kinto_payments_p5 set status='paid',order_ids=array[oid],updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status','paid','order_ids',array[oid],'checkout',checkout,'real_collection_allowed',false);
 exception when others then
   update private.kinto_payment_attempts_p4 set status='reconciliation_required',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required' where id=h.id;
   update private.kinto_payment_campaign_holds_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   update private.kinto_payments_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',false,'kp_number',p.kp_number,'status','reconciliation_required','error',sqlerrm,'hold_retained',true);
 end;
end;$campaign_simulate$;
revoke all on function public.kinto_payment_p5_campaign_simulate_v1(text,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_campaign_simulate_v1(text,uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
