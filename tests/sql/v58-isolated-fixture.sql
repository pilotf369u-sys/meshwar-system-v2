-- Disposable test database ONLY. Schema doubles; V47 function body supplied by deployment.
create role anon;create role authenticated;create schema private;
create table local_products(id uuid primary key,store_id uuid,stock_quantity integer,options jsonb,is_out_of_stock boolean default false);
create table orders(id uuid primary key,customer_id uuid,status text,total_price numeric,details text,reward_discount_amount numeric default 0,delivery_fee numeric default 2000,currency text default 'IQD',snapshot_cost_price numeric,cost_price numeric);
create table order_store_segments(order_id uuid,store_id uuid,items_snapshot jsonb,quantity_total integer,subtotal_local numeric,payment_confirmed boolean default false,updated_at timestamptz);
create table segment_log(order_id uuid,total numeric,items jsonb);
create function private.require_customer_review_session(token text) returns uuid language plpgsql as $$begin if token='owner' then return '11111111-1111-1111-1111-111111111111'::uuid;elsif token='other' then return '22222222-2222-2222-2222-222222222222'::uuid;else raise exception 'CUSTOMER_SESSION_INVALID';end if;end$$;
create function private.v94_jsonb_object(d jsonb) returns jsonb language sql as $$select case when jsonb_typeof(d)='string' then (d#>>'{}')::jsonb else d end$$;
create function meshwar_matrix_stock_key(d jsonb) returns text language sql immutable as $$select case when count(*)>=2 then string_agg(v,'_' order by ord) else null end from (select nullif(btrim(d->>k),'') v,ord from unnest(array['color','size','volume']) with ordinality a(k,ord)) q where v is not null$$;
create function private.v94_sync_order_segments(oid uuid) returns void language sql as $$insert into segment_log select id,total_price,details::jsonb->'items' from orders where id=oid$$;
CREATE OR REPLACE FUNCTION public.kinto_apply_option_stock_v47(
  p_options jsonb, p_item jsonb, p_qty integer
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $v47$
DECLARE
  result jsonb := coalesce(p_options, '{}'::jsonb);
  stocks jsonb := coalesce(p_options->'variant_stock', '{}'::jsonb);
  selections jsonb := coalesce(p_item->'selected_options', '{}'::jsonb);
  entry record;
  canonical text;
  chosen text;
  available integer;
  normalized jsonb := '{}'::jsonb;
  matrix jsonb := coalesce(p_options->'matrix_stock', '{}'::jsonb);
  matrix_key text;
BEGIN
  IF p_qty IS NULL OR p_qty < 1 THEN RAISE EXCEPTION 'V47_INVALID_QUANTITY'; END IF;
  IF jsonb_typeof(stocks) <> 'object' OR jsonb_typeof(selections) <> 'object' THEN
    RAISE EXCEPTION 'V47_INVALID_OPTIONS';
  END IF;
  -- Enumerate stored groups instead of hardcoding only three variant groups.
  FOR entry IN SELECT key, value FROM jsonb_each(stocks) LOOP
    IF jsonb_typeof(entry.value) <> 'object' THEN
      RAISE EXCEPTION 'V47_INVALID_STOCK_GROUP: %', entry.key;
    END IF;
    IF entry.value = '{}'::jsonb THEN CONTINUE; END IF;
    canonical := CASE entry.key WHEN 'colors' THEN 'color'
      WHEN 'sizes' THEN 'size' WHEN 'volumes' THEN 'volume' ELSE entry.key END;
    chosen := coalesce(
      nullif(selections->>canonical, ''), nullif(selections->>entry.key, ''),
      nullif(p_item->>canonical, ''), nullif(p_item->>('selected_'||canonical), '')
    );
    -- An absent quantity uses total stock, matching the editor's blank-field contract.
    IF chosen IS NULL OR NOT (entry.value ? chosen) THEN CONTINUE; END IF;
    available := (entry.value->>chosen)::integer;
    IF available IS NULL OR available < p_qty THEN
      RAISE EXCEPTION 'Insufficient variant stock for %=%: available %, requested %',
        canonical, chosen, available, p_qty;
    END IF;
    stocks := jsonb_set(stocks, ARRAY[entry.key, chosen], to_jsonb(available-p_qty), false);
  END LOOP;
  -- Preserve the established color_size_volume matrix key format.
  FOREACH canonical IN ARRAY ARRAY['color','size','volume'] LOOP
    chosen := coalesce(nullif(selections->>canonical,''),
      nullif(p_item->>canonical,''), nullif(p_item->>('selected_'||canonical),''), '');
    normalized := jsonb_set(normalized, ARRAY[canonical], to_jsonb(chosen), true);
  END LOOP;
  result := jsonb_set(result, '{variant_stock}', stocks, true);
  IF jsonb_typeof(matrix) <> 'object' THEN RAISE EXCEPTION 'V47_INVALID_MATRIX'; END IF;
  IF matrix <> '{}'::jsonb THEN
    matrix_key := public.meshwar_matrix_stock_key(normalized);
    IF matrix_key IS NULL OR NOT (matrix ? matrix_key) THEN RETURN result; END IF;
    available := (matrix->>matrix_key)::integer;
    IF available IS NULL OR available < p_qty THEN
      RAISE EXCEPTION 'Insufficient matrix stock for combination %. Available %, requested %',
        matrix_key, available, p_qty;
    END IF;
    result := jsonb_set(result, ARRAY['matrix_stock',matrix_key], to_jsonb(available-p_qty), false);
  END IF;
  RETURN result;
END;
$v47$;

CREATE OR REPLACE FUNCTION public.kinto_bundle_stock_link_v47()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
original jsonb;
details jsonb;
product record;
line record;
before_total integer;
before_options jsonb;
next_options jsonb;
saved_options jsonb;
saved_total integer;
evidence jsonb := '[]'::jsonb;
BEGIN
IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
RETURN NEW;
END IF;

BEGIN
original := coalesce(OLD.details::jsonb, '{}'::jsonb);
details := coalesce(NEW.details::jsonb, original);
EXCEPTION WHEN invalid_text_representation THEN
RETURN NEW;
END;

IF coalesce(original->>'source', '') <> 'local_cart_bundle'
OR NEW.status <> 'تم التسديد' THEN
RETURN NEW;
END IF;

IF original->>'bundle_stock_lifecycle_state' = 'deducted' THEN
RETURN NEW;
END IF;

IF jsonb_typeof(original->'items') IS DISTINCT FROM 'array'
OR original->'items' = '[]'::jsonb THEN
RAISE EXCEPTION 'V47_BUNDLE_ITEMS_REQUIRED';
END IF;

IF EXISTS (
SELECT 1
FROM jsonb_array_elements(original->'items') AS x(item)
WHERE nullif(item->>'product_id', '') IS NULL
OR coalesce(item->>'quantity', '') !~ '^[0-9]+$'
OR (item->>'quantity')::numeric < 1
OR (item->>'quantity')::numeric > 2147483647
) THEN
RAISE EXCEPTION 'V47_INVALID_BUNDLE_ITEM';
END IF;

FOR product IN
SELECT
(item->>'product_id')::uuid AS id,
sum((item->>'quantity')::integer)::integer AS qty
FROM jsonb_array_elements(original->'items') AS x(item)
GROUP BY (item->>'product_id')::uuid
ORDER BY (item->>'product_id')::uuid
LOOP
SELECT p.stock_quantity, coalesce(p.options, '{}'::jsonb)
INTO before_total, before_options
FROM public.local_products p
WHERE p.id = product.id
FOR UPDATE;

IF NOT FOUND THEN
RAISE EXCEPTION 'Local product % was not found', product.id;
END IF;

IF before_total IS NOT NULL AND before_total < product.qty THEN
RAISE EXCEPTION
'Insufficient stock for product %. Available %, requested %',
product.id, before_total, product.qty;
END IF;

IF before_total IS NULL THEN
CONTINUE;
END IF;

next_options := before_options;

FOR line IN
SELECT item, (item->>'quantity')::integer AS qty
FROM jsonb_array_elements(original->'items') AS x(item)
WHERE (item->>'product_id')::uuid = product.id
LOOP
next_options := public.kinto_apply_option_stock_v47(
next_options, line.item, line.qty
);
END LOOP;

UPDATE public.local_products p
SET
stock_quantity = before_total - product.qty,
options = next_options,
is_out_of_stock = (before_total - product.qty = 0)
WHERE p.id = product.id;

SELECT p.stock_quantity, p.options
INTO saved_total, saved_options
FROM public.local_products p
WHERE p.id = product.id;

IF saved_total IS DISTINCT FROM before_total - product.qty
OR saved_options IS DISTINCT FROM next_options THEN
RAISE EXCEPTION 'V47_STOCK_WRITE_MISMATCH: %', product.id;
END IF;

evidence := evidence || jsonb_build_array(
jsonb_build_object(
'product_id', product.id,
'quantity', product.qty,
'total_before', before_total,
'total_after', saved_total,
'variant_before', before_options->'variant_stock',
'variant_after', saved_options->'variant_stock',
'matrix_before', before_options->'matrix_stock',
'matrix_after', saved_options->'matrix_stock'
)
);
END LOOP;

details := jsonb_set(details, '{items}', original->'items', true);

details := jsonb_set(
details, '{bundle_stock_lifecycle_state}', '"deducted"'::jsonb, true
);

details := jsonb_set(
details, '{bundle_stock_deducted_at}', to_jsonb(now()::text), true
);

details := jsonb_set(
details, '{bundle_variant_stock_deducted}', 'true'::jsonb, true
);

details := jsonb_set(
details, '{stock_engine_version}', '"v47"'::jsonb, true
);

details := jsonb_set(
details, '{stock_deduction_evidence_v47}', evidence, true
);

NEW.details := details::text;
RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.v94_orders_segment_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private', 'extensions', 'pg_temp'
AS $function$
begin
perform private.v94_sync_order_segments(new.id);
return new;
end;
$function$;
