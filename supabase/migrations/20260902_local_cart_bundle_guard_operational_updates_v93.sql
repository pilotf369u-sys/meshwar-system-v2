-- KINTO V93 hotfix — preserve immutable bundle contents while allowing operational order updates.
-- Staff may update status, shipping/payment metadata and other operational fields.
-- Core submitted bundle items/quantities are restored from OLD so partial details updates cannot erase them.

create or replace function public.meshwar_local_cart_bundle_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_d jsonb;
  new_d jsonb;
begin
  begin
    old_d := coalesce(old.details::jsonb, '{}'::jsonb);
    new_d := coalesce(new.details::jsonb, '{}'::jsonb);
  exception when others then
    return new;
  end;

  if coalesce(old_d->>'source','') <> 'local_cart_bundle' then
    return new;
  end if;

  -- Bundle contents are immutable, but operational metadata remains editable.
  -- Preserve the original submitted core even when a dashboard sends a partial details object.
  new_d := jsonb_set(new_d, '{source}', to_jsonb('local_cart_bundle'::text), true);
  new_d := jsonb_set(new_d, '{items}', coalesce(old_d->'items','[]'::jsonb), true);
  if old_d ? 'quantity' then new_d := jsonb_set(new_d, '{quantity}', old_d->'quantity', true); end if;
  if old_d ? 'requested_quantity' then new_d := jsonb_set(new_d, '{requested_quantity}', old_d->'requested_quantity', true); end if;
  if old_d ? 'item_count' then new_d := jsonb_set(new_d, '{item_count}', old_d->'item_count', true); end if;
  if old_d ? 'bundle_id' then new_d := jsonb_set(new_d, '{bundle_id}', old_d->'bundle_id', true); end if;
  if old_d ? 'store_id' then new_d := jsonb_set(new_d, '{store_id}', old_d->'store_id', true); end if;

  new.details := new_d;
  return new;
end;
$$;

drop trigger if exists trg_meshwar_local_cart_bundle_guard on public.orders;
create trigger trg_meshwar_local_cart_bundle_guard
before update of status, details on public.orders
for each row
execute function public.meshwar_local_cart_bundle_guard();
