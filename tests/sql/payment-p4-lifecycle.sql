-- Transactional lifecycle tests. Run with psql on a disposable restored KINTO DB:
--   psql "$P4_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
--     -v customer_id="$P4_TEST_CUSTOMER_ID" -v product_id="$P4_TEST_PRODUCT_ID" \
--     -v store_id="$P4_TEST_STORE_ID" -f tests/sql/payment-p4-lifecycle.sql
-- The final ROLLBACK restores the fixture product and all test rows.
\set ON_ERROR_STOP on
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('p4.test.customer_id',:'customer_id',true);
select set_config('p4.test.product_id',:'product_id',true);
select set_config('p4.test.store_id',:'store_id',true);
select set_config('p4.test.admin_token',encode(extensions.gen_random_bytes(32),'hex'),true);

insert into public.admin_sessions_v147(admin_id,token_hash,expires_at)
values('p4-isolated-test',extensions.digest(current_setting('p4.test.admin_token'),'sha256'),now()+interval '1 hour');
insert into public.kinto_payment_providers_p2(provider_key,display_name,checkout_protocol,test_only,enabled,adapter_version)
values('p4-test-api','P4 isolated test provider','api',false,true,'isolated-test-only')
on conflict(provider_key) do update set display_name=excluded.display_name,checkout_protocol='api',test_only=false,enabled=true;
update public.kinto_payment_runtime_p2 set selected_provider_key='p4-test-api',emergency_stop=false where singleton=true;
update public.kinto_payment_settings_g16 set payment_mode='manual' where singleton=true;
update private.kinto_payment_runtime_p4 set effective_mode='manual',transition_state='stable',target_mode=null,electronic_admission_ready=true where singleton=true;
update public.local_products set stock_quantity=10,is_out_of_stock=false,
 options=jsonb_build_object('colors',jsonb_build_array('blue'),'sizes',jsonb_build_array('small'),
   'variant_stock',jsonb_build_object('color',jsonb_build_object('blue',3),'size',jsonb_build_object('small',3)),
   'matrix_stock',jsonb_build_object('blue_small',3))
where id=current_setting('p4.test.product_id')::uuid and store_id=current_setting('p4.test.store_id')::uuid;

-- Create one unpaid and one paid manual order. The paid row must be preserved;
-- the unpaid row can only be cancelled after explicit admin attestation.
insert into public.orders(customer_id,customer_name,customer_phone,total_price,currency,details,order_url,status)
values(current_setting('p4.test.customer_id')::uuid,'P4 test','',100,'IQD',
 jsonb_build_object('source','local_store','store_id',current_setting('p4.test.store_id'),
  'product_id',current_setting('p4.test.product_id'),'quantity',1,'requested_quantity',1,
  'color','blue','size','small'), 'customer-dashboard.html','انتظار رد الموظف')
returning id as unpaid_order_id \gset
select set_config('p4.test.unpaid_order_id',:'unpaid_order_id',true);
insert into public.orders(customer_id,customer_name,customer_phone,total_price,currency,details,order_url,status)
values(current_setting('p4.test.customer_id')::uuid,'P4 test','',100,'IQD',
 jsonb_build_object('source','local_store','store_id',current_setting('p4.test.store_id'),
  'product_id',current_setting('p4.test.product_id'),'quantity',1,'requested_quantity',1,
  'color','blue','size','small'), 'customer-dashboard.html','انتظار رد الموظف')
returning id as paid_order_id \gset
select set_config('p4.test.paid_order_id',:'paid_order_id',true);
update public.orders set status='تم التسديد' where id=:'paid_order_id'::uuid;

do $test$
declare
  transition jsonb;
  attempt jsonb;
  duplicate_attempt jsonb;
  event_result jsonb;
  aux jsonb;
  lines jsonb;
  quote jsonb;
  expected_id uuid;
  err text;
begin
  -- The first transition closes intake and reports unpaid IDs without cancelling.
  transition:=public.kinto_payment_mode_transition_p4(current_setting('p4.test.admin_token'),'electronic','{}',false);
  if transition->>'error'<>'MANUAL_ORDERS_REQUIRE_REVIEW' or transition->>'state'<>'draining' then
    raise exception 'P4_TEST_FAILED: expected manual-order review'; end if;
  if (select status from public.orders where id=current_setting('p4.test.unpaid_order_id')::uuid)<>'انتظار رد الموظف' then
    raise exception 'P4_TEST_FAILED: unpaid order changed before attestation'; end if;
  if (select status from public.orders where id=current_setting('p4.test.paid_order_id')::uuid)<>'تم التسديد' then
    raise exception 'P4_TEST_FAILED: paid order was changed'; end if;

  transition:=public.kinto_payment_mode_transition_p4(current_setting('p4.test.admin_token'),'electronic',array[current_setting('p4.test.unpaid_order_id')::uuid],true);
  if transition->>'ok'<>'true' or transition->>'effective_mode'<>'electronic' then
    raise exception 'P4_TEST_FAILED: verified electronic transition did not complete: %',transition; end if;
  if (select status from public.orders where id=current_setting('p4.test.unpaid_order_id')::uuid)<>'ملغي' then
    raise exception 'P4_TEST_FAILED: verified unpaid order was not cancelled'; end if;
  if (select status from public.orders where id=current_setting('p4.test.paid_order_id')::uuid)<>'تم التسديد' then
    raise exception 'P4_TEST_FAILED: paid order was not preserved'; end if;
  begin
    update public.orders set status='تم التسديد' where id=current_setting('p4.test.unpaid_order_id')::uuid;
    raise exception 'P4_TEST_FAILED: late manual payment passed in electronic mode';
  exception when others then
    get stacked diagnostics err=message_text;
    if err not like '%PAYMENT_P4_MANUAL_PAYMENT_PATH_NOT_ACTIVE%' then raise; end if;
  end;

  -- A held color/size bucket is exclusive while physical stock stays unchanged.
  update public.local_products set options=jsonb_build_object('colors',jsonb_build_array('blue'),'sizes',jsonb_build_array('small'),
    'variant_stock',jsonb_build_object('color',jsonb_build_object('blue',1),'size',jsonb_build_object('small',3)),
    'matrix_stock',jsonb_build_object('blue_small',3))
   where id=current_setting('p4.test.product_id')::uuid;
  lines:=jsonb_build_array(jsonb_build_object('store_id',current_setting('p4.test.store_id')::uuid,
    'product_id',current_setting('p4.test.product_id')::uuid,'selected_options',jsonb_build_object('color','blue','size','small'),'quantity',1));
  quote:=jsonb_build_object('currency','IQD','amount',100,'lines',lines);
  aux:=public.kinto_payment_attempt_reserve_p4(current_setting('p4.test.customer_id')::uuid,
    'p4-variant-attempt-key-0001','IQD',100,quote,lines);
  begin
    perform public.kinto_payment_attempt_reserve_p4(current_setting('p4.test.customer_id')::uuid,
      'p4-variant-attempt-key-0002','IQD',100,quote,lines);
    raise exception 'P4_TEST_FAILED: held variant bucket was reserved twice';
  exception when others then
    get stacked diagnostics err=message_text;
    if err not like '%PAYMENT_P4_INSUFFICIENT_VARIANT_STOCK%' then raise; end if;
  end;
  if (select stock_quantity from public.local_products where id=current_setting('p4.test.product_id')::uuid)<>9 then
    raise exception 'P4_TEST_FAILED: reservation changed physical total stock'; end if;
  perform public.kinto_payment_attempt_event_p4((aux->>'attempt_id')::uuid,'p4-test-api','p4-variant-failed','failed','verified');

  -- Exact matrix combination availability is independent from other options.
  update public.local_products set options=jsonb_build_object('colors',jsonb_build_array('blue'),'sizes',jsonb_build_array('small'),
    'variant_stock',jsonb_build_object('color',jsonb_build_object('blue',3),'size',jsonb_build_object('small',3)),
    'matrix_stock',jsonb_build_object('blue_small',1))
   where id=current_setting('p4.test.product_id')::uuid;
  aux:=public.kinto_payment_attempt_reserve_p4(current_setting('p4.test.customer_id')::uuid,
    'p4-matrix-attempt-key-00001','IQD',100,quote,lines);
  begin
    perform public.kinto_payment_attempt_reserve_p4(current_setting('p4.test.customer_id')::uuid,
      'p4-matrix-attempt-key-00002','IQD',100,quote,lines);
    raise exception 'P4_TEST_FAILED: held matrix combination was reserved twice';
  exception when others then
    get stacked diagnostics err=message_text;
    if err not like '%PAYMENT_P4_INSUFFICIENT_MATRIX_STOCK%' then raise; end if;
  end;
  perform public.kinto_payment_attempt_event_p4((aux->>'attempt_id')::uuid,'p4-test-api','p4-matrix-failed','failed','verified');

  update public.local_products set options=jsonb_build_object('colors',jsonb_build_array('blue'),'sizes',jsonb_build_array('small'),
    'variant_stock',jsonb_build_object('color',jsonb_build_object('blue',3),'size',jsonb_build_object('small',3)),
    'matrix_stock',jsonb_build_object('blue_small',3))
   where id=current_setting('p4.test.product_id')::uuid;
  attempt:=public.kinto_payment_attempt_reserve_p4(current_setting('p4.test.customer_id')::uuid,
    'p4-lifecycle-attempt-key-0001','IQD',100,quote,lines);
  expected_id:=(attempt->>'attempt_id')::uuid;
  duplicate_attempt:=public.kinto_payment_attempt_reserve_p4(current_setting('p4.test.customer_id')::uuid,
    'p4-lifecycle-attempt-key-0001','IQD',100,quote,lines);
  if duplicate_attempt->>'reused'<>'true' or (duplicate_attempt->>'attempt_id')::uuid<>expected_id then
    raise exception 'P4_TEST_FAILED: idempotent request created a second attempt'; end if;

  -- Repeated pending notification is idempotent; TTL on a provider-started request
  -- changes it to reconciliation_required and keeps the hold after expiry.
  event_result:=public.kinto_payment_attempt_mark_pending_p4(expected_id,'p4-provider-request-1');
  event_result:=public.kinto_payment_attempt_mark_pending_p4(expected_id,'p4-provider-request-1');
  if event_result->>'reused'<>'true' then raise exception 'P4_TEST_FAILED: repeated pending start was not idempotent'; end if;
  update private.kinto_stock_holds_p4 set created_at=clock_timestamp()-interval '16 minutes',
    expires_at=clock_timestamp()-interval '1 second' where attempt_id=expected_id;
  update private.kinto_payment_attempts_p4 set created_at=clock_timestamp()-interval '16 minutes',
    expires_at=clock_timestamp()-interval '1 second' where id=expected_id;
  perform public.kinto_payment_attempt_expire_p4(50);
  if (select status from private.kinto_payment_attempts_p4 where id=expected_id)<>'reconciliation_required'
    or (select status from private.kinto_stock_holds_p4 where attempt_id=expected_id)<>'reconciliation_required' then
    raise exception 'P4_TEST_FAILED: unknown provider outcome released on expiry'; end if;
  event_result:=public.kinto_payment_attempt_event_p4(expected_id,'p4-test-api','p4-event-unknown-1','unknown','timeout');
  event_result:=public.kinto_payment_attempt_event_p4(expected_id,'p4-test-api','p4-event-unknown-1','unknown','timeout');
  if event_result->>'duplicate'<>'true' then raise exception 'P4_TEST_FAILED: duplicate unknown outcome was not deduplicated'; end if;
  update public.local_products set options=jsonb_set(options,'{matrix_stock,blue_small}','1'::jsonb,true)
   where id=current_setting('p4.test.product_id')::uuid;
  begin
    perform public.kinto_payment_attempt_reserve_p4(current_setting('p4.test.customer_id')::uuid,
      'p4-held-unknown-new-key-001','IQD',100,quote,lines);
    raise exception 'P4_TEST_FAILED: unknown result hold did not block last matrix unit';
  exception when others then
    get stacked diagnostics err=message_text;
    if err not like '%PAYMENT_P4_INSUFFICIENT_MATRIX_STOCK%' then raise; end if;
  end;
  transition:=public.kinto_payment_mode_transition_p4(current_setting('p4.test.admin_token'),'manual','{}',false);
  if transition->>'error'<>'PAYMENT_ATTEMPTS_REQUIRE_RECONCILIATION' or transition->>'state'<>'draining' then
    raise exception 'P4_TEST_FAILED: unresolved payment did not block manual mode'; end if;
  event_result:=public.kinto_payment_attempt_event_p4(expected_id,'p4-test-api','p4-event-failed-1','failed','verified-test-failure');
  if event_result->>'hold_status'<>'reconciliation_required' then
    raise exception 'P4_TEST_FAILED: late failure notification incorrectly released an unknown-result hold'; end if;
  event_result:=public.kinto_payment_attempt_reconcile_p4(current_setting('p4.test.admin_token'),expected_id,
    'confirmed_no_charge','test-provider-query-verified');
  if event_result->>'hold_status'<>'released' then
    raise exception 'P4_TEST_FAILED: audited no-charge reconciliation did not release its hold'; end if;
  event_result:=public.kinto_payment_attempt_event_p4(expected_id,'p4-test-api','p4-event-late-success','succeeded','late-provider-success');
  if event_result->>'hold_status'<>'reconciliation_required'
    or (select transition_state from private.kinto_payment_runtime_p4 where singleton=true)<>'draining' then
    raise exception 'P4_TEST_FAILED: late success did not restore hold and close order intake'; end if;
  event_result:=public.kinto_payment_attempt_reconcile_p4(current_setting('p4.test.admin_token'),expected_id,
    'refunded','provider-refund-verified');
  if event_result->>'hold_status'<>'released' then
    raise exception 'P4_TEST_FAILED: verified refund did not release a late-success hold'; end if;
  transition:=public.kinto_payment_mode_transition_p4(current_setting('p4.test.admin_token'),'manual','{}',false);
  if transition->>'ok'<>'true' or transition->>'effective_mode'<>'manual' then
    raise exception 'P4_TEST_FAILED: manual mode did not reopen after verified reconciliation'; end if;
end;
$test$;

rollback;
