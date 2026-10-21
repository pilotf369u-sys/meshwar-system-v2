-- P5 test-only correction: require the existing simulator key spelling from P2.
begin;
create or replace function public.kinto_payment_attempt_reserve_p4(
 p_customer_id uuid,
 p_idempotency_key text,
 p_currency text,
 p_amount numeric,
 p_quote_snapshot jsonb,
 p_lines jsonb
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp as $reserve$
declare ctl private.kinto_payment_runtime_p4%rowtype; runtime_p2 public.kinto_payment_runtime_p2%rowtype;
        provider public.kinto_payment_providers_p2%rowtype;
        selected_provider text; v_attempt private.kinto_payment_attempts_p4%rowtype; v_hold private.kinto_stock_holds_p4%rowtype;
        v_product_id uuid; p record; v_held integer; v_stock integer; v_variant record; v_variant_stock jsonb;
        v_matrix record; v_matrix_stock jsonb; v_expiry timestamptz:=clock_timestamp()+interval '15 minutes';
        v_lines jsonb:=p_lines; v_existing private.kinto_payment_attempts_p4%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 if p_customer_id is null or p_amount is null or p_amount<=0 or p_currency is null or upper(p_currency) !~ '^[A-Z]{3}$'
   or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9_-]{16,128}$'
   or jsonb_typeof(p_quote_snapshot) is distinct from 'object'
   or jsonb_typeof(v_lines) is distinct from 'array' or jsonb_array_length(v_lines)<1 or jsonb_array_length(v_lines)>100 then
   raise exception 'PAYMENT_P4_INVALID_INPUT' using errcode='22023'; end if;
 if not exists(select 1 from public.customers c where c.id=p_customer_id) then raise exception 'PAYMENT_P4_CUSTOMER_NOT_FOUND' using errcode='P0002'; end if;
 if exists(select 1 from jsonb_array_elements(v_lines) x(item)
   where private.v94_uuid(x.item->>'store_id') is null or private.v94_uuid(x.item->>'product_id') is null
     or private.v94_numeric(x.item->>'quantity',0)<>trunc(private.v94_numeric(x.item->>'quantity',0))
     or private.v94_numeric(x.item->>'quantity',0)<1 or private.v94_numeric(x.item->>'quantity',0)>1000
     or jsonb_typeof(coalesce(x.item->'selected_options','{}'::jsonb)) is distinct from 'object'
     or not exists(select 1 from public.local_products lp where lp.id=private.v94_uuid(x.item->>'product_id')
        and lp.store_id=private.v94_uuid(x.item->>'store_id'))) then
   raise exception 'PAYMENT_P4_INVALID_LINE' using errcode='22023'; end if;
 select * into ctl from private.kinto_payment_runtime_p4 where singleton=true for share;
 if not found or ctl.electronic_admission_ready is not true or ctl.effective_mode<>'electronic' or ctl.transition_state<>'stable' then
   raise exception 'PAYMENT_P4_ELECTRONIC_INTAKE_CLOSED' using errcode='55000'; end if;
 select * into runtime_p2 from public.kinto_payment_runtime_p2 where singleton=true for share;
 if not found or runtime_p2.emergency_stop then raise exception 'NEW_PAYMENTS_EMERGENCY_STOPPED' using errcode='55000'; end if;
 select selected_provider_key into selected_provider from public.kinto_payment_runtime_p2 where singleton=true;
 select * into provider from public.kinto_payment_providers_p2 where provider_key=selected_provider for share;
 if selected_provider is null or not found or provider.enabled is not true or provider.test_only is distinct from true or provider.real_collection_allowed is distinct from false or selected_provider<>'kinto-simulator' or not exists(select 1 from private.kinto_payment_runtime_p5 where singleton=true and simulator_enabled=true and real_collection_allowed=false) then
   raise exception 'PAYMENT_P4_PROVIDER_NOT_SELECTED' using errcode='55000'; end if;
 if upper(p_currency)<>upper(coalesce(p_quote_snapshot->>'currency',''))
   or p_amount is distinct from (p_quote_snapshot->>'amount')::numeric
   or p_quote_snapshot->'lines' is distinct from v_lines then
   raise exception 'PAYMENT_P4_SERVER_QUOTE_MISMATCH' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text||':'||p_idempotency_key,0));
 select * into v_existing from private.kinto_payment_attempts_p4 where customer_id=p_customer_id::text and idempotency_key=p_idempotency_key for update;
 if found then
   if v_existing.currency<>upper(p_currency) or v_existing.amount<>p_amount or v_existing.quote_snapshot is distinct from p_quote_snapshot then
     raise exception 'PAYMENT_P4_IDEMPOTENCY_KEY_REUSED' using errcode='23505'; end if;
   select * into v_hold from private.kinto_stock_holds_p4 where attempt_id=v_existing.id;
   return jsonb_build_object('attempt_id',v_existing.id,'hold_id',v_hold.id,'status',v_existing.status,'expires_at',v_existing.expires_at,'provider_key',v_existing.provider_key,'reused',true);
 end if;
 -- All callers lock products in the same UUID order before counting holds.
 for v_product_id in select distinct (item->>'product_id')::uuid from jsonb_array_elements(v_lines) q(item) order by 1 loop
   perform 1 from public.local_products p0 where p0.id=v_product_id for update;
   if not found then raise exception 'PAYMENT_P4_PRODUCT_NOT_FOUND' using errcode='P0002'; end if;
 end loop;
 for p in select p0.id,p0.stock_quantity,p0.is_out_of_stock,coalesce(p0.options,'{}'::jsonb) options,
       sum((x.item->>'quantity')::integer)::integer requested
      from jsonb_array_elements(v_lines) x(item) join public.local_products p0 on p0.id=(x.item->>'product_id')::uuid
     group by p0.id,p0.stock_quantity,p0.is_out_of_stock,p0.options order by p0.id loop
   if coalesce(p.is_out_of_stock,false) then raise exception 'PAYMENT_P4_PRODUCT_UNAVAILABLE'; end if;
   if exists(select 1 from jsonb_array_elements(v_lines) x(item) where (x.item->>'product_id')::uuid=p.id
       and not private.kinto_payment_options_valid_p4(p.options,coalesce(x.item->'selected_options','{}'::jsonb))) then
     raise exception 'PAYMENT_P4_INVALID_VARIANT'; end if;
   if p.stock_quantity is not null then
     select coalesce(sum(l.quantity),0)::integer into v_held from private.kinto_stock_hold_lines_p4 l
       join private.kinto_stock_holds_p4 h on h.id=l.hold_id
       join private.kinto_payment_attempts_p4 a on a.id=h.attempt_id
      where l.product_id=p.id and h.status in ('active','reconciliation_required')
        and (h.status='reconciliation_required' or h.expires_at>clock_timestamp()
          or a.status in ('pending','succeeded','reconciliation_required'));
     if p.stock_quantity-v_held<p.requested then raise exception 'PAYMENT_P4_INSUFFICIENT_TOTAL_STOCK' using errcode='P0001'; end if;
   end if;
 end loop;
 for v_variant in select (x.item->>'product_id')::uuid product_id,d.dimension,d.choice,
      sum((x.item->>'quantity')::integer)::integer requested
     from jsonb_array_elements(v_lines) x(item)
     cross join lateral (values('color'::text,nullif(btrim(x.item->'selected_options'->>'color'),'')),('size',nullif(btrim(x.item->'selected_options'->>'size'),'')),('volume',nullif(btrim(x.item->'selected_options'->>'volume'),''))) d(dimension,choice)
     where d.choice is not null group by 1,2,3 order by 1,2,3 loop
   select coalesce(p0.options->'variant_stock'->v_variant.dimension,p0.options->'variant_stock'->(v_variant.dimension||'s')) into v_variant_stock from public.local_products p0 where p0.id=v_variant.product_id;
   if jsonb_typeof(v_variant_stock)='object' and v_variant_stock ? v_variant.choice then
     if coalesce(v_variant_stock->>v_variant.choice,'') !~ '^[0-9]+$' then raise exception 'PAYMENT_P4_VARIANT_STOCK_INVALID'; end if;
     v_stock:=(v_variant_stock->>v_variant.choice)::integer;
     select coalesce(sum(l.quantity),0)::integer into v_held from private.kinto_stock_hold_lines_p4 l
       join private.kinto_stock_holds_p4 h on h.id=l.hold_id
       join private.kinto_payment_attempts_p4 a on a.id=h.attempt_id
      where l.product_id=v_variant.product_id and h.status in ('active','reconciliation_required')
       and (h.status='reconciliation_required' or h.expires_at>clock_timestamp()
         or a.status in ('pending','succeeded','reconciliation_required'))
       and coalesce(l.selected_options->>v_variant.dimension,'')=v_variant.choice;
     if v_stock-v_held<v_variant.requested then raise exception 'PAYMENT_P4_INSUFFICIENT_VARIANT_STOCK' using errcode='P0001'; end if;
   end if;
 end loop;
 for v_matrix in select (item->>'product_id')::uuid product_id,public.meshwar_matrix_stock_key(coalesce(item->'selected_options','{}'::jsonb)) matrix_key,
       sum((item->>'quantity')::integer)::integer requested from jsonb_array_elements(v_lines) x(item) group by 1,2 order by 1,2 loop
   select coalesce(p0.options->'matrix_stock','{}'::jsonb) into v_matrix_stock from public.local_products p0 where p0.id=v_matrix.product_id;
   if jsonb_typeof(v_matrix_stock)='object' and v_matrix_stock<>'{}'::jsonb then
     if v_matrix.matrix_key is null or not (v_matrix_stock ? v_matrix.matrix_key) then raise exception 'PAYMENT_P4_MATRIX_COMBINATION_REQUIRED'; end if;
     if coalesce(v_matrix_stock->>v_matrix.matrix_key,'') !~ '^[0-9]+$' then raise exception 'PAYMENT_P4_MATRIX_STOCK_INVALID'; end if;
     v_stock:=(v_matrix_stock->>v_matrix.matrix_key)::integer;
     select coalesce(sum(l.quantity),0)::integer into v_held from private.kinto_stock_hold_lines_p4 l
       join private.kinto_stock_holds_p4 h on h.id=l.hold_id
       join private.kinto_payment_attempts_p4 a on a.id=h.attempt_id
      where l.product_id=v_matrix.product_id and l.matrix_key=v_matrix.matrix_key
       and h.status in ('active','reconciliation_required') and (h.status='reconciliation_required' or h.expires_at>clock_timestamp()
         or a.status in ('pending','succeeded','reconciliation_required'));
     if v_stock-v_held<v_matrix.requested then raise exception 'PAYMENT_P4_INSUFFICIENT_MATRIX_STOCK' using errcode='P0001'; end if;
   end if;
 end loop;
 insert into private.kinto_payment_attempts_p4(customer_id,idempotency_key,provider_key,currency,amount,status,quote_snapshot,expires_at)
   values(p_customer_id::text,p_idempotency_key,selected_provider,upper(p_currency),p_amount,'reserved',p_quote_snapshot,v_expiry) returning * into v_attempt;
 insert into private.kinto_stock_holds_p4(attempt_id,expires_at) values(v_attempt.id,v_expiry) returning * into v_hold;
 insert into private.kinto_stock_hold_lines_p4(hold_id,store_id,product_id,selected_options,matrix_key,quantity)
   select v_hold.id,(item->>'store_id')::uuid,(item->>'product_id')::uuid,coalesce(item->'selected_options','{}'::jsonb),
     public.meshwar_matrix_stock_key(coalesce(item->'selected_options','{}'::jsonb)),(item->>'quantity')::integer from jsonb_array_elements(v_lines) x(item);
 return jsonb_build_object('attempt_id',v_attempt.id,'hold_id',v_hold.id,'status','reserved','expires_at',v_expiry,'provider_key',selected_provider,'reused',false,'physical_stock_changed',false);
end;
$reserve$;
commit;
