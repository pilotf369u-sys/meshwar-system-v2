-- V96 ensure every global local-cart order is segmented on insert/update.
-- Pending segments are stored server-side but remain hidden from vendors until
-- payment_confirmed becomes true under the established operational contract.

begin;

create or replace function private.v94_orders_segment_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
begin
  perform private.v94_sync_order_segments(new.id);
  return new;
end;
$$;

drop trigger if exists trg_v94_sync_order_store_segments
  on public.orders;

drop trigger if exists trg_v94_sync_order_store_segments_insert
  on public.orders;

drop trigger if exists trg_v94_sync_order_store_segments_update
  on public.orders;

create trigger trg_v94_sync_order_store_segments_insert
after insert on public.orders
for each row
execute function private.v94_orders_segment_trigger();

create trigger trg_v94_sync_order_store_segments_update
after update of details, status, reference_order_no on public.orders
for each row
execute function private.v94_orders_segment_trigger();

-- Repair any order created while the trigger was missing or stale.
do $$
declare
  v_order record;
begin
  for v_order in
    select o.id
    from public.orders o
    where private.v94_jsonb_object(to_jsonb(o) -> 'details')
            ->> 'source' = 'local_cart_bundle'
  loop
    perform private.v94_sync_order_segments(v_order.id);
  end loop;
end;
$$;

commit;
