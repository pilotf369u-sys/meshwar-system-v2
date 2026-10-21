#!/usr/bin/env bash
set -euo pipefail

# Native PostgreSQL concurrency check. Run only on a disposable restored KINTO DB.
: "${P4_TEST_DATABASE_URL:?Set a disposable test database URL}"
: "${P4_TEST_PRODUCT_ID:?Set the dedicated disposable fixture product UUID}"
: "${P4_TEST_STORE_ID:?Set its store UUID}"
: "${P4_TEST_CUSTOMER_ID:?Set a disposable fixture customer UUID}"
[[ "${P4_TEST_ALLOW_WRITES:-}" == "YES_DISPOSABLE_ONLY" ]] || {
  echo "Refusing database writes without P4_TEST_ALLOW_WRITES=YES_DISPOSABLE_ONLY" >&2; exit 2;
}
if [[ "$P4_TEST_DATABASE_URL" == *hsmmbloouskqdnptiiad* ]]; then
  echo "Refusing the known KINTO production project URL" >&2; exit 2
fi
uuid_re='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
for value in "$P4_TEST_PRODUCT_ID" "$P4_TEST_STORE_ID" "$P4_TEST_CUSTOMER_ID"; do
  [[ "$value" =~ $uuid_re ]] || { echo "Invalid fixture UUID" >&2; exit 2; }
done
command -v psql >/dev/null || { echo "psql is required" >&2; exit 2; }

psql "$P4_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
  -v product_id="$P4_TEST_PRODUCT_ID" -v store_id="$P4_TEST_STORE_ID" <<'SQL'
begin;
update private.kinto_payment_runtime_p4
   set effective_mode='electronic',transition_state='stable',target_mode=null,electronic_admission_ready=true
 where singleton=true;
update public.kinto_payment_settings_g16 set payment_mode='electronic' where singleton=true;
insert into public.kinto_payment_providers_p2(provider_key,display_name,checkout_protocol,test_only,enabled,adapter_version)
 values('p4-test-api','P4 isolated test provider','api',false,true,'isolated-test-only')
 on conflict(provider_key) do update set enabled=true,test_only=false,checkout_protocol='api';
update public.kinto_payment_runtime_p2 set selected_provider_key='p4-test-api',emergency_stop=false where singleton=true;
update public.local_products set stock_quantity=1,is_out_of_stock=false,options='{}'::jsonb
 where id=:'product_id'::uuid and store_id=:'store_id'::uuid;
commit;
SQL

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
key_a="p4race_$(openssl rand -hex 12)"
key_b="p4race_$(openssl rand -hex 12)"

reserve_once() {
  local key="$1" log="$2"
  psql "$P4_TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1 \
    -v customer_id="$P4_TEST_CUSTOMER_ID" -v product_id="$P4_TEST_PRODUCT_ID" \
    -v store_id="$P4_TEST_STORE_ID" -v idem="$key" >"$log" 2>&1 <<'SQL'
begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('p4.test.customer_id',:'customer_id',true);
select set_config('p4.test.product_id',:'product_id',true);
select set_config('p4.test.store_id',:'store_id',true);
select set_config('p4.test.idem',:'idem',true);
do $test$
declare
  lines jsonb;
  quote jsonb;
  result jsonb;
begin
  lines:=jsonb_build_array(jsonb_build_object(
    'store_id',current_setting('p4.test.store_id')::uuid,
    'product_id',current_setting('p4.test.product_id')::uuid,
    'selected_options','{}'::jsonb,'quantity',1));
  quote:=jsonb_build_object('currency','IQD','amount',100,'lines',lines);
  result:=public.kinto_payment_attempt_reserve_p4(
    current_setting('p4.test.customer_id')::uuid,current_setting('p4.test.idem'),
    'IQD',100,quote,lines);
  raise notice 'P4_RESERVE_OK attempt=%',result->>'attempt_id';
end;
$test$;
commit;
SQL
}

reserve_once "$key_a" "$tmp_dir/a.log" & pid_a=$!
reserve_once "$key_b" "$tmp_dir/b.log" & pid_b=$!
set +e
wait "$pid_a"; status_a=$?
wait "$pid_b"; status_b=$?
set -e
successes=$(( (status_a == 0) + (status_b == 0) ))
failures=$(( (status_a != 0) + (status_b != 0) ))
cat "$tmp_dir/a.log" "$tmp_dir/b.log"
if [[ "$successes" -ne 1 || "$failures" -ne 1 ]] \
  || ! grep -h -q 'PAYMENT_P4_INSUFFICIENT_TOTAL_STOCK' "$tmp_dir/a.log" "$tmp_dir/b.log"; then
  echo "FAIL: expected exactly one successful hold and one total-stock rejection" >&2
  exit 1
fi
echo "PASS: two native PostgreSQL sessions raced for the last unit; one hold won."
