-- Additive install; activate RLS/column restrictions only after client deployment.
BEGIN;
CREATE OR REPLACE FUNCTION private.kinto_request_actor_v1()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE h jsonb; role_name text; token text; actor_id text; actor jsonb; permissions jsonb; row_data jsonb; session_table text; id_column text; account_table text;
BEGIN
 h:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb;
 role_name:=h->>'x-kinto-role';token:=h->>'x-kinto-session';
 IF token IS NULL OR token='' THEN RETURN NULL; END IF;
 -- GET/HEAD are read-only transactions. Validate the existing hashed sessions without updating last_seen_at.
 CASE role_name
 WHEN 'customer' THEN session_table:='customer_review_sessions';id_column:='customer_id';account_table:='customers';
 WHEN 'admin' THEN session_table:='admin_sessions_v147';id_column:='admin_id';account_table:='employees';
 WHEN 'employee' THEN session_table:='employee_sessions_v143';id_column:='employee_id';account_table:='employees';
 WHEN 'branch' THEN session_table:='branch_sessions_v148';id_column:='branch_id';account_table:='branches';
 WHEN 'courier' THEN session_table:='courier_sessions_v149';id_column:='courier_id';account_table:='couriers';
 ELSE RAISE EXCEPTION 'ORDER_SESSION_ROLE_DENIED' USING ERRCODE='42501'; END CASE;
 EXECUTE format('SELECT %I::text FROM public.%I WHERE token_hash=extensions.digest($1,''sha256'') AND revoked_at IS NULL AND expires_at>now() LIMIT 1',id_column,session_table) INTO actor_id USING token;
 IF actor_id IS NULL THEN RAISE EXCEPTION 'ORDER_SESSION_INVALID' USING ERRCODE='42501'; END IF;
 EXECUTE format('SELECT to_jsonb(a) FROM public.%I a WHERE a.id::text=$1',account_table) INTO row_data USING actor_id;
 IF row_data IS NULL OR lower(coalesce(row_data->>'is_active','true')) IN ('false','0')
 OR lower(coalesce(row_data->>'active','true')) IN ('false','0') OR lower(coalesce(row_data->>'disabled','false')) IN ('true','1')
 OR lower(coalesce(row_data->>'status','')) IN ('disabled','inactive','blocked','suspended','معطل','موقوف') THEN RAISE EXCEPTION 'ORDER_ACTOR_DISABLED' USING ERRCODE='42501'; END IF;
 IF (role_name='admin' AND lower(trim(coalesce(row_data->>'role',''))) NOT IN ('admin','أدمن','ادمن'))
 OR (role_name='employee' AND lower(trim(coalesce(row_data->>'role',''))) NOT IN ('employee','موظف')) THEN RAISE EXCEPTION 'ORDER_ACTOR_ROLE_INVALID' USING ERRCODE='42501'; END IF;
 permissions:=row_data->'permissions';IF jsonb_typeof(permissions)='string' THEN permissions:=(permissions#>>'{}')::jsonb; END IF;
 IF role_name='employee' AND (permissions->'orders'='false'::jsonb OR permissions->'manage_orders'='false'::jsonb) THEN
  RAISE EXCEPTION 'ORDER_SESSION_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',actor_id,'role',role_name,'permissions',permissions,'name',row_data->>'name','phone',row_data->>'phone','branch_id',row_data->>'branch_id','courier_uuid',row_data->>'courier_uuid');

END $$;
CREATE OR REPLACE FUNCTION private.kinto_order_visible_v1(o jsonb,a jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog AS $$
 SELECT coalesce(a->>'id' IS NOT NULL AND CASE a->>'role'
 WHEN 'admin' THEN true WHEN 'employee' THEN true
 WHEN 'customer' THEN o->>'customer_id'=a->>'id'
 WHEN 'branch' THEN o->>'branch_id'=a->>'id'
 WHEN 'courier' THEN (o->>'courier_id'=a->>'id' OR o->>'delivery_agent_id'=a->>'courier_uuid')
  AND (coalesce(o->>'branch_id','')='' OR o->>'branch_id'=a->>'branch_id')
 ELSE false END,false)
$$;
REVOKE ALL ON FUNCTION private.kinto_request_actor_v1(),private.kinto_order_visible_v1(jsonb,jsonb) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon,authenticated;
GRANT EXECUTE ON FUNCTION private.kinto_request_actor_v1(),private.kinto_order_visible_v1(jsonb,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_vendor_products_read_session_v1(p_session_token text)
RETURNS SETOF public.local_products LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE sid uuid:=private.require_vendor_session(p_session_token);
BEGIN RETURN QUERY SELECT p.* FROM public.local_products p WHERE p.store_id=sid; END $$;
REVOKE ALL ON FUNCTION public.kinto_vendor_products_read_session_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_vendor_products_read_session_v1(text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_vendor_orders_read_session_v1(p_session_token text)
RETURNS SETOF public.orders LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE sid text:=private.require_vendor_session(p_session_token)::text; o public.orders%ROWTYPE; d jsonb; items jsonb; subtotal numeric; qty numeric;
BEGIN
 FOR o IN SELECT x.* FROM public.orders x WHERE
  private.v94_jsonb_object(to_jsonb(x.details))->>'store_id'=sid OR EXISTS(SELECT 1 FROM jsonb_array_elements(
   CASE WHEN jsonb_typeof(private.v94_jsonb_object(to_jsonb(x.details))->'items')='array' THEN private.v94_jsonb_object(to_jsonb(x.details))->'items' ELSE '[]'::jsonb END) i WHERE i->>'store_id'=sid)
 LOOP
  d:=private.v94_jsonb_object(to_jsonb(o.details));
  IF d->>'source'='local_store' AND d->>'store_id'=sid THEN RETURN NEXT o; CONTINUE; END IF;
  IF d->>'source' IS DISTINCT FROM 'local_cart_bundle' THEN CONTINUE; END IF;
  IF jsonb_typeof(d->'items') IS DISTINCT FROM 'array' THEN CONTINUE; END IF;
  -- Independent checkout already creates one order per store. Keep its canonical shipping/discount/finance snapshots intact.
  IF d->>'checkout_contract'='independent_vendor_orders' AND d->>'store_id'=sid AND jsonb_array_length(d->'items')>0 AND NOT EXISTS(
   SELECT FROM jsonb_array_elements(d->'items') i WHERE i->>'store_id' IS DISTINCT FROM sid) THEN RETURN NEXT o;CONTINUE; END IF;
  SELECT coalesce(jsonb_agg(i),'[]'),coalesce(sum(coalesce(nullif(i->>'line_total_local','')::numeric,
   coalesce(nullif(i->>'unit_price_local','')::numeric,0)*coalesce(nullif(i->>'quantity','')::numeric,1))),0),coalesce(sum(coalesce(nullif(i->>'quantity','')::numeric,1)),0)
   INTO items,subtotal,qty FROM jsonb_array_elements(d->'items') i WHERE i->>'store_id'=sid;
  IF jsonb_array_length(items)=0 THEN CONTINUE; END IF;
  -- A shared bundle is projected on the server. No other store's items, totals or finance metadata leave this RPC.
  d:=jsonb_build_object('source','local_cart_bundle','store_id',sid,'items',items,'quantity',qty,'requested_quantity',qty,
   'store_statuses',jsonb_build_object(sid,d->'store_statuses'->sid),'bundle_stock_lifecycle_state',d->'bundle_stock_lifecycle_state',
   'deal_campaign_id',d->'deal_campaign_id','stock_adjustment_v58',d->'stock_adjustment_v58');
  o:=jsonb_populate_record(NULL::public.orders,jsonb_build_object('id',o.id,'order_code',o.order_code,'reference_order_no',o.reference_order_no,
   'customer_id',o.customer_id,'customer_name',o.customer_name,'customer_phone',o.customer_phone,'created_at',o.created_at,'status',o.status,
   'total_price',subtotal,'currency',o.currency,'details',d::text,'shipping_company_name',o.shipping_company_name,
   'delivery_fee',o.delivery_fee,'delivery_currency',o.delivery_currency,'shipping_snapshot',to_jsonb(o)->'shipping_snapshot',
   'delivery_payment_type',o.delivery_payment_type));
  RETURN NEXT o;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.kinto_vendor_orders_read_session_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_vendor_orders_read_session_v1(text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_vendor_legacy_status_session_v1(p_session_token text,p_order_id uuid,p_next_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE sid text:=private.require_vendor_session(p_session_token)::text; o public.orders%ROWTYPE; d jsonb;
BEGIN
 IF p_next_status IS NULL OR p_next_status NOT IN ('مخزن الشركة','تجهيز شحن','محولة إلى الفرع','تم الشحن','مخزن محلي','مندوب','توزيع داخلي','تم التسليم','رفض التسليم','مرفوض') THEN RAISE EXCEPTION 'VENDOR_STATUS_DENIED'; END IF;
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;d:=private.v94_jsonb_object(to_jsonb(o.details));
 IF NOT FOUND OR d->>'source' IS DISTINCT FROM 'local_cart_bundle'
 OR NOT (coalesce(d->>'bundle_stock_lifecycle_state','')='deducted' OR o.status='تم التسديد')
 OR NOT EXISTS(SELECT FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d->'items')='array' THEN d->'items' ELSE '[]'::jsonb END) i WHERE i->>'store_id'=sid) THEN
  RAISE EXCEPTION 'VENDOR_ORDER_DENIED' USING ERRCODE='42501'; END IF;
 d:=jsonb_set(d,'{store_statuses}',coalesce(d->'store_statuses','{}'::jsonb)||jsonb_build_object(sid,p_next_status));
 UPDATE public.orders SET details=d::text WHERE id=o.id;
END $$;
REVOKE ALL ON FUNCTION public.kinto_vendor_legacy_status_session_v1(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_vendor_legacy_status_session_v1(text,uuid,text) TO anon,authenticated;

-- Retain V161 pricing/stock/order splitting; bind its customer identity to the existing session.
CREATE OR REPLACE FUNCTION public.kinto_checkout_session_v1(p_session_token text,p_customer_shipping jsonb,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE cid uuid:=private.require_customer_review_session(p_session_token); c jsonb;
BEGIN
 SELECT to_jsonb(x) INTO c FROM public.customers x WHERE id=cid;
 IF c IS NULL OR lower(coalesce(c->>'status','active')) IN ('disabled','inactive','blocked','suspended','معطل','موقوف')
 OR lower(coalesce(c->>'is_active','true'))='false' THEN RAISE EXCEPTION 'CHECKOUT_CUSTOMER_DISABLED' USING ERRCODE='42501'; END IF;
 RETURN public.checkout_independent_vendor_orders_v161(cid,c->>'name',c->>'phone',p_customer_shipping,p_items);
END $$;
REVOKE ALL ON FUNCTION public.kinto_checkout_session_v1(text,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_checkout_session_v1(text,jsonb,jsonb) TO anon,authenticated;

CREATE OR REPLACE FUNCTION private.kinto_order_session_write_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE a jsonb; changed text[]; old_d jsonb; new_d jsonb; keys text[]; prepay text[]:=ARRAY[
 'انتظار رد الموظف','بانتظار رد الموظف','بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل',
 'تمت الموافقة - بانتظار الدفع','تمت الموافقة','بانتظار تأكيد الدفع','بانتظار التسديد'];
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN RETURN NEW; END IF;
 a:=private.kinto_request_actor_v1();
 IF a IS NULL THEN RAISE EXCEPTION 'ORDER_SESSION_REQUIRED' USING ERRCODE='42501'; END IF;
 IF TG_OP='INSERT' THEN
  IF a->>'role'<>'customer' OR NEW.customer_id IS DISTINCT FROM a->>'id' OR NEW.status IS DISTINCT FROM 'انتظار رد الموظف'
  OR coalesce(NEW.total_price,0)<>0 OR NEW.branch_id IS NOT NULL OR NEW.courier_id IS NOT NULL OR NEW.delivery_agent_id IS NOT NULL
  OR NEW.settlement_id IS NOT NULL OR coalesce(NEW.is_settled,false) OR coalesce(NEW.delivery_fee,0)<>0
  OR coalesce((to_jsonb(NEW)->>'external_shipping_fee')::numeric,0)<>0 OR coalesce((to_jsonb(NEW)->>'reward_discount_amount')::numeric,0)<>0 THEN RAISE EXCEPTION 'ORDER_INSERT_DENIED' USING ERRCODE='42501'; END IF;
  NEW.customer_name:=a->>'name';NEW.customer_phone:=a->>'phone';
  RETURN NEW;
 END IF;
 IF NOT private.kinto_order_visible_v1(to_jsonb(OLD),a) THEN RAISE EXCEPTION 'ORDER_SCOPE_DENIED' USING ERRCODE='42501'; END IF;
 SELECT coalesce(array_agg(k),'{}') INTO changed FROM jsonb_object_keys(to_jsonb(NEW)) k WHERE to_jsonb(NEW)->k IS DISTINCT FROM to_jsonb(OLD)->k;
 old_d:=private.v94_jsonb_object(to_jsonb(OLD.details));new_d:=private.v94_jsonb_object(to_jsonb(NEW.details));
 IF a->>'role'='customer' THEN
  IF NOT OLD.status=ANY(prepay) OR NOT changed<@ARRAY['details','status','rejection_reason'] THEN RAISE EXCEPTION 'CUSTOMER_ORDER_WRITE_DENIED' USING ERRCODE='42501'; END IF;
  IF (old_d-ARRAY['quantity','requested_quantity']) IS DISTINCT FROM (new_d-ARRAY['quantity','requested_quantity']) THEN RAISE EXCEPTION 'CUSTOMER_ORDER_DETAILS_DENIED'; END IF;
  IF old_d IS DISTINCT FROM new_d AND ((old_d->>'source') IN ('local_cart_bundle','local_store') OR
   jsonb_typeof(new_d->'quantity') IS DISTINCT FROM 'number' OR (new_d->>'quantity')::numeric NOT BETWEEN 1 AND 1000 OR
   (new_d->>'quantity')::numeric<>trunc((new_d->>'quantity')::numeric) OR new_d->'requested_quantity' IS DISTINCT FROM new_d->'quantity') THEN
   RAISE EXCEPTION 'CUSTOMER_ORDER_QUANTITY_DENIED'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (NEW.status='ملغي من قبل العميل' OR
   (NEW.status='تمت الموافقة - بانتظار الدفع' AND OLD.status IN ('بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل') AND OLD.total_price>0)) THEN RAISE EXCEPTION 'CUSTOMER_ORDER_STATUS_DENIED'; END IF;
  IF NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason AND NOT (NEW.status='ملغي من قبل العميل' AND NEW.rejection_reason='ملغي من قبل العميل') THEN RAISE EXCEPTION 'CUSTOMER_ORDER_REASON_DENIED'; END IF;
 ELSIF a->>'role'='courier' THEN
  IF NOT changed<@ARRAY['status','details','rejection_reason'] THEN RAISE EXCEPTION 'COURIER_ORDER_WRITE_DENIED'; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND (OLD.status NOT IN ('جاري التوصيل مع المندوب','مندوب','توزيع داخلي','تم التسليم','رفض التسليم','رفض الطلب','مرفوض')
   OR NEW.status NOT IN ('جاري التوصيل مع المندوب','مندوب','توزيع داخلي','تم التسليم','رفض التسليم','رفض الطلب','مرفوض')) THEN RAISE EXCEPTION 'COURIER_ORDER_STATUS_DENIED'; END IF;
  keys:=ARRAY['delivery_state','delivery_deferred_until','delivery_note','delivery_rejection_reason','delivery_rating','delivery_updated_at',
   'delivery_proof_url','proof_of_delivery_url','delivery_proof_uploaded_at','delivery_proof_courier_id','delivery_proof_verified'];
  IF (old_d-keys) IS DISTINCT FROM (new_d-keys) THEN RAISE EXCEPTION 'COURIER_ORDER_DETAILS_DENIED'; END IF;
  IF new_d->>'delivery_proof_courier_id' IS DISTINCT FROM old_d->>'delivery_proof_courier_id' AND new_d->>'delivery_proof_courier_id' IS DISTINCT FROM a->>'id' THEN RAISE EXCEPTION 'COURIER_PROOF_ID_DENIED'; END IF;
 ELSIF a->>'role' IN ('admin','employee') THEN
  -- Main pricing/status/assignment saves already use the existing narrow session RPCs.
  IF changed<@ARRAY['parcel_image_url'] THEN
   IF OLD.status NOT IN ('مخزن شركة','تجهيز شحن') THEN RAISE EXCEPTION 'PARCEL_STAGE_DENIED'; END IF;
  ELSIF a->>'role'='admin' AND changed<@ARRAY['details'] THEN
   keys:=ARRAY['vendor_other_deductions','vendor_payment_status','vendor_paid_at','vendor_paid_by','vendor_payment_history'];
   IF (old_d-keys) IS DISTINCT FROM (new_d-keys) THEN RAISE EXCEPTION 'ADMIN_ORDER_DETAILS_DENIED'; END IF;
  ELSE RAISE EXCEPTION 'USE_ORDER_SESSION_RPC' USING ERRCODE='42501'; END IF;
 ELSE RAISE EXCEPTION 'ORDER_WRITE_ROLE_DENIED' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.kinto_order_session_write_guard_v1() FROM PUBLIC;
NOTIFY pgrst,'reload schema';
COMMIT;
