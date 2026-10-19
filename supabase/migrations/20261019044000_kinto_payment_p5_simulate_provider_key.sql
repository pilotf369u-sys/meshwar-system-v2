-- Align the simulator admission check with P2 provider key kinto-simulator.
begin;
create or replace function public.kinto_payment_p5_simulate_v1(p_session_token text,p_attempt_id uuid,p_scenario text,p_event_key uuid,p_shipping jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $simulate$
declare cid uuid; p private.kinto_payments_p5%rowtype; a private.kinto_payment_attempts_p4%rowtype; h private.kinto_stock_holds_p4%rowtype;
 v_outcome text; ev text; result jsonb; checkout jsonb; oid uuid; o record; cp jsonb; points bigint; paid_ids uuid[]:='{}'; coupon record;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 cid:=private.require_customer_review_session(p_session_token);
 if not exists(select 1 from private.kinto_payment_runtime_p5 where singleton and simulator_enabled and real_collection_allowed=false)
   or not exists(select 1 from public.kinto_payment_runtime_p2 where singleton and emergency_stop=false and selected_provider_key='kinto-simulator') then raise exception 'PAYMENT_P5_SIMULATOR_CLOSED' using errcode='55000'; end if;
 if p_scenario not in ('success','failure','cancel','unknown','disconnect') or p_event_key is null then raise exception 'PAYMENT_P5_SCENARIO_INVALID' using errcode='22023'; end if;
 select * into p from private.kinto_payments_p5 where attempt_id=p_attempt_id for update;
 if not found or p.customer_id<>cid::text then raise exception 'PAYMENT_P5_NOT_FOUND' using errcode='P0002'; end if;
 if p.status='paid' then return jsonb_build_object('ok',true,'duplicate',true,'kp_number',p.kp_number,'status','paid','order_ids',p.order_ids); end if;
 select * into a from private.kinto_payment_attempts_p4 where id=p_attempt_id for update;
 select * into h from private.kinto_stock_holds_p4 where attempt_id=p_attempt_id for update;
 if a.status<>'pending' or h.status<>'active' then raise exception 'PAYMENT_P5_ATTEMPT_NOT_PENDING' using errcode='55000'; end if;
 if h.expires_at<=clock_timestamp() and p_scenario in ('success') then raise exception 'PAYMENT_P5_HOLD_EXPIRED' using errcode='55000'; end if;
 v_outcome:=case when p_scenario='success' then 'succeeded' when p_scenario='failure' then 'failed' when p_scenario='cancel' then 'cancelled' else 'unknown' end;
 ev:='p5:'||p_attempt_id::text||':'||p_event_key::text;
 insert into private.kinto_payment_events_p4(attempt_id,provider_key,provider_event_id,outcome,evidence_digest)
 values(p_attempt_id,a.provider_key,ev,v_outcome,'server-simulator-v1') on conflict(provider_key,provider_event_id) do nothing;
 if not found and not exists(select 1 from private.kinto_payment_events_p4 where provider_key=a.provider_key and provider_event_id=ev and attempt_id=p_attempt_id and outcome=v_outcome) then
   raise exception 'PAYMENT_P5_EVENT_REPLAY_MISMATCH' using errcode='23505'; end if;
 if v_outcome in ('failed','cancelled') then
   update private.kinto_payment_attempts_p4 set status=v_outcome,updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='released',released_at=clock_timestamp(),release_reason='server_simulator_'||v_outcome where id=h.id;
   delete from private.kinto_payment_coupon_holds_p5 where attempt_id=p_attempt_id;
   update private.kinto_payments_p5 set status=v_outcome,updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status',v_outcome,'real_collection_allowed',false);
 elsif v_outcome='unknown' then
   update private.kinto_payment_attempts_p4 set status='reconciliation_required',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required' where id=h.id;
   update private.kinto_payments_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status','reconciliation_required','message','جارٍ التحقق','hold_retained',true);
 end if;
 begin
   insert into private.kinto_payment_finalize_permits_p5(transaction_id,attempt_id,customer_id) values(txid_current(),p_attempt_id,cid::text);
   checkout:=public.kinto_checkout_session_v1(p_session_token,coalesce(p_shipping,'{}'::jsonb),p.quote_snapshot->'input_items');
   if jsonb_array_length(coalesce(checkout->'orders','[]'::jsonb))<1 then raise exception 'PAYMENT_P5_CHECKOUT_EMPTY'; end if;
   for o in select (x->>'id')::uuid id,x->>'store_id' store_id from jsonb_array_elements(checkout->'orders') x loop
     oid:=o.id; update public.orders set status='بانتظار الدفع' where id=oid;
     points:=coalesce((p.quote_snapshot->'coupon_points'->>o.store_id)::bigint,0);
     if points>0 then
       perform 1 from public.kinto_loyalty_coupons q join private.kinto_payment_coupon_holds_p5 ch on ch.coupon_id=q.id
         where ch.attempt_id=p_attempt_id and ch.store_id=o.store_id for update of q;
       delete from private.kinto_payment_coupon_holds_p5 where attempt_id=p_attempt_id and store_id=o.store_id;
       perform public.customer_apply_coupon_v310(p_session_token,oid::text,points);
     end if;
     insert into private.kinto_paid_transition_permits_v1(transaction_id,order_id) values(txid_current(),oid);
     paid_ids:=array_append(paid_ids,oid);
   end loop;
   update public.orders set status='تم التسديد' where id=any(paid_ids) and customer_id=cid::text;
   if cardinality(paid_ids)<>jsonb_array_length(checkout->'orders') then raise exception 'PAYMENT_P5_FINALIZE_ORDER_MISMATCH'; end if;
   delete from private.kinto_paid_transition_permits_v1 where transaction_id=txid_current() and order_id=any(paid_ids);
   delete from private.kinto_payment_finalize_permits_p5 where transaction_id=txid_current() and attempt_id=p_attempt_id;
   update private.kinto_payment_attempts_p4 set status='succeeded',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='consumed',released_at=clock_timestamp(),release_reason='p5_simulator_finalized' where id=h.id;
   update private.kinto_payments_p5 set status='paid',order_ids=paid_ids,updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',true,'kp_number',p.kp_number,'status','paid','order_ids',paid_ids,'checkout',checkout,'real_collection_allowed',false);
 exception when others then
   update private.kinto_payment_attempts_p4 set status='reconciliation_required',updated_at=clock_timestamp() where id=p_attempt_id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required' where id=h.id;
   update private.kinto_payments_p5 set status='reconciliation_required',updated_at=clock_timestamp() where attempt_id=p_attempt_id;
   return jsonb_build_object('ok',false,'kp_number',p.kp_number,'status','reconciliation_required','error',sqlerrm,'hold_retained',true);
 end;
end;$simulate$;
revoke all on function public.kinto_payment_p5_simulate_v1(text,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_simulate_v1(text,uuid,text,uuid,jsonb) to service_role;
commit;
