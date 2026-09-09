-- KINTO V93 — fix live bundle stock lifecycle TEXT/JSONB mismatch.
-- Root cause: public.orders.details is TEXT-backed, while the live trigger function
-- applied JSONB operators directly to NEW.details (`?`, `->`). Parse once to a
-- local jsonb value before any JSON operation; preserve stock semantics unchanged.

create or replace function public.meshwar_local_cart_bundle_stock_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    item record;
    item_product_id uuid;
    item_qty int;
    current_stock int;
    new_stock int;
    items_array jsonb;
    details_json jsonb := '{}'::jsonb;
begin
    -- Only trigger stock deduction when status changes TO 'تم التسديد' from something else
    if (new.status = 'تم التسديد' and (old.status is null or old.status <> 'تم التسديد')) then

        -- orders.details is TEXT in the live schema. Parse it before using JSON operators.
        begin
            if new.details is not null and btrim(new.details::text) <> '' then
                details_json := new.details::jsonb;
            end if;
        exception when others then
            -- Legacy/invalid details must not cause the generic text/jsonb operator error.
            return new;
        end;

        -- Extract items array from parsed jsonb payload
        if details_json ? 'items' and jsonb_typeof(details_json->'items') = 'array' then
            items_array := details_json->'items';

            for item in select * from jsonb_array_elements(items_array)
            loop
                item_product_id := (item.value->>'product_id')::uuid;
                item_qty := coalesce((item.value->>'quantity')::int, 0);

                if item_product_id is not null and item_qty > 0 then
                    -- Lock the product row and get current stock
                    select stock_quantity into current_stock
                    from public.local_products
                    where id = item_product_id
                    for update;

                    if not found then
                        raise exception 'Product ID % not found during stock deduction.', item_product_id;
                    end if;

                    if current_stock < item_qty then
                        raise exception 'Insufficient stock for product ID %. Available: %, Requested: %', item_product_id, current_stock, item_qty;
                    end if;

                    new_stock := current_stock - item_qty;

                    -- Update stock and out-of-stock flag atomically
                    update public.local_products
                    set
                        stock_quantity = new_stock,
                        is_out_of_stock = (new_stock <= 0),
                        updated_at = now()
                    where id = item_product_id;
                end if;
            end loop;

        end if;

    end if;

    return new;
end;
$$;

comment on function public.meshwar_local_cart_bundle_stock_lifecycle() is
'V93 stock lifecycle: parses orders.details TEXT to jsonb before JSON operators and preserves paid-bundle stock deduction behavior.';
