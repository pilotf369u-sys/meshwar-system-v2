-- V47 replaces the active bundle stock hook, retaining the old function for rollback.
-- No historical orders/products are updated by this migration.
BEGIN;

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
REVOKE ALL ON FUNCTION public.kinto_apply_option_stock_v47(jsonb,jsonb,integer)
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.kinto_bundle_stock_link_v47()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $v47$
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
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN RETURN NEW; END IF;
  BEGIN
    original := coalesce(OLD.details::jsonb, '{}'::jsonb);
    details := coalesce(NEW.details::jsonb, original);
  EXCEPTION WHEN invalid_text_representation THEN RETURN NEW;
  END;
  IF coalesce(original->>'source','') <> 'local_cart_bundle'
     OR NEW.status <> 'تم التسديد' THEN RETURN NEW; END IF;
  -- Trust the previously persisted marker, never an incoming UI marker.
  IF original->>'bundle_stock_lifecycle_state' = 'deducted' THEN RETURN NEW; END IF;
  IF jsonb_typeof(original->'items') IS DISTINCT FROM 'array'
     OR original->'items' = '[]'::jsonb THEN RAISE EXCEPTION 'V47_BUNDLE_ITEMS_REQUIRED'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(original->'items') AS x(item)
    WHERE nullif(item->>'product_id','') IS NULL
       OR coalesce(item->>'quantity','') !~ '^[0-9]+$'
       OR (item->>'quantity')::numeric < 1
       OR (item->>'quantity')::numeric > 2147483647
  ) THEN RAISE EXCEPTION 'V47_INVALID_BUNDLE_ITEM'; END IF;

  FOR product IN
    SELECT (item->>'product_id')::uuid AS id,
           sum((item->>'quantity')::integer)::integer AS qty
    FROM jsonb_array_elements(original->'items') AS x(item)
    GROUP BY (item->>'product_id')::uuid ORDER BY (item->>'product_id')::uuid
  LOOP
    SELECT p.stock_quantity, coalesce(p.options,'{}'::jsonb)
    INTO before_total, before_options FROM public.local_products p
    WHERE p.id=product.id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Local product % was not found', product.id; END IF;
    IF before_total IS NOT NULL AND before_total < product.qty THEN
      RAISE EXCEPTION 'Insufficient stock for product %. Available %, requested %',
        product.id,before_total,product.qty;
    END IF;
    -- Preserve the existing unmanaged-total behavior.
    IF before_total IS NULL THEN CONTINUE; END IF;
    next_options := before_options;
    FOR line IN
      SELECT item, (item->>'quantity')::integer AS qty
      FROM jsonb_array_elements(original->'items') AS x(item)
      WHERE (item->>'product_id')::uuid=product.id
    LOOP
      next_options := public.kinto_apply_option_stock_v47(next_options,line.item,line.qty);
    END LOOP;
    UPDATE public.local_products p
    SET stock_quantity=before_total-product.qty,
        options=next_options,
        is_out_of_stock=(before_total-product.qty=0)
    WHERE p.id=product.id;
    SELECT p.stock_quantity,p.options INTO saved_total,saved_options
    FROM public.local_products p WHERE p.id=product.id;
    IF saved_total IS DISTINCT FROM before_total-product.qty
       OR saved_options IS DISTINCT FROM next_options THEN
      RAISE EXCEPTION 'V47_STOCK_WRITE_MISMATCH: %',product.id;
    END IF;
    evidence := evidence || jsonb_build_array(jsonb_build_object(
      'product_id',product.id,'quantity',product.qty,
      'total_before',before_total,'total_after',saved_total,
      'variant_before',before_options->'variant_stock',
      'variant_after',saved_options->'variant_stock',
      'matrix_before',before_options->'matrix_stock',
      'matrix_after',saved_options->'matrix_stock'));
  END LOOP;
  details := jsonb_set(details,'{items}',original->'items',true);
  details := jsonb_set(details,'{bundle_stock_lifecycle_state}','"deducted"'::jsonb,true);
  details := jsonb_set(details,'{bundle_stock_deducted_at}',to_jsonb(now()::text),true);
  details := jsonb_set(details,'{bundle_variant_stock_deducted}','true'::jsonb,true);
  details := jsonb_set(details,'{stock_engine_version}', '"v47"'::jsonb,true);
  details := jsonb_set(details,'{stock_deduction_evidence_v47}',evidence,true);
  NEW.details := details::text;
  RETURN NEW;
END;
$v47$;
REVOKE ALL ON FUNCTION public.kinto_bundle_stock_link_v47() FROM PUBLIC,anon,authenticated;

-- Self-checks execute only the JSON helper, with no order/product mutations.
DO $tests$
DECLARE result jsonb; rejected boolean := false;
BEGIN
  result := public.kinto_apply_option_stock_v47(
    '{"variant_stock":{"color":{"برتقالي":24,"بنفسجي":24},"size":{},"volume":{}},"matrix_stock":{}}',
    '{"selected_options":{"color":"برتقالي"}}',2);
  IF result#>>'{variant_stock,color,برتقالي}' <> '22'
     OR result#>>'{variant_stock,color,بنفسجي}' <> '24' THEN
    RAISE EXCEPTION 'V47_TEST_COLOR_FAILED'; END IF;
  result := public.kinto_apply_option_stock_v47(
    '{"variant_stock":{"color":{"red":5},"size":{"L":4},"volume":{"500ml":3},"material":{"cotton":6}},"matrix_stock":{"red_L_500ml":3},"other":"keep"}',
    '{"selected_options":{"color":"red","size":"L","volume":"500ml","material":"cotton"}}',2);
  IF result#>>'{variant_stock,color,red}' <> '3'
     OR result#>>'{variant_stock,size,L}' <> '2'
     OR result#>>'{variant_stock,volume,500ml}' <> '1'
     OR result#>>'{variant_stock,material,cotton}' <> '4'
     OR result#>>'{matrix_stock,red_L_500ml}' <> '1'
     OR result->>'other' <> 'keep' THEN RAISE EXCEPTION 'V47_TEST_GROUPS_FAILED'; END IF;
  BEGIN
    PERFORM public.kinto_apply_option_stock_v47(
      '{"variant_stock":{"color":{"red":1}}}',
      '{"selected_options":{"color":"red"}}',2);
  EXCEPTION WHEN raise_exception THEN rejected := true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'V47_TEST_OVERDRAW_FAILED'; END IF;
  result := public.kinto_apply_option_stock_v47(
    '{"variant_stock":{"color":{"red":4}}}',
    '{"selected_options":{"color":"blue"}}',1);
  IF result#>>'{variant_stock,color,red}' <> '4' THEN
    RAISE EXCEPTION 'V47_TEST_UNMANAGED_SELECTION_FAILED'; END IF;
END;
$tests$;

-- Replace one active hook at the existing position in trigger ordering.
DROP TRIGGER IF EXISTS trg_meshwar_local_cart_bundle_stock_lifecycle ON public.orders;
CREATE TRIGGER trg_meshwar_local_cart_bundle_stock_lifecycle
BEFORE UPDATE OF status ON public.orders FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.kinto_bundle_stock_link_v47();
NOTIFY pgrst,'reload schema';
COMMIT;

SELECT t.tgname,p.proname AS active_stock_function
FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
WHERE t.tgrelid='public.orders'::regclass
AND t.tgname='trg_meshwar_local_cart_bundle_stock_lifecycle';
