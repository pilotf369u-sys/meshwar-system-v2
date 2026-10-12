-- KINTO V189: versioned cloud-cart writes. Additive migration; preserves all existing carts.
begin;
alter table public.customer_local_carts
  add column if not exists revision_v189 bigint not null default 0;

-- Legacy V130 writers also advance the revision, so V189 detects their updates.
create or replace function public.kinto_cart_revision_legacy_guard_v189()
returns trigger language plpgsql set search_path=public,pg_temp as $tag$
begin
  if new.revision_v189=old.revision_v189 then
    new.revision_v189=old.revision_v189+1;
  end if;
  return new;
end; $tag$;
drop trigger if exists kinto_cart_revision_legacy_guard_v189 on public.customer_local_carts;
create trigger kinto_cart_revision_legacy_guard_v189
before update on public.customer_local_carts
for each row execute function public.kinto_cart_revision_legacy_guard_v189();

create or replace function public.customer_cart_get_v189(p_customer_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_cart record;
begin
  if not exists(select 1 from public.customers where id=p_customer_id) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  select items, updated_at, revision_v189 into v_cart
    from public.customer_local_carts where customer_id=p_customer_id;
  if not found then
    return jsonb_build_object('items','[]'::jsonb,'updated_at',null,'revision',0);
  end if;
  return jsonb_build_object('items',v_cart.items,'updated_at',v_cart.updated_at,'revision',v_cart.revision_v189);
end; $$;

create or replace function public.customer_cart_put_v189(
  p_customer_id uuid, p_items jsonb, p_expected_revision bigint
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_cart record;
begin
  if not exists(select 1 from public.customers where id=p_customer_id) then
    raise exception 'CUSTOMER_NOT_FOUND';
  end if;
  if p_items is null or jsonb_typeof(p_items)<>'array'
     or jsonb_array_length(p_items)>200 or pg_column_size(p_items)>262144 then
    raise exception 'INVALID_CART_ITEMS';
  end if;
  if p_expected_revision is null or p_expected_revision<0 then
    raise exception 'INVALID_CART_REVISION';
  end if;
  -- Serialize competing writers even when the cart row does not yet exist.
  perform pg_advisory_xact_lock(hashtextextended(p_customer_id::text,189));
  select items, updated_at, revision_v189 into v_cart
    from public.customer_local_carts where customer_id=p_customer_id for update;
  if found then
    if v_cart.revision_v189<>p_expected_revision then
      raise exception 'CART_REVISION_CONFLICT' using errcode='P0001';
    end if;
    update public.customer_local_carts
      set items=p_items, updated_at=clock_timestamp(), revision_v189=revision_v189+1
      where customer_id=p_customer_id
      returning items,updated_at,revision_v189 into v_cart;
  else
    if p_expected_revision<>0 then
      raise exception 'CART_REVISION_CONFLICT' using errcode='P0001';
    end if;
    insert into public.customer_local_carts(customer_id,items,updated_at,revision_v189)
      values(p_customer_id,p_items,clock_timestamp(),1)
      returning items,updated_at,revision_v189 into v_cart;
  end if;
  return jsonb_build_object('items',v_cart.items,'updated_at',v_cart.updated_at,'revision',v_cart.revision_v189);
end; $$;

revoke all on function public.customer_cart_get_v189(uuid) from public;
revoke all on function public.customer_cart_put_v189(uuid,jsonb,bigint) from public;
grant execute on function public.customer_cart_get_v189(uuid) to anon,authenticated;
grant execute on function public.customer_cart_put_v189(uuid,jsonb,bigint) to anon,authenticated;
commit;
