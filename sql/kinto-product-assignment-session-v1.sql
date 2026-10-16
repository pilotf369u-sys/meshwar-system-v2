-- Additive session stage. Entire install is atomic; no existing business rows change.
BEGIN;
-- Additive first. Does not revoke table access or modify existing product rows.
CREATE OR REPLACE FUNCTION public.kinto_vendor_product_write_session_v1(
 p_session_token text,p_action text,p_id uuid,p_patch jsonb DEFAULT '{}',p_filters jsonb DEFAULT '[]')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE sid uuid; old_row public.local_products%ROWTYPE; next_row public.local_products%ROWTYPE;
 f jsonb; field text; kind text; clause text:=''; matched boolean; out_row public.local_products%ROWTYPE;
BEGIN
 sid:=private.require_vendor_session(p_session_token);
 IF p_action IS NULL OR p_action NOT IN ('insert','update','delete') THEN RAISE EXCEPTION 'PRODUCT_ACTION_DENIED'; END IF;
 IF jsonb_typeof(p_filters) IS DISTINCT FROM 'array' OR jsonb_array_length(p_filters)>12 THEN RAISE EXCEPTION 'PRODUCT_FILTER_INVALID'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_patch) k(key) WHERE k.key<>ALL(ARRAY[
 'store_id','product_name','image_url','description','base_price','discount_price','currency','is_out_of_stock','stock_quantity',
 'low_stock_threshold','options','updated_at','category_id','subcategory_id','is_featured','barcode','cost_price'])) THEN RAISE EXCEPTION 'PRODUCT_PATCH_DENIED'; END IF;
 IF p_patch ? 'store_id' AND p_patch->>'store_id' IS DISTINCT FROM sid::text THEN RAISE EXCEPTION 'PRODUCT_STORE_DENIED' USING ERRCODE='42501'; END IF;
 IF p_action='insert' THEN
  IF p_id IS NOT NULL OR p_filters<>'[]'::jsonb THEN RAISE EXCEPTION 'PRODUCT_INSERT_INVALID'; END IF;
  next_row:=jsonb_populate_record(NULL::public.local_products,jsonb_build_object('store_id',sid,'currency','USD','stock_quantity',0,
   'low_stock_threshold',3,'is_out_of_stock',false,'is_featured',false,'options',jsonb_build_object('colors','[]'::jsonb,'sizes','[]'::jsonb,'volumes','[]'::jsonb))||p_patch);
 ELSE
  IF p_id IS NULL THEN RAISE EXCEPTION 'PRODUCT_ID_REQUIRED'; END IF;
  SELECT * INTO old_row FROM public.local_products WHERE id=p_id AND store_id=sid FOR UPDATE;
  IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
  FOR f IN SELECT value FROM jsonb_array_elements(p_filters) LOOP
   field:=f->>'field';
   kind:=CASE field WHEN 'id' THEN 'uuid' WHEN 'store_id' THEN 'uuid' WHEN 'updated_at' THEN 'timestamptz'
    WHEN 'options' THEN 'jsonb' WHEN 'stock_quantity' THEN 'integer' WHEN 'is_out_of_stock' THEN 'boolean' ELSE NULL END;
   IF kind IS NULL OR f->>'op' IS NULL OR f->>'op' NOT IN ('eq','is') THEN RAISE EXCEPTION 'PRODUCT_FILTER_INVALID'; END IF;
   IF f->>'op'='is' THEN
    IF f->'value'<>'null'::jsonb THEN RAISE EXCEPTION 'PRODUCT_FILTER_INVALID'; END IF;
    clause:=clause||format(' AND p.%I IS NULL',field);
   ELSE
    clause:=clause||format(' AND p.%I IS NOT DISTINCT FROM %L::%s',field,CASE WHEN kind='jsonb' THEN (f->'value')::text ELSE f->>'value' END,kind);
   END IF;
  END LOOP;
  EXECUTE 'SELECT EXISTS(SELECT FROM public.local_products p WHERE p.id=$1 AND p.store_id=$2'||clause||')' INTO matched USING p_id,sid;
  IF NOT matched THEN RETURN '[]'::jsonb; END IF;
  IF p_action='delete' THEN DELETE FROM public.local_products WHERE id=p_id AND store_id=sid RETURNING * INTO out_row; RETURN jsonb_build_array(to_jsonb(out_row)); END IF;
  next_row:=jsonb_populate_record(old_row,p_patch);
 END IF;
 next_row.store_id:=sid;
 IF p_action='update' AND (to_jsonb(next_row)-'updated_at')=(to_jsonb(old_row)-'updated_at') THEN RETURN jsonb_build_array(to_jsonb(old_row)); END IF;
 IF nullif(btrim(next_row.product_name),'') IS NULL OR next_row.currency IS NULL OR length(next_row.currency)>16
 OR next_row.base_price IS NULL OR next_row.base_price<0 OR next_row.base_price::text IN ('NaN','Infinity','-Infinity')
 OR (next_row.discount_price IS NOT NULL AND (next_row.discount_price<0 OR next_row.discount_price>next_row.base_price OR next_row.discount_price::text IN ('NaN','Infinity','-Infinity')))
 OR (next_row.cost_price IS NOT NULL AND (next_row.cost_price<0 OR next_row.cost_price::text IN ('NaN','Infinity','-Infinity')))
 OR next_row.stock_quantity IS NULL OR next_row.stock_quantity<0 OR next_row.low_stock_threshold IS NULL OR next_row.low_stock_threshold<0
 OR jsonb_typeof(next_row.options) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'PRODUCT_VALUES_INVALID'; END IF;
 IF (next_row.category_id IS NOT NULL AND (p_action='insert' OR next_row.category_id IS DISTINCT FROM old_row.category_id)
  AND NOT EXISTS(SELECT FROM public.store_categories c WHERE c.id=next_row.category_id AND c.store_id=sid))
 OR (next_row.subcategory_id IS NOT NULL AND (p_action='insert' OR next_row.subcategory_id IS DISTINCT FROM old_row.subcategory_id)
  AND NOT EXISTS(SELECT FROM public.store_categories c WHERE c.id=next_row.subcategory_id AND c.store_id=sid)) THEN RAISE EXCEPTION 'PRODUCT_CATEGORY_DENIED'; END IF;
 IF p_action='insert' THEN
  INSERT INTO public.local_products(store_id,product_name,image_url,description,base_price,discount_price,currency,is_out_of_stock,stock_quantity,
   low_stock_threshold,options,category_id,subcategory_id,is_featured,barcode,cost_price,updated_at)
  VALUES(sid,next_row.product_name,next_row.image_url,next_row.description,next_row.base_price,next_row.discount_price,next_row.currency,next_row.is_out_of_stock,
   next_row.stock_quantity,next_row.low_stock_threshold,next_row.options,next_row.category_id,next_row.subcategory_id,next_row.is_featured,next_row.barcode,next_row.cost_price,clock_timestamp()) RETURNING * INTO out_row;
 ELSE
  UPDATE public.local_products SET product_name=next_row.product_name,image_url=next_row.image_url,description=next_row.description,
   base_price=next_row.base_price,discount_price=next_row.discount_price,currency=next_row.currency,is_out_of_stock=next_row.is_out_of_stock,
   stock_quantity=next_row.stock_quantity,low_stock_threshold=next_row.low_stock_threshold,options=next_row.options,category_id=next_row.category_id,
   subcategory_id=next_row.subcategory_id,is_featured=next_row.is_featured,barcode=next_row.barcode,cost_price=next_row.cost_price,updated_at=clock_timestamp()
  WHERE id=p_id AND store_id=sid RETURNING * INTO out_row;
 END IF;
 RETURN jsonb_build_array(to_jsonb(out_row));
END $$;
REVOKE ALL ON FUNCTION public.kinto_vendor_product_write_session_v1(text,text,uuid,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_vendor_product_write_session_v1(text,text,uuid,jsonb,jsonb) TO anon,authenticated;

-- Additive: no direct-API guard attached until clients have deployed.
CREATE OR REPLACE FUNCTION private.kinto_check_order_assignment_v1(actor jsonb,old_row public.orders,new_row public.orders)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE permissions jsonb:=actor->'permissions';
BEGIN
 IF old_row.branch_id IS NOT DISTINCT FROM new_row.branch_id AND old_row.courier_id IS NOT DISTINCT FROM new_row.courier_id
 AND old_row.delivery_agent_id IS NOT DISTINCT FROM new_row.delivery_agent_id THEN RETURN; END IF;
 IF jsonb_typeof(permissions)='string' THEN permissions:=(permissions#>>'{}')::jsonb; END IF;
 IF actor->>'role'='employee' AND (permissions->'branches'='false'::jsonb OR permissions->'manage_branches'='false'::jsonb
  OR permissions->'orders'='false'::jsonb OR permissions->'manage_orders'='false'::jsonb) THEN RAISE EXCEPTION 'ORDER_ASSIGNMENT_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 IF old_row.settlement_id IS NOT NULL OR coalesce(old_row.is_settled,false) THEN RAISE EXCEPTION 'ORDER_ASSIGNMENT_SETTLED' USING ERRCODE='42501'; END IF;
 IF new_row.branch_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.branches b WHERE b.id::text=new_row.branch_id) THEN RAISE EXCEPTION 'ORDER_ASSIGNMENT_BRANCH_INVALID'; END IF;
 IF new_row.courier_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.couriers c WHERE c.id::text=new_row.courier_id AND coalesce(c.is_active,true)
  AND (new_row.branch_id IS NULL OR c.branch_id=new_row.branch_id) AND (new_row.delivery_agent_id IS NULL OR c.courier_uuid=new_row.delivery_agent_id)) THEN RAISE EXCEPTION 'ORDER_ASSIGNMENT_COURIER_INVALID'; END IF;
 IF new_row.delivery_agent_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.couriers c WHERE c.courier_uuid=new_row.delivery_agent_id AND coalesce(c.is_active,true)
  AND (new_row.branch_id IS NULL OR c.branch_id=new_row.branch_id)) THEN RAISE EXCEPTION 'ORDER_ASSIGNMENT_AGENT_INVALID'; END IF;
END $$;
REVOKE ALL ON FUNCTION private.kinto_check_order_assignment_v1(jsonb,public.orders,public.orders) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_save_branch_orders_session_v1(p_role text,p_session_token text,p_branch_id text,p_expected jsonb,p_patch jsonb)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor jsonb; item jsonb; old_row public.orders%ROWTYPE; next_row public.orders%ROWTYPE; cid text; cname text;
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('admin','branch') THEN RAISE EXCEPTION 'BRANCH_ORDER_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 actor:=private.kinto_staff_actor_v1(p_role,p_session_token);
 IF p_branch_id IS NULL OR (p_role='branch' AND actor->>'id' IS DISTINCT FROM p_branch_id) THEN RAISE EXCEPTION 'BRANCH_ORDER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_expected) IS DISTINCT FROM 'array' OR jsonb_array_length(p_expected) NOT BETWEEN 1 AND 500
 OR (SELECT count(*) FROM jsonb_array_elements(p_expected))<>(SELECT count(DISTINCT x->>'id') FROM jsonb_array_elements(p_expected) x)
 THEN RAISE EXCEPTION 'BRANCH_ORDER_SELECTION_INVALID'; END IF;
 IF p_patch IS NULL OR jsonb_typeof(p_patch)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p_patch) k(key) WHERE k.key<>ALL(ARRAY[
 'courier_id','courier_name','delivery_fee','status','delivery_payment_type'])) THEN RAISE EXCEPTION 'BRANCH_ORDER_PATCH_DENIED'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_expected) ORDER BY value->>'id' LOOP
  SELECT * INTO old_row FROM public.orders WHERE id=(item->>'id')::uuid AND branch_id=p_branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'BRANCH_ORDER_NOT_FOUND' USING ERRCODE='42501'; END IF;
  IF old_row.status IS DISTINCT FROM item->>'status' OR old_row.courier_id IS DISTINCT FROM item->>'courier_id'
  OR old_row.delivery_agent_id IS DISTINCT FROM (item->>'delivery_agent_id')::uuid OR old_row.delivery_fee IS DISTINCT FROM (item->>'delivery_fee')::numeric THEN RAISE EXCEPTION 'BRANCH_ORDER_CHANGED_RELOAD'; END IF;
  next_row:=jsonb_populate_record(old_row,p_patch);
  IF next_row.status IS DISTINCT FROM old_row.status AND nullif(btrim(next_row.status),'') IS NULL THEN RAISE EXCEPTION 'BRANCH_ORDER_STATUS_INVALID'; END IF;
  IF p_patch ? 'courier_id' AND next_row.courier_id IS DISTINCT FROM old_row.courier_id THEN
   SELECT c.courier_uuid,c.name INTO next_row.delivery_agent_id,cname FROM public.couriers c WHERE c.id::text=next_row.courier_id;
   IF next_row.courier_id IS NULL THEN next_row.delivery_agent_id:=NULL;cname:=NULL; END IF;
  ELSE cname:=old_row.courier_name; END IF;
  PERFORM private.kinto_check_order_assignment_v1(actor,old_row,next_row);
  IF next_row.delivery_fee IS DISTINCT FROM old_row.delivery_fee AND
    (next_row.delivery_fee IS NULL OR next_row.delivery_fee<0 OR next_row.delivery_fee::text IN ('NaN','Infinity','-Infinity')
     OR old_row.settlement_id IS NOT NULL OR coalesce(old_row.is_settled,false)) THEN RAISE EXCEPTION 'BRANCH_ORDER_FEE_DENIED'; END IF;
  IF next_row.delivery_payment_type IS DISTINCT FROM old_row.delivery_payment_type THEN RAISE EXCEPTION 'BRANCH_ORDER_PAYMENT_TYPE_REQUIRES_ADMIN'; END IF;
  UPDATE public.orders SET courier_id=next_row.courier_id,delivery_agent_id=next_row.delivery_agent_id,courier_name=cname,
   delivery_fee=next_row.delivery_fee,status=next_row.status WHERE id=old_row.id RETURNING * INTO next_row;
  RETURN NEXT to_jsonb(next_row);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.kinto_save_branch_orders_session_v1(text,text,text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_save_branch_orders_session_v1(text,text,text,jsonb,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION private.kinto_order_assignment_api_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF current_user IN ('anon','authenticated') AND
  (NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.courier_id IS DISTINCT FROM OLD.courier_id OR NEW.delivery_agent_id IS DISTINCT FROM OLD.delivery_agent_id
   OR NEW.branch_name IS DISTINCT FROM OLD.branch_name OR NEW.courier_name IS DISTINCT FROM OLD.courier_name) THEN
  RAISE EXCEPTION 'ORDER_ASSIGNMENT_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.kinto_order_assignment_api_guard_v1() FROM PUBLIC,anon,authenticated;
-- Existing authenticated staff save and paid approval need the same assignment validation.
-- Assert exact definitions/anchors before changing either; rollback the entire install on drift.
DO $$ DECLARE signature text; definition text; anchor text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb)',
  'public.kinto_approve_paid_order_v1(text,text,uuid,text,jsonb)'] LOOP
  definition:=pg_get_functiondef(signature::regprocedure);
  IF signature LIKE '%kinto_save_staff_order_session%' THEN
   anchor:='UPDATE public.orders SET status=typed.status';
   IF position('kinto_check_order_assignment_v1(actor,old_row,typed)' IN definition)=0 THEN
    IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'STAFF_ORDER_DEFINITION_DRIFT'; END IF;
    definition:=replace(definition,anchor,'PERFORM private.kinto_check_order_assignment_v1(actor,old_row,typed); '||anchor);
   END IF;
  ELSE
   anchor:='v_typed := jsonb_populate_record(NULL::public.orders, p_patch);';
   IF position('kinto_check_order_assignment_v1' IN definition)=0 THEN
    IF position(anchor IN definition)=0 THEN RAISE EXCEPTION 'PAID_ORDER_DEFINITION_DRIFT'; END IF;
    definition:=replace(definition,anchor,E'IF p_patch ? ''delivery_agent_id'' AND NOT p_patch ? ''courier_id'' THEN\n p_patch:=p_patch||jsonb_build_object(''courier_id'',(SELECT c.id::text FROM public.couriers c WHERE c.courier_uuid=(p_patch->>''delivery_agent_id'')::uuid));\n END IF;\n '||anchor||E'\n  PERFORM private.kinto_check_order_assignment_v1(private.kinto_staff_actor_v1(p_actor,p_session_token),v_old,jsonb_populate_record(v_old,p_patch));');
   END IF;
  END IF;
  EXECUTE definition;
 END LOOP;
END $$;

COMMIT;
