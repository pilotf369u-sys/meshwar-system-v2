-- Payment-P4: private payment-attempt ledger and temporary stock holds.
-- No customer checkout, provider call, order insert, invoice, coupon, or physical
-- stock mutation is introduced by this migration. Keep G16 manual and P2 stopped.
begin;

create table if not exists private.kinto_payment_runtime_p4 (
  singleton boolean primary key default true check (singleton),
  effective_mode text not null default 'manual' check (effective_mode in ('manual','electronic')),
  transition_state text not null default 'stable' check (transition_state in ('stable','draining')),
  target_mode text check (target_mode is null or target_mode in ('manual','electronic')),
  -- Intentionally false in P4. A later reviewed payment-integration migration
  -- must explicitly set readiness after a verified provider/finalizer exists.
  electronic_admission_ready boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by text,
  check ((transition_state='stable' and target_mode is null)
      or (transition_state='draining' and target_mode is not null))
);

insert into private.kinto_payment_runtime_p4(singleton,effective_mode,transition_state,target_mode,electronic_admission_ready)
values(true,'manual','stable',null,false)
on conflict(singleton) do nothing;

create table if not exists private.kinto_payment_attempts_p4 (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  provider_key text not null,
  provider_reference text,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(18,3) not null check (amount > 0),
  status text not null default 'new' check (status in (
    'new','reserved','pending','failed','cancelled','expired','succeeded','reconciliation_required'
  )),
  quote_snapshot jsonb not null check (jsonb_typeof(quote_snapshot)='object'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp(),
  unique(customer_id,idempotency_key),
  check (expires_at > created_at)
);
create index if not exists kinto_payment_attempts_p4_active_idx
  on private.kinto_payment_attempts_p4(status,expires_at)
  where status in ('new','reserved','pending','reconciliation_required');

create table if not exists private.kinto_stock_holds_p4 (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null unique references private.kinto_payment_attempts_p4(id) on delete restrict,
  status text not null default 'active' check (status in (
    'active','released','expired','consumed','reconciliation_required'
  )),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  released_at timestamptz,
  release_reason text,
  check (expires_at > created_at)
);
create index if not exists kinto_stock_holds_p4_active_expiry_idx
  on private.kinto_stock_holds_p4(expires_at) where status='active';

create table if not exists private.kinto_stock_hold_lines_p4 (
  id bigint generated always as identity primary key,
  hold_id uuid not null references private.kinto_stock_holds_p4(id) on delete restrict,
  store_id uuid not null,
  product_id uuid not null references public.local_products(id) on delete restrict,
  selected_options jsonb not null default '{}'::jsonb check (jsonb_typeof(selected_options)='object'),
  matrix_key text,
  quantity integer not null check (quantity between 1 and 1000),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists kinto_stock_hold_lines_p4_product_idx
  on private.kinto_stock_hold_lines_p4(product_id,hold_id);
create index if not exists kinto_stock_hold_lines_p4_matrix_idx
  on private.kinto_stock_hold_lines_p4(product_id,matrix_key) where matrix_key is not null;

create table if not exists private.kinto_payment_events_p4 (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references private.kinto_payment_attempts_p4(id) on delete restrict,
  provider_key text not null,
  provider_event_id text not null,
  outcome text not null check (outcome in ('pending','failed','cancelled','succeeded','unknown')),
  evidence_digest text,
  received_at timestamptz not null default clock_timestamp(),
  unique(provider_key,provider_event_id)
);

create table if not exists private.kinto_payment_mode_audit_p4 (
  id bigint generated always as identity primary key,
  actor_id text not null,
  from_mode text not null,
  target_mode text not null,
  result text not null check (result in ('draining','completed','blocked')),
  attested_unpaid_order_ids uuid[] not null default '{}',
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail)='object'),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists private.kinto_payment_reconciliation_audit_p4 (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references private.kinto_payment_attempts_p4(id) on delete restrict,
  actor_id text not null,
  resolution text not null check (resolution in ('confirmed_no_charge','refunded')),
  evidence_reference text not null check (length(btrim(evidence_reference)) between 8 and 200),
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists kinto_payment_reconciliation_audit_p4_attempt_idx
  on private.kinto_payment_reconciliation_audit_p4(attempt_id,created_at desc);

alter table private.kinto_payment_runtime_p4 enable row level security;
alter table private.kinto_payment_attempts_p4 enable row level security;
alter table private.kinto_stock_holds_p4 enable row level security;
alter table private.kinto_stock_hold_lines_p4 enable row level security;
alter table private.kinto_payment_events_p4 enable row level security;
alter table private.kinto_payment_mode_audit_p4 enable row level security;
alter table private.kinto_payment_reconciliation_audit_p4 enable row level security;
revoke all on private.kinto_payment_runtime_p4,private.kinto_payment_attempts_p4,
  private.kinto_stock_holds_p4,private.kinto_stock_hold_lines_p4,
  private.kinto_payment_events_p4,private.kinto_payment_mode_audit_p4,
  private.kinto_payment_reconciliation_audit_p4
  from public,anon,authenticated;

create or replace function private.kinto_payment_options_valid_p4(p_options jsonb,p_selected jsonb)
returns boolean language plpgsql immutable
set search_path=pg_catalog,public as $options$
declare d record; raw_values jsonb; stock_values jsonb; values_list text[]; chosen text; matrix jsonb; matrix_key text; selected_count integer:=0;
begin
 if jsonb_typeof(coalesce(p_options,'{}'::jsonb)) is distinct from 'object'
    or jsonb_typeof(coalesce(p_selected,'{}'::jsonb)) is distinct from 'object' then return false; end if;
 if (p_options ? 'variant_stock' and jsonb_typeof(p_options->'variant_stock') is distinct from 'object')
    or (p_options ? 'matrix_stock' and jsonb_typeof(p_options->'matrix_stock') is distinct from 'object') then return false; end if;
 for d in select * from (values ('color','colors'),('size','sizes'),('volume','volumes')) v(singular,plural) loop
   raw_values:=p_options->d.plural;
   stock_values:=coalesce(p_options->'variant_stock'->d.singular,p_options->'variant_stock'->d.plural);
   if stock_values is not null and jsonb_typeof(stock_values) is distinct from 'object' then return false; end if;
   values_list:=array[]::text[];
   if jsonb_typeof(raw_values)='array' then
     select coalesce(array_agg(distinct btrim(value)),array[]::text[]) into values_list
       from jsonb_array_elements_text(raw_values) x(value) where btrim(value)<>'';
   elsif jsonb_typeof(raw_values)='string' then
     select coalesce(array_agg(distinct btrim(value)),array[]::text[]) into values_list
       from regexp_split_to_table(raw_values#>>'{}','[,،|/]') x(value) where btrim(value)<>'';
   end if;
   chosen:=nullif(btrim(p_selected->>d.singular),'');
   if chosen is null then chosen:=nullif(btrim(p_selected->>d.plural),''); end if;
   if coalesce(array_length(values_list,1),0)>0 then
     if chosen is null or not chosen=any(values_list) then return false; end if;
   elsif chosen is not null and jsonb_typeof(stock_values)='object' and not (stock_values ? chosen) then
     return false;
   end if;
   if chosen is not null then
     selected_count:=selected_count+1;
     if jsonb_typeof(stock_values)='object' and stock_values ? chosen
       and (coalesce(stock_values->>chosen,'') !~ '^[0-9]+$' or (stock_values->>chosen)::integer<=0) then return false; end if;
   end if;
 end loop;
 matrix:=coalesce(p_options->'matrix_stock','{}'::jsonb);
 if jsonb_typeof(matrix)='object' and matrix<>'{}'::jsonb then
   if selected_count<2 then return false; end if;
   matrix_key:=public.meshwar_matrix_stock_key(p_selected);
   if matrix_key is null or not (matrix ? matrix_key)
     or coalesce(matrix->>matrix_key,'') !~ '^[0-9]+$'
     or (matrix->>matrix_key)::integer<=0 then return false; end if;
 end if;
 return true;
end;
$options$;
revoke all on function private.kinto_payment_options_valid_p4(jsonb,jsonb) from public,anon,authenticated;

create or replace function private.kinto_payment_hold_gate_p4()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $gate$
declare d jsonb; ctl private.kinto_payment_runtime_p4%rowtype;
begin
 d:=private.v94_jsonb_object(to_jsonb(new.details));
 if coalesce(d->>'source','') not in ('local_store','local_cart_bundle')
   and coalesce(d->>'checkout_contract','')<>'independent_vendor_orders' then return new; end if;
 select * into ctl from private.kinto_payment_runtime_p4 where singleton=true for share;
 if not found then raise exception 'PAYMENT_P4_MODE_NOT_CONFIGURED' using errcode='55000'; end if;
 if ctl.transition_state<>'stable' then raise exception 'PAYMENT_P4_MODE_TRANSITION_IN_PROGRESS' using errcode='55000'; end if;
 if ctl.effective_mode='manual' then return new; end if;
 -- P4 has no trusted order finalizer. Custom GUCs are caller-settable and must
 -- never authorize an electronic order insert. A future finalizer needs a
 -- separately reviewed privilege boundary, not a session variable bypass.
 raise exception 'PAYMENT_P4_MANUAL_ORDER_PATH_NOT_ACTIVE' using errcode='55000';
end;
$gate$;
revoke all on function private.kinto_payment_hold_gate_p4() from public,anon,authenticated;
drop trigger if exists trg_kinto_payment_p4_order_insert_gate on public.orders;
create trigger trg_kinto_payment_p4_order_insert_gate
before insert on public.orders for each row execute function private.kinto_payment_hold_gate_p4();

create or replace function private.kinto_payment_paid_mode_gate_p4()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $gate$
declare d jsonb; ctl private.kinto_payment_runtime_p4%rowtype;
begin
 if new.status is not distinct from old.status or new.status<>'تم التسديد' then return new; end if;
 d:=private.v94_jsonb_object(to_jsonb(new.details));
 if coalesce(d->>'source','') not in ('local_store','local_cart_bundle')
   and coalesce(d->>'checkout_contract','')<>'independent_vendor_orders' then return new; end if;
 select * into ctl from private.kinto_payment_runtime_p4 where singleton=true for share;
 if not found or ctl.transition_state<>'stable' or ctl.effective_mode<>'manual' then
   raise exception 'PAYMENT_P4_MANUAL_PAYMENT_PATH_NOT_ACTIVE' using errcode='55000';
 end if;
 return new;
end;
$gate$;
revoke all on function private.kinto_payment_paid_mode_gate_p4() from public,anon,authenticated;
drop trigger if exists trg_kinto_payment_p4_paid_mode_gate on public.orders;
create trigger trg_kinto_payment_p4_paid_mode_gate
before update of status on public.orders for each row execute function private.kinto_payment_paid_mode_gate_p4();

create or replace function public.kinto_payment_mode_transition_p4(
 p_session_token text,
 p_target_mode text,
 p_verified_unpaid_order_ids uuid[] default '{}',
 p_admin_confirmed_no_payment boolean default false
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $transition$
declare v_admin text; ctl private.kinto_payment_runtime_p4%rowtype; oid uuid; o public.orders%rowtype;
        v_remaining jsonb; v_unclassified jsonb; v_holds jsonb; v_from text; v_cancelled uuid[]:='{}';
        v_pre_payment constant text[]:=array['انتظار رد الموظف','بانتظار رد الموظف','بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل','تمت الموافقة - بانتظار الدفع','بانتظار تأكيد الدفع','بانتظار التسديد','بانتظار الدفع','تمت الموافقة'];
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_target_mode is null or p_target_mode not in ('manual','electronic') then raise exception 'INVALID_PAYMENT_MODE' using errcode='22023'; end if;
 select * into ctl from private.kinto_payment_runtime_p4 where singleton=true for update;
 if not found then raise exception 'PAYMENT_P4_MODE_NOT_CONFIGURED' using errcode='55000'; end if;
 v_from:=ctl.effective_mode;
 if ctl.transition_state='stable' and ctl.effective_mode=p_target_mode then
   update public.kinto_payment_settings_g16 set payment_mode=p_target_mode,updated_at=clock_timestamp() where singleton=true;
   return jsonb_build_object('ok',true,'effective_mode',ctl.effective_mode,'transition_state','stable','changed',false,'real_collection_allowed',false);
 end if;

 -- An administrator may safely abandon a manual-to-electronic drain. Any orders
 -- already cancelled remain cancelled, but manual intake reopens atomically.
 if ctl.transition_state='draining' and ctl.target_mode='electronic' and p_target_mode='manual' then
   if exists(select 1 from private.kinto_stock_holds_p4 h where h.status in ('active','reconciliation_required')) then
     raise exception 'PAYMENT_P4_ACTIVE_HOLDS_BLOCK_MANUAL_ABORT' using errcode='55000';
   end if;
   update private.kinto_payment_runtime_p4 set effective_mode='manual',transition_state='stable',target_mode=null,updated_at=clock_timestamp(),updated_by=v_admin where singleton=true;
   update public.kinto_payment_settings_g16 set payment_mode='manual',updated_at=clock_timestamp() where singleton=true;
   insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
     values(v_admin,'manual','manual','completed',jsonb_build_object('aborted_target','electronic'));
   return jsonb_build_object('ok',true,'effective_mode','manual','transition_state','stable','aborted_transition',true,'real_collection_allowed',false);
 end if;

 if p_target_mode='electronic' then
   if not ctl.electronic_admission_ready then
     insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
       values(v_admin,v_from,p_target_mode,'blocked',jsonb_build_object('reason','ELECTRONIC_ADMISSION_NOT_READY'));
     return jsonb_build_object('ok',false,'error','ELECTRONIC_ADMISSION_NOT_READY','effective_mode',ctl.effective_mode,'real_collection_allowed',false);
   end if;
   if ctl.transition_state='stable' then
     update private.kinto_payment_runtime_p4 set transition_state='draining',target_mode='electronic',updated_at=clock_timestamp(),updated_by=v_admin where singleton=true returning * into ctl;
   elsif ctl.target_mode is distinct from 'electronic' then
     raise exception 'PAYMENT_P4_DIFFERENT_TRANSITION_ACTIVE' using errcode='55000';
   end if;
   select coalesce(jsonb_agg(jsonb_build_object('attempt_id',a.id,'status',a.status,'expires_at',h.expires_at)
       order by a.created_at,a.id),'[]'::jsonb)
     into v_holds from private.kinto_payment_attempts_p4 a join private.kinto_stock_holds_p4 h on h.attempt_id=a.id
    where a.status in ('pending','succeeded','reconciliation_required') and h.status in ('active','reconciliation_required');
   if jsonb_array_length(v_holds)>0 then
     insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
       values(v_admin,v_from,p_target_mode,'draining',jsonb_build_object('unresolved_attempts',v_holds));
     return jsonb_build_object('ok',false,'state','draining','error','PAYMENT_ATTEMPTS_REQUIRE_RECONCILIATION',
       'attempts',v_holds,'effective_mode',ctl.effective_mode,'real_collection_allowed',false);
   end if;
   if cardinality(coalesce(p_verified_unpaid_order_ids,'{}'::uuid[]))>0 then
     if p_admin_confirmed_no_payment is not true then raise exception 'PAYMENT_P4_UNPAID_ATTESTATION_REQUIRED' using errcode='22023'; end if;
     foreach oid in array p_verified_unpaid_order_ids loop
       select * into o from public.orders where id=oid for update;
       if not found then raise exception 'PAYMENT_P4_ORDER_NOT_FOUND:%',oid using errcode='P0002'; end if;
       if coalesce(private.v94_jsonb_object(to_jsonb(o.details))->>'source','') not in ('local_store','local_cart_bundle')
         and coalesce(private.v94_jsonb_object(to_jsonb(o.details))->>'checkout_contract','')<>'independent_vendor_orders' then
         raise exception 'PAYMENT_P4_ORDER_NOT_LOCAL:%',oid using errcode='22023'; end if;
       if o.status='تم التسديد' or coalesce(private.v94_jsonb_object(to_jsonb(o.details))->>'stock_lifecycle_state','')='deducted'
         or coalesce(private.v94_jsonb_object(to_jsonb(o.details))->>'bundle_stock_lifecycle_state','')='deducted'
         or nullif(private.v94_jsonb_object(to_jsonb(o.details))->>'stock_deducted_at','') is not null then
         raise exception 'PAYMENT_P4_PAID_ORDER_PRESERVED:%',oid using errcode='55000'; end if;
       if not o.status=any(v_pre_payment) then raise exception 'PAYMENT_P4_ORDER_REQUIRES_MANUAL_REVIEW:%',oid using errcode='55000'; end if;
       update public.orders set status='ملغي' where id=oid;
       v_cancelled:=array_append(v_cancelled,oid);
     end loop;
   end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'order_code',coalesce(o.order_code,o.reference_order_no,o.id::text),'status',o.status,'currency',o.currency,'amount',o.total_price) order by o.created_at,o.id),'[]'::jsonb)
     into v_remaining from public.orders o
    where (private.v94_jsonb_object(to_jsonb(o.details))->>'source' in ('local_store','local_cart_bundle')
       or private.v94_jsonb_object(to_jsonb(o.details))->>'checkout_contract'='independent_vendor_orders')
      and o.status=any(v_pre_payment)
      and o.status not in ('ملغي','ملغي من قبل العميل','مرفوض','رفض الطلب')
      and coalesce(private.v94_jsonb_object(to_jsonb(o.details))->>'stock_lifecycle_state','')<>'deducted'
      and coalesce(private.v94_jsonb_object(to_jsonb(o.details))->>'bundle_stock_lifecycle_state','')<>'deducted';
   select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'status',o.status) order by o.created_at,o.id),'[]'::jsonb)
     into v_unclassified from public.orders o
    where (private.v94_jsonb_object(to_jsonb(o.details))->>'source' in ('local_store','local_cart_bundle')
       or private.v94_jsonb_object(to_jsonb(o.details))->>'checkout_contract'='independent_vendor_orders')
      and coalesce(o.status,'') not in ('تم التسديد','تم التسليم','ملغي','ملغي من قبل العميل','مرفوض','رفض الطلب','رفض التسليم','ملغى')
      and not o.status=any(v_pre_payment)
      and coalesce(private.v94_jsonb_object(to_jsonb(o.details))->>'stock_lifecycle_state','')<>'deducted'
      and coalesce(private.v94_jsonb_object(to_jsonb(o.details))->>'bundle_stock_lifecycle_state','')<>'deducted';
   if jsonb_array_length(v_remaining)>0 or jsonb_array_length(v_unclassified)>0 then
     insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,attested_unpaid_order_ids,detail)
       values(v_admin,v_from,p_target_mode,'draining',v_cancelled,jsonb_build_object('remaining_orders',v_remaining,'unclassified_orders',v_unclassified));
     return jsonb_build_object('ok',false,'state','draining','error','MANUAL_ORDERS_REQUIRE_REVIEW','orders',v_remaining,'unclassified_orders',v_unclassified,'effective_mode',ctl.effective_mode,'cancelled_order_ids',to_jsonb(v_cancelled),'real_collection_allowed',false);
   end if;
   update private.kinto_payment_runtime_p4 set effective_mode='electronic',transition_state='stable',target_mode=null,updated_at=clock_timestamp(),updated_by=v_admin where singleton=true returning * into ctl;
   update public.kinto_payment_settings_g16 set payment_mode='electronic',updated_at=clock_timestamp() where singleton=true;
   insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,attested_unpaid_order_ids,detail)
     values(v_admin,v_from,p_target_mode,'completed',v_cancelled,jsonb_build_object('real_collection_allowed',false,'note','P2 emergency stop remains authoritative'));
   return jsonb_build_object('ok',true,'effective_mode','electronic','transition_state','stable','cancelled_order_ids',to_jsonb(v_cancelled),'real_collection_allowed',false);
 end if;

 -- Returning to manual: close electronic admission first. Unsent reservations
 -- have not reached a provider and can be released. Pending/unknown/successful
 -- outcomes remain held until a trusted event resolves them.
 if ctl.transition_state='stable' then
   update private.kinto_payment_runtime_p4 set transition_state='draining',target_mode='manual',updated_at=clock_timestamp(),updated_by=v_admin where singleton=true returning * into ctl;
 elsif ctl.target_mode is distinct from 'manual' then
   raise exception 'PAYMENT_P4_DIFFERENT_TRANSITION_ACTIVE' using errcode='55000';
 end if;
 update private.kinto_payment_attempts_p4 a set status='cancelled',updated_at=clock_timestamp()
   from private.kinto_stock_holds_p4 h where h.attempt_id=a.id and h.status='active'
    and a.status in ('new','reserved');
 update private.kinto_stock_holds_p4 h set status='released',released_at=clock_timestamp(),release_reason='mode_switch_manual'
   from private.kinto_payment_attempts_p4 a where a.id=h.attempt_id and h.status='active' and a.status='cancelled';
 select coalesce(jsonb_agg(jsonb_build_object('attempt_id',a.id,'status',a.status,'expires_at',h.expires_at) order by a.created_at,a.id),'[]'::jsonb)
   into v_holds from private.kinto_payment_attempts_p4 a join private.kinto_stock_holds_p4 h on h.attempt_id=a.id
  where h.status in ('active','reconciliation_required')
    and (a.status in ('pending','succeeded','reconciliation_required') or h.status='reconciliation_required');
 if jsonb_array_length(v_holds)>0 then
   insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
     values(v_admin,v_from,p_target_mode,'draining',jsonb_build_object('unresolved_attempts',v_holds));
   return jsonb_build_object('ok',false,'state','draining','error','PAYMENT_ATTEMPTS_REQUIRE_RECONCILIATION','attempts',v_holds,'effective_mode',ctl.effective_mode,'real_collection_allowed',false);
 end if;
 update private.kinto_payment_runtime_p4 set effective_mode='manual',transition_state='stable',target_mode=null,updated_at=clock_timestamp(),updated_by=v_admin where singleton=true returning * into ctl;
 update public.kinto_payment_settings_g16 set payment_mode='manual',updated_at=clock_timestamp() where singleton=true;
 insert into private.kinto_payment_mode_audit_p4(actor_id,from_mode,target_mode,result,detail)
   values(v_admin,v_from,p_target_mode,'completed',jsonb_build_object('released_unsent_reservations',true));
 return jsonb_build_object('ok',true,'effective_mode','manual','transition_state','stable','real_collection_allowed',false);
end;
$transition$;
revoke all on function public.kinto_payment_mode_transition_p4(text,text,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.kinto_payment_mode_transition_p4(text,text,uuid[],boolean) to anon,authenticated;

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
 if selected_provider is null or not found or provider.enabled is not true or provider.test_only is true then
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
revoke all on function public.kinto_payment_attempt_reserve_p4(uuid,text,text,numeric,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_payment_attempt_reserve_p4(uuid,text,text,numeric,jsonb,jsonb) to service_role;

create or replace function public.kinto_payment_attempt_mark_pending_p4(p_attempt_id uuid,p_provider_request_id text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $mark_pending$
declare a private.kinto_payment_attempts_p4%rowtype; h private.kinto_stock_holds_p4%rowtype; v_event_id bigint;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 if p_attempt_id is null or p_provider_request_id is null or p_provider_request_id !~ '^[A-Za-z0-9._:-]{1,160}$' then
   raise exception 'PAYMENT_P4_PROVIDER_REQUEST_INVALID' using errcode='22023'; end if;
 select * into a from private.kinto_payment_attempts_p4 where id=p_attempt_id for update;
 if not found then raise exception 'PAYMENT_P4_ATTEMPT_NOT_FOUND' using errcode='P0002'; end if;
 select * into h from private.kinto_stock_holds_p4 where attempt_id=a.id for update;
 if not found then raise exception 'PAYMENT_P4_HOLD_NOT_FOUND' using errcode='P0002'; end if;
 if a.status='pending' and a.provider_reference=p_provider_request_id then
   return jsonb_build_object('ok',true,'attempt_id',a.id,'status','pending','reused',true);
 end if;
 if a.status<>'reserved' or h.status<>'active' or h.expires_at<=clock_timestamp() then
   raise exception 'PAYMENT_P4_ATTEMPT_NOT_STARTABLE' using errcode='55000'; end if;
 insert into private.kinto_payment_events_p4(attempt_id,provider_key,provider_event_id,outcome)
   values(a.id,a.provider_key,p_provider_request_id,'pending')
   on conflict(provider_key,provider_event_id) do nothing returning id into v_event_id;
 if v_event_id is null then
   if not exists(select 1 from private.kinto_payment_events_p4 where provider_key=a.provider_key
       and provider_event_id=p_provider_request_id and attempt_id=a.id and outcome='pending') then
     raise exception 'PAYMENT_P4_PROVIDER_REQUEST_REPLAY_MISMATCH' using errcode='23505'; end if;
 end if;
 update private.kinto_payment_attempts_p4 set status='pending',provider_reference=p_provider_request_id,updated_at=clock_timestamp() where id=a.id;
 return jsonb_build_object('ok',true,'attempt_id',a.id,'status','pending','provider_reference',p_provider_request_id,'reused',v_event_id is null);
end;
$mark_pending$;
revoke all on function public.kinto_payment_attempt_mark_pending_p4(uuid,text) from public,anon,authenticated;
grant execute on function public.kinto_payment_attempt_mark_pending_p4(uuid,text) to service_role;

create or replace function public.kinto_payment_attempt_event_p4(
 p_attempt_id uuid,p_provider_key text,p_provider_event_id text,p_outcome text,p_evidence_digest text default null
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $event$
declare a private.kinto_payment_attempts_p4%rowtype; h private.kinto_stock_holds_p4%rowtype; v_id bigint;
        ctl private.kinto_payment_runtime_p4%rowtype;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 if p_attempt_id is null or p_provider_key is null or p_provider_event_id is null or p_provider_event_id !~ '^[A-Za-z0-9._:-]{1,160}$'
   or p_outcome is null or p_outcome not in ('pending','failed','cancelled','succeeded','unknown') then raise exception 'PAYMENT_P4_EVENT_INVALID' using errcode='22023'; end if;
 -- Serialize provider outcomes with mode switches and order admission.
 select * into ctl from private.kinto_payment_runtime_p4 where singleton=true for update;
 if not found then raise exception 'PAYMENT_P4_MODE_NOT_CONFIGURED' using errcode='55000'; end if;
 select * into a from private.kinto_payment_attempts_p4 where id=p_attempt_id for update;
 if not found then raise exception 'PAYMENT_P4_ATTEMPT_NOT_FOUND' using errcode='P0002'; end if;
 if a.provider_key is distinct from p_provider_key then raise exception 'PAYMENT_P4_PROVIDER_MISMATCH' using errcode='55000'; end if;
 insert into private.kinto_payment_events_p4(attempt_id,provider_key,provider_event_id,outcome,evidence_digest)
   values(p_attempt_id,p_provider_key,p_provider_event_id,p_outcome,left(p_evidence_digest,256))
   on conflict(provider_key,provider_event_id) do nothing returning id into v_id;
 if v_id is null then
   if exists(select 1 from private.kinto_payment_events_p4 where provider_key=p_provider_key and provider_event_id=p_provider_event_id
      and (attempt_id<>p_attempt_id or outcome<>p_outcome or evidence_digest is distinct from left(p_evidence_digest,256))) then
     raise exception 'PAYMENT_P4_EVENT_REPLAY_MISMATCH' using errcode='23505'; end if;
   return jsonb_build_object('ok',true,'duplicate',true,'attempt_id',p_attempt_id,'status',a.status);
 end if;
 select * into h from private.kinto_stock_holds_p4 where attempt_id=p_attempt_id for update;
 if not found then raise exception 'PAYMENT_P4_HOLD_NOT_FOUND' using errcode='P0002'; end if;
 if a.status in ('failed','cancelled','expired') then
   if p_outcome='succeeded' or p_outcome='unknown' then
     update private.kinto_payment_runtime_p4 set transition_state='draining',target_mode='manual',updated_at=clock_timestamp(),
       updated_by='late_provider_outcome' where singleton=true;
     update private.kinto_payment_attempts_p4 set status='reconciliation_required',updated_at=clock_timestamp() where id=a.id;
     update private.kinto_stock_holds_p4 set status='reconciliation_required',released_at=null,release_reason=null where id=h.id;
     return jsonb_build_object('ok',true,'duplicate',false,'attempt_id',a.id,'status','reconciliation_required',
       'hold_status','reconciliation_required','late_event',true,'transition_state','draining','target_mode','manual');
   end if;
   return jsonb_build_object('ok',true,'duplicate',false,'attempt_id',a.id,'status',a.status,'late_event',true);
 end if;
 -- Once a charge or an unknown result has been observed, a later failure/cancel
 -- notification alone is not enough to free stock. Require an audited admin
 -- reconciliation that explicitly confirms no charge or a settled refund.
 if a.status='reconciliation_required' and p_outcome in ('failed','cancelled') then
   update private.kinto_payment_attempts_p4 set updated_at=clock_timestamp() where id=a.id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required',released_at=null,release_reason=null where id=h.id;
   return jsonb_build_object('ok',true,'duplicate',false,'attempt_id',a.id,'status','reconciliation_required',
     'hold_status','reconciliation_required','requires_admin_reconciliation',true);
 end if;
 if p_outcome in ('failed','cancelled') then
   update private.kinto_payment_attempts_p4 set status=p_outcome,updated_at=clock_timestamp() where id=a.id;
   update private.kinto_stock_holds_p4 set status='released',released_at=clock_timestamp(),release_reason='verified_provider_'||p_outcome where id=h.id and status in ('active','reconciliation_required');
 elsif p_outcome='succeeded' then
   -- P4 has no order finalizer. A successful charge remains held for reconciliation.
   update private.kinto_payment_runtime_p4 set transition_state='draining',target_mode='manual',updated_at=clock_timestamp(),
     updated_by='provider_success_without_finalizer' where singleton=true;
   update private.kinto_payment_attempts_p4 set status='reconciliation_required',provider_reference=coalesce(provider_reference,p_provider_event_id),updated_at=clock_timestamp() where id=a.id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required' where id=h.id and status='active';
 elsif p_outcome='unknown' then
   update private.kinto_payment_attempts_p4 set status='reconciliation_required',updated_at=clock_timestamp() where id=a.id;
   update private.kinto_stock_holds_p4 set status='reconciliation_required' where id=h.id and status='active';
 else
   update private.kinto_payment_attempts_p4 set status='pending',provider_reference=coalesce(provider_reference,p_provider_event_id),updated_at=clock_timestamp() where id=a.id;
 end if;
 return jsonb_build_object('ok',true,'duplicate',false,'attempt_id',a.id,'status',case when p_outcome in ('unknown','succeeded') then 'reconciliation_required' else p_outcome end,'hold_status',case when p_outcome in ('failed','cancelled') then 'released' when p_outcome in ('unknown','succeeded') then 'reconciliation_required' else h.status end,
   'transition_state',case when p_outcome='succeeded' and ctl.transition_state='stable' then 'draining' else ctl.transition_state end);
end;
$event$;
revoke all on function public.kinto_payment_attempt_event_p4(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.kinto_payment_attempt_event_p4(uuid,text,text,text,text) to service_role;

create or replace function public.kinto_payment_attempt_reconcile_p4(
 p_session_token text,p_attempt_id uuid,p_resolution text,p_evidence_reference text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $reconcile$
declare v_admin text; a private.kinto_payment_attempts_p4%rowtype; h private.kinto_stock_holds_p4%rowtype;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_attempt_id is null or p_resolution is null or p_resolution not in ('confirmed_no_charge','refunded')
    or p_evidence_reference is null or length(btrim(p_evidence_reference)) not between 8 and 200 then
   raise exception 'PAYMENT_P4_RECONCILIATION_INPUT_INVALID' using errcode='22023'; end if;
 select * into a from private.kinto_payment_attempts_p4 where id=p_attempt_id for update;
 if not found then raise exception 'PAYMENT_P4_ATTEMPT_NOT_FOUND' using errcode='P0002'; end if;
 select * into h from private.kinto_stock_holds_p4 where attempt_id=a.id for update;
 if not found then raise exception 'PAYMENT_P4_HOLD_NOT_FOUND' using errcode='P0002'; end if;
 if a.status not in ('pending','reconciliation_required') or h.status not in ('active','reconciliation_required') then
   raise exception 'PAYMENT_P4_ATTEMPT_NOT_RECONCILABLE' using errcode='55000'; end if;
 insert into private.kinto_payment_reconciliation_audit_p4(attempt_id,actor_id,resolution,evidence_reference)
   values(a.id,v_admin,p_resolution,btrim(p_evidence_reference));
 update private.kinto_payment_attempts_p4 set status=case when p_resolution='refunded' then 'cancelled' else 'failed' end,
   updated_at=clock_timestamp() where id=a.id;
 update private.kinto_stock_holds_p4 set status='released',released_at=clock_timestamp(),
   release_reason='admin_reconciled_'||p_resolution where id=h.id;
 return jsonb_build_object('ok',true,'attempt_id',a.id,'status',case when p_resolution='refunded' then 'cancelled' else 'failed' end,
   'hold_status','released','resolution',p_resolution);
end;
$reconcile$;
revoke all on function public.kinto_payment_attempt_reconcile_p4(text,uuid,text,text) from public;
grant execute on function public.kinto_payment_attempt_reconcile_p4(text,uuid,text,text) to anon,authenticated;

create or replace function public.kinto_payment_attempt_expire_p4(p_limit integer default 200)
returns integer language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $expire$
declare v_count integer;
begin
 if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'SERVICE_ROLE_REQUIRED' using errcode='42501'; end if;
 if p_limit is null or p_limit<1 or p_limit>2000 then raise exception 'PAYMENT_P4_EXPIRY_LIMIT_INVALID' using errcode='22023'; end if;
 with due as (
  select a.id,h.id hold_id from private.kinto_payment_attempts_p4 a
   join private.kinto_stock_holds_p4 h on h.attempt_id=a.id
   where a.status in ('new','reserved') and h.status='active' and h.expires_at<=clock_timestamp()
   order by h.expires_at,a.id for update of a,h skip locked limit p_limit
 ), changed as (
  update private.kinto_payment_attempts_p4 a set status='expired',updated_at=clock_timestamp()
   from due where a.id=due.id returning a.id
 )
 update private.kinto_stock_holds_p4 h set status='expired',released_at=clock_timestamp(),release_reason='ttl_expired'
  from changed where h.attempt_id=changed.id;
 get diagnostics v_count=row_count;
 -- A provider-started attempt that reaches TTL is ambiguous. Retain its hold.
 update private.kinto_payment_attempts_p4 a set status='reconciliation_required',updated_at=clock_timestamp()
  from private.kinto_stock_holds_p4 h where h.attempt_id=a.id and a.status='pending'
    and h.status='active' and h.expires_at<=clock_timestamp();
 update private.kinto_stock_holds_p4 h set status='reconciliation_required'
  from private.kinto_payment_attempts_p4 a where a.id=h.attempt_id and a.status='reconciliation_required'
    and h.status='active' and h.expires_at<=clock_timestamp();
 return v_count;
end;
$expire$;
revoke all on function public.kinto_payment_attempt_expire_p4(integer) from public,anon,authenticated;
grant execute on function public.kinto_payment_attempt_expire_p4(integer) to service_role;

create or replace function public.kinto_payment_p4_admin_read(p_session_token text)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $read$
declare v_admin text; ctl private.kinto_payment_runtime_p4%rowtype;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 select * into ctl from private.kinto_payment_runtime_p4 where singleton=true;
 return jsonb_build_object('effective_mode',ctl.effective_mode,'transition_state',ctl.transition_state,'target_mode',ctl.target_mode,
  'electronic_admission_ready',ctl.electronic_admission_ready,'real_collection_allowed',false,
  'active_holds',(select count(*) from private.kinto_stock_holds_p4 h join private.kinto_payment_attempts_p4 a on a.id=h.attempt_id
    where h.status in ('active','reconciliation_required') and (h.status='reconciliation_required' or h.expires_at>clock_timestamp()
      or a.status in ('pending','succeeded','reconciliation_required'))),
  'unresolved_attempts',(select count(*) from private.kinto_payment_attempts_p4 a where a.status in ('pending','reconciliation_required')),
  'unresolved_attempt_list',(select coalesce(jsonb_agg(jsonb_build_object('attempt_id',a.id,'provider_key',a.provider_key,
      'provider_reference',a.provider_reference,'currency',a.currency,'amount',a.amount,'status',a.status,
      'expires_at',h.expires_at) order by a.created_at,a.id),'[]'::jsonb)
    from private.kinto_payment_attempts_p4 a join private.kinto_stock_holds_p4 h on h.attempt_id=a.id
    where a.status in ('pending','reconciliation_required') and h.status in ('active','reconciliation_required')),
  'emergency_stop',(select r.emergency_stop from public.kinto_payment_runtime_p2 r where singleton=true));
end;
$read$;
revoke all on function public.kinto_payment_p4_admin_read(text) from public;
grant execute on function public.kinto_payment_p4_admin_read(text) to anon,authenticated;

create or replace function public.kinto_payment_p4_attempt_read_admin(p_session_token text,p_attempt_id uuid)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp as $attempt_read$
declare v_admin text; a private.kinto_payment_attempts_p4%rowtype; h private.kinto_stock_holds_p4%rowtype; v_lines jsonb;
begin
 v_admin:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 select * into a from private.kinto_payment_attempts_p4 where id=p_attempt_id;
 if not found then raise exception 'PAYMENT_P4_ATTEMPT_NOT_FOUND' using errcode='P0002'; end if;
 select * into h from private.kinto_stock_holds_p4 where attempt_id=a.id;
 select coalesce(jsonb_agg(jsonb_build_object('store_id',l.store_id,'product_id',l.product_id,
    'selected_options',l.selected_options,'matrix_key',l.matrix_key,'quantity',l.quantity) order by l.id),'[]'::jsonb)
   into v_lines from private.kinto_stock_hold_lines_p4 l where l.hold_id=h.id;
 return jsonb_build_object('attempt_id',a.id,'customer_id',a.customer_id,'provider_key',a.provider_key,
  'provider_reference',a.provider_reference,'currency',a.currency,'amount',a.amount,'status',a.status,
  'created_at',a.created_at,'expires_at',a.expires_at,'hold_id',h.id,'hold_status',h.status,
  'hold_expires_at',h.expires_at,'lines',v_lines);
end;
$attempt_read$;
revoke all on function public.kinto_payment_p4_attempt_read_admin(text,uuid) from public;
grant execute on function public.kinto_payment_p4_attempt_read_admin(text,uuid) to anon,authenticated;

comment on table private.kinto_payment_attempts_p4 is 'P4 payment attempt ledger; not an order record. P4 never calls a payment company or authorizes collection.';
comment on table private.kinto_stock_holds_p4 is 'P4 15-minute logical holds. No physical stock is deducted. Unknown or successful-without-finalizer outcomes retain holds past expiry.';
comment on function public.kinto_payment_attempt_reserve_p4(uuid,text,text,numeric,jsonb,jsonb) is 'Service-role only. Stores one idempotent attempt and reserves total, variant, and matrix stock without touching orders or local_products.';
comment on function public.kinto_payment_attempt_mark_pending_p4(uuid,text) is 'Must be called before any outbound provider request. Pending attempts remain held after TTL until a trusted result reconciles them.';

notify pgrst,'reload schema';
commit;
