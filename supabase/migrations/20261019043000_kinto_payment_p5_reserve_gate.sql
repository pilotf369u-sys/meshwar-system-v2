-- Correct P5 admission to use the existing P2 simulator key.
begin;
create or replace function public.kinto_payment_p5_reserve_v1(p_session_token text,p_idempotency_key text,p_items jsonb,p_coupon_points jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $p5reserve$
declare cid uuid; q jsonb; a jsonb; old_q jsonb; attempt uuid; kp text; old_status text; store_row record; pts bigint; unit bigint; need integer; c record; got integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 cid:=private.require_customer_review_session(p_session_token); if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text||':'||p_idempotency_key,0));
 if exists(select 1 from private.kinto_payment_attempts_p4 old where old.customer_id=cid::text and old.idempotency_key=p_idempotency_key) then
   select p.attempt_id,p.kp_number,p.status,p.quote_snapshot into attempt,kp,old_status,old_q
     from private.kinto_payments_p5 p join private.kinto_payment_attempts_p4 x on x.id=p.attempt_id
     where x.customer_id=cid::text and x.idempotency_key=p_idempotency_key;
   return jsonb_build_object('ok',true,'attempt_id',attempt,'kp_number',kp,'status',old_status,'reused',true,'quote',old_q);
 end if;
 if not exists(select 1 from private.kinto_payment_runtime_p5 where singleton and simulator_enabled and real_collection_allowed=false)
   or not exists(select 1 from private.kinto_payment_runtime_p4 where singleton and electronic_admission_ready and effective_mode='electronic' and transition_state='stable')
   or not exists(select 1 from public.kinto_payment_runtime_p2 where singleton and emergency_stop=false and selected_provider_key='kinto-simulator') then
   raise exception 'PAYMENT_P5_NOT_AVAILABLE' using errcode='55000'; end if;
 q:=private.kinto_payment_p5_quote_v1(cid,p_items,p_coupon_points);
 a:=public.kinto_payment_attempt_reserve_p4(cid,p_idempotency_key,q->>'currency',(q->>'amount')::numeric,
   q||jsonb_build_object('lines',q->'lines'),q->'lines');
 attempt:=(a->>'attempt_id')::uuid;
 kp:='KP-'||lpad(nextval('private.kinto_payment_kp_number_p5')::text,9,'0');
 insert into private.kinto_payments_p5(attempt_id,kp_number,customer_id,currency,amount,status,quote_snapshot)
 values(attempt,kp,cid::text,q->>'currency',(q->>'amount')::numeric,'reserved',q)
 on conflict(attempt_id) do update set updated_at=clock_timestamp()
 returning kp_number into kp;
 select coupon_unit into unit from public.kinto_loyalty_settings where id=1;
 for store_row in select distinct (x->>'store_id')::uuid store_id from jsonb_array_elements(q->'lines') x loop
   pts:=coalesce((q->'coupon_points'->>store_row.store_id::text)::bigint,0);
   if pts>0 then
     need:=(pts/unit)::integer; got:=0;
     for c in select x.id from public.kinto_loyalty_coupons x where x.customer_id=cid::text and x.currency=q->>'currency'
       and x.status='active' and x.expires_at>now() and not exists(select 1 from private.kinto_payment_coupon_holds_p5 h where h.coupon_id=x.id)
       and ((x.campaign_id is null and x.store_id=store_row.store_id::text) or (x.campaign_id is not null and exists(
         select 1 from public.kinto_campaign_stores cs join public.kinto_campaigns ca on ca.id=cs.campaign_id where cs.campaign_id=x.campaign_id
           and cs.store_id=store_row.store_id::text and ca.status<>'cancelled')))
       order by x.expires_at,x.issued_at for update of x skip locked limit need loop
       insert into private.kinto_payment_coupon_holds_p5(attempt_id,coupon_id,store_id) values(attempt,c.id,store_row.store_id::text);
       got:=got+1;
     end loop;
     if got<>need then raise exception 'PAYMENT_P5_COUPON_RACE' using errcode='P0001'; end if;
   end if;
 end loop;
 return jsonb_build_object('ok',true,'attempt_id',attempt,'kp_number',kp,'status','reserved','expires_at',a->>'expires_at','reused',false,'quote',q);
end;$p5reserve$;
revoke all on function public.kinto_payment_p5_reserve_v1(text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_p5_reserve_v1(text,text,jsonb,jsonb) to service_role;
commit;
