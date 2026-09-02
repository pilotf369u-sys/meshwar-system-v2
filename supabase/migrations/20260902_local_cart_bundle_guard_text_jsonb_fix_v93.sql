-- KINTO V93 — fix Bundle Guard text/jsonb operator mismatch.
-- public.orders.details is stored as text in the live schema. All JSON operators
-- must therefore operate on explicitly parsed jsonb values, never on details text.
-- Scope: local_cart_bundle only; operational order updates remain fully editable.

create or replace function public.meshwar_local_cart_bundle_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  old_d jsonb := '{}'::jsonb;
  new_d jsonb := '{}'::jsonb;
begin
  -- Parse the TEXT details column once. Invalid/legacy text must never block an
  -- operational status/shipping/payment update.
  begin
    if old.details is not null and btrim(old.details::text) <> '' then
      old_d := old.details::jsonb;
    end if;
  exception when others then
    return new;
  end;

  if coalesce(old_d->>'source', '') <> 'local_cart_bundle' then
    return new;
  end if;

  begin
    if new.details is not null and btrim(new.details::text) <> '' then
      new_d := new.details::jsonb;
    end if;
  exception when others then
    -- If a dashboard did not provide valid JSON details, preserve the submitted
    -- bundle details instead of failing the whole operational update.
    new_d := old_d;
  end;

  -- Preserve only immutable submitted bundle identity/product fields.
  -- IMPORTANT: no JSON existence operator (?) is ever applied to orders.details.
  new_d := jsonb_set(new_d, '{source}', coalesce(old_d->'source', '"local_cart_bundle"'::jsonb), true);
  new_d := jsonb_set(new_d, '{items}', coalesce(old_d->'items', '[]'::jsonb), true);

  if (old_d->'quantity') is not null then
    new_d := jsonb_set(new_d, '{quantity}', old_d->'quantity', true);
  end if;
  if (old_d->'requested_quantity') is not null then
    new_d := jsonb_set(new_d, '{requested_quantity}', old_d->'requested_quantity', true);
  end if;
  if (old_d->'item_count') is not null then
    new_d := jsonb_set(new_d, '{item_count}', old_d->'item_count', true);
  end if;
  if (old_d->'bundle_id') is not null then
    new_d := jsonb_set(new_d, '{bundle_id}', old_d->'bundle_id', true);
  end if;
  if (old_d->'bundle_version') is not null then
    new_d := jsonb_set(new_d, '{bundle_version}', old_d->'bundle_version', true);
  end if;
  if (old_d->'store_id') is not null then
    new_d := jsonb_set(new_d, '{store_id}', old_d->'store_id', true);
  end if;
  if (old_d->'customer_scope_id') is not null then
    new_d := jsonb_set(new_d, '{customer_scope_id}', old_d->'customer_scope_id', true);
  end if;
  if (old_d->'customer_scope_type') is not null then
    new_d := jsonb_set(new_d, '{customer_scope_type}', old_d->'customer_scope_type', true);
  end if;
  if (old_d->'submitted_at') is not null then
    new_d := jsonb_set(new_d, '{submitted_at}', old_d->'submitted_at', true);
  end if;

  -- Cast back to the physical column type through assignment. Status, shipping,
  -- payment, branch, parcel and all non-immutable metadata remain untouched.
  new.details := new_d::text;
  return new;
end;
$$;

drop trigger if exists trg_meshwar_local_cart_bundle_guard on public.orders;
create trigger trg_meshwar_local_cart_bundle_guard
before update of status, details on public.orders
for each row
execute function public.meshwar_local_cart_bundle_guard();

comment on function public.meshwar_local_cart_bundle_guard() is
'V93 bundle guard: parses orders.details TEXT to jsonb before JSON operations; preserves immutable bundle product fields while allowing operational updates.';
