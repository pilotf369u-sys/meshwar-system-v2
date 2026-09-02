-- KINTO V93 — canonical sequential KN order codes for local cart bundles.
-- Safe scope: only orders whose details.source = 'local_cart_bundle'.

create sequence if not exists public.kinto_local_cart_order_code_seq;

-- Never let the sequence move backwards when the migration is re-applied.
do $$
declare
  v_max bigint;
  v_last bigint;
begin
  select coalesce(max((regexp_match(order_code, '^KN-([0-9]+)$'))[1]::bigint), 0)
    into v_max
  from public.orders
  where order_code ~ '^KN-[0-9]+$';

  select last_value into v_last from public.kinto_local_cart_order_code_seq;

  if v_max > v_last then
    perform setval('public.kinto_local_cart_order_code_seq', v_max, true);
  end if;
end $$;

create or replace function public.meshwar_assign_local_cart_order_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next bigint;
begin
  if coalesce(new.details->>'source', '') <> 'local_cart_bundle' then
    return new;
  end if;

  v_next := nextval('public.kinto_local_cart_order_code_seq');
  new.order_code := 'KN-' || lpad(v_next::text, 6, '0');
  new.details := jsonb_set(
    coalesce(new.details, '{}'::jsonb),
    '{bundle_id}',
    to_jsonb(new.order_code),
    true
  );
  return new;
end;
$$;

drop trigger if exists trg_meshwar_assign_local_cart_order_code on public.orders;
create trigger trg_meshwar_assign_local_cart_order_code
before insert on public.orders
for each row
execute function public.meshwar_assign_local_cart_order_code();

comment on function public.meshwar_assign_local_cart_order_code() is
'Assigns canonical sequential KN-000001 style order_code to local_cart_bundle orders before INSERT so PostgREST return=representation returns the final code.';
