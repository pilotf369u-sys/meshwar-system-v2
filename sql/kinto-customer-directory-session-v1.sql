-- Additive stage. Install before the customer-directory frontend deployment.
BEGIN;
CREATE OR REPLACE FUNCTION public.kinto_customer_directory_session_v1(
 p_role text,p_session_token text,p_filters jsonb DEFAULT '[]',p_search text DEFAULT '',
 p_order text DEFAULT 'id',p_ascending boolean DEFAULT true,p_limit integer DEFAULT 2000,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor jsonb; actor_id text; actor_row jsonb; scope_sql text; filter_sql text:='';
 fields text[]; filter_fields text[]:=ARRAY['id','name','phone','secondary_phone','code','email','country','state','created_at'];
 f jsonb; field_name text; op text; result jsonb; sort_direction text;
BEGIN
 fields:=ARRAY['id','created_at','name','phone','secondary_phone','code','country','state','address'];
 IF p_role='customer' THEN
  actor_id:=private.require_customer_review_session(p_session_token)::text;
  scope_sql:=format('c.id::text=%L',actor_id);
 ELSIF p_role='vendor' THEN
  actor_id:=private.require_vendor_session(p_session_token)::text;
  scope_sql:=format('(EXISTS(SELECT 1 FROM public.orders o WHERE o.customer_id=c.id::text AND (EXISTS(SELECT 1 FROM public.order_store_segments s WHERE s.order_id=o.id AND s.store_id::text=%1$L) OR private.v94_jsonb_object(to_jsonb(o)->''details'')->>''store_id''=%1$L OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(private.v94_jsonb_object(to_jsonb(o)->''details'')->''items'')=''array'' THEN private.v94_jsonb_object(to_jsonb(o)->''details'')->''items'' ELSE ''[]''::jsonb END) item WHERE item->>''store_id''=%1$L))) OR EXISTS(SELECT 1 FROM public.kinto_loyalty_wallets w WHERE w.customer_id::text=c.id::text AND w.store_id::text=%1$L) OR EXISTS(SELECT 1 FROM public.kinto_loyalty_coupons w WHERE w.customer_id::text=c.id::text AND w.store_id::text=%1$L))',actor_id);
 ELSIF p_role IN ('admin','employee','branch','courier') THEN
  actor:=private.kinto_staff_actor_v1(p_role,p_session_token);actor_id:=actor->>'id';
  IF p_role IN ('admin','employee') THEN
   IF p_role='employee' AND actor->'permissions'->>'customers'='false' AND actor->'permissions'->>'orders'='false' THEN
    RAISE EXCEPTION 'CUSTOMER_DIRECTORY_PERMISSION_REQUIRED' USING ERRCODE='42501';
   END IF;
   scope_sql:='true';
  ELSIF p_role='branch' THEN
   scope_sql:=format('EXISTS(SELECT 1 FROM public.orders o WHERE o.customer_id=c.id::text AND o.branch_id=%L)',actor_id);
  ELSE
   SELECT to_jsonb(x) INTO actor_row FROM public.couriers x WHERE x.id::text=actor_id;
   scope_sql:=format('EXISTS(SELECT 1 FROM public.orders o WHERE o.customer_id=c.id::text AND (o.courier_id=ANY(%1$L::text[]) OR to_jsonb(o)->>''delivery_agent_id''=ANY(%1$L::text[])) AND (coalesce(o.branch_id,'''')='''' OR o.branch_id=ANY(%2$L::text[])))',
    array_remove(ARRAY[actor_id,actor_row->>'courier_uuid',actor_row->>'delivery_agent_id',actor_row->>'uuid',actor_row->>'user_id'],NULL),
    array_remove(ARRAY[actor_row->>'branch_id',actor_row->>'branch_uuid'],NULL));
  END IF;
 ELSE RAISE EXCEPTION 'CUSTOMER_DIRECTORY_ROLE_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_role IN ('customer','admin') THEN
  fields:=fields||ARRAY['email','cart_items','rewards_log','wallet_balance','wallet_currency','rewards_count','current_cycle_delivered','reward_balances'];
 ELSIF p_role='employee' THEN fields:=fields||ARRAY['email']; END IF;
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'array' OR jsonb_array_length(p_filters)>64
 OR p_order IS NULL OR NOT p_order=ANY(filter_fields) OR length(coalesce(p_search,''))>300
 OR p_limit IS NULL OR p_limit<1 OR p_limit>10000 OR p_offset IS NULL OR p_offset<0 OR p_offset>10000000 THEN
  RAISE EXCEPTION 'CUSTOMER_DIRECTORY_QUERY_INVALID' USING ERRCODE='22023';
 END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p_filters) LOOP
  field_name:=f->>'field';op:=f->>'op';
  IF field_name IS NULL OR NOT field_name=ANY(filter_fields) OR op IS NULL OR op NOT IN ('eq','in','not_null') THEN
   RAISE EXCEPTION 'CUSTOMER_DIRECTORY_FILTER_INVALID' USING ERRCODE='22023';
  END IF;
  IF op='not_null' THEN filter_sql:=filter_sql||format(' AND c.%I IS NOT NULL',field_name);
  ELSIF op='eq' THEN
   IF jsonb_typeof(f->'value') NOT IN ('string','number') OR f->'value' IS NULL THEN RAISE EXCEPTION 'CUSTOMER_DIRECTORY_FILTER_INVALID'; END IF;
   filter_sql:=filter_sql||format(' AND c.%I::text=%L',field_name,f->>'value');
  ELSE
   IF jsonb_typeof(f->'value') IS DISTINCT FROM 'array' OR jsonb_array_length(f->'value')>10000 THEN RAISE EXCEPTION 'CUSTOMER_DIRECTORY_FILTER_INVALID'; END IF;
   filter_sql:=filter_sql||format(' AND c.%I::text IN (SELECT jsonb_array_elements_text(%L::jsonb))',field_name,(f->'value')::text);
  END IF;
 END LOOP;
 IF coalesce(p_search,'')<>'' THEN
  filter_sql:=filter_sql||format(' AND (c.name ILIKE %1$L OR c.phone ILIKE %1$L OR c.secondary_phone ILIKE %1$L OR c.code ILIKE %1$L OR c.email ILIKE %1$L)','%'||p_search||'%');
 END IF;
 sort_direction:=CASE WHEN coalesce(p_ascending,true) THEN 'ASC' ELSE 'DESC' END;
 EXECUTE format('WITH matched AS MATERIALIZED (SELECT c.* FROM public.customers c WHERE %1$s %2$s), page AS (SELECT * FROM matched ORDER BY %3$I %4$s,id %4$s LIMIT %5$s OFFSET %6$s) SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg((SELECT jsonb_object_agg(e.key,e.value) FROM jsonb_each(to_jsonb(t)) e WHERE e.key=ANY($1)) ORDER BY t.%3$I %4$s,t.id %4$s) FROM page t),''[]''::jsonb),''count'',(SELECT count(*) FROM matched))',scope_sql,filter_sql,p_order,sort_direction,p_limit,p_offset) INTO result USING fields;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.kinto_customer_directory_session_v1(text,text,jsonb,text,text,boolean,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_customer_directory_session_v1(text,text,jsonb,text,text,boolean,integer,integer) TO anon,authenticated;
COMMIT;
