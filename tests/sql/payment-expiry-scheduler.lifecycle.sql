-- Run only on disposable PostgreSQL with synthetic fixtures and the real P4/P5 migrations.
-- Supply customer_token, campaign_id, and items as psql -v arguments.
begin;
select set_config('kinto.expiry_test.token', :'customer_token', true) as test_token,
       set_config('kinto.expiry_test.campaign', :'campaign_id', true) as test_campaign,
       set_config('kinto.expiry_test.items', :'items', true) as test_items
\gset
set local request.jwt.claims = '{"role":"service_role"}';

do $test$
declare
  token text := current_setting('kinto.expiry_test.token');
  campaign uuid := current_setting('kinto.expiry_test.campaign')::uuid;
  items jsonb := current_setting('kinto.expiry_test.items')::jsonb;
  unstarted uuid;
  started uuid;
  stock_before jsonb;
  orders_before jsonb;
  paid_before jsonb;
begin
  unstarted := (public.kinto_payment_p5_campaign_reserve_v1(
    token, gen_random_uuid()::text, campaign, items)->>'attempt_id')::uuid;
  started := (public.kinto_payment_p5_campaign_reserve_v1(
    token, gen_random_uuid()::text, campaign, items)->>'attempt_id')::uuid;
  perform public.kinto_payment_p5_start_v1(token, started);
  update private.kinto_stock_holds_p4
     set created_at = now() - interval '1 hour', expires_at = now() - interval '1 minute'
   where attempt_id in (unstarted, started);

  select jsonb_agg(to_jsonb(p) order by id) into stock_before from public.local_products p;
  select jsonb_agg(to_jsonb(o) order by id) into orders_before from public.orders o;
  select jsonb_agg(to_jsonb(p) order by attempt_id) into paid_before
    from private.kinto_payments_p5 p where status = 'paid';
  assert paid_before is not null, 'Supply at least one successful payment fixture';

  assert public.kinto_payment_attempt_expire_p4(200) >= 1;
  perform public.kinto_payment_attempt_expire_p4(200);

  assert (select status from private.kinto_payment_attempts_p4 where id = unstarted) = 'expired';
  assert (select status from private.kinto_stock_holds_p4 where attempt_id = unstarted) = 'expired';
  assert (select status from private.kinto_payments_p5 where attempt_id = unstarted) = 'expired';
  assert (select status from private.kinto_payment_campaign_holds_p5 where attempt_id = unstarted) = 'released';
  assert (select status from private.kinto_payment_attempts_p4 where id = started) = 'reconciliation_required';
  assert exists (select 1 from private.kinto_stock_holds_p4 where attempt_id = started
    and status = 'reconciliation_required' and released_at is null);
  assert exists (select 1 from private.kinto_stock_hold_lines_p4 l
    join private.kinto_stock_holds_p4 h on h.id = l.hold_id where h.attempt_id = started);
  assert (select status from private.kinto_payment_campaign_holds_p5 where attempt_id = started)
    = 'reconciliation_required';
  assert (select jsonb_agg(to_jsonb(p) order by id) from public.local_products p) is not distinct from stock_before;
  assert (select jsonb_agg(to_jsonb(o) order by id) from public.orders o) is not distinct from orders_before;
  assert (select jsonb_agg(to_jsonb(p) order by attempt_id) from private.kinto_payments_p5 p where status = 'paid')
    is not distinct from paid_before;
end;
$test$;
rollback;
