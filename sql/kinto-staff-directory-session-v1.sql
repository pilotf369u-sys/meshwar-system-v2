-- Additive only: deploy before staff-directory UI. No table ACL/data changes.
BEGIN;
CREATE OR REPLACE FUNCTION private.kinto_staff_actor_v1(p_role text,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor text; row_data jsonb; actual_role text;
BEGIN
 CASE p_role
 WHEN 'admin' THEN actor:=private.require_admin_session_v147(p_token);
 WHEN 'employee' THEN actor:=private.require_employee_session_v143(p_token);
 WHEN 'branch' THEN actor:=private.require_branch_session_v148(p_token);
 WHEN 'courier' THEN actor:=private.require_courier_session_v149(p_token);
 ELSE RAISE EXCEPTION 'STAFF_ROLE_REQUIRED' USING ERRCODE='42501';
 END CASE;
 IF p_role IN ('admin','employee') THEN
  SELECT to_jsonb(e) INTO row_data FROM public.employees e WHERE e.id::text=actor;
  actual_role:=lower(trim(coalesce(row_data->>'role','')));
  IF (p_role='admin' AND actual_role NOT IN ('admin','أدمن','ادمن')) OR
     (p_role='employee' AND actual_role NOT IN ('employee','موظف')) THEN
   RAISE EXCEPTION 'STAFF_ROLE_INVALID' USING ERRCODE='42501';
  END IF;
 ELSIF p_role='branch' THEN
  SELECT to_jsonb(b) INTO row_data FROM public.branches b WHERE b.id::text=actor;
 ELSE
  SELECT to_jsonb(c) INTO row_data FROM public.couriers c WHERE c.id::text=actor;
 END IF;
 IF row_data IS NULL OR lower(coalesce(row_data->>'is_active','true')) IN ('false','0')
 OR lower(coalesce(row_data->>'active','true')) IN ('false','0')
 OR lower(coalesce(row_data->>'disabled','false')) IN ('true','1')
 OR lower(coalesce(row_data->>'status','')) IN ('disabled','inactive','معطل','موقوف') THEN
  RAISE EXCEPTION 'STAFF_ACTOR_DISABLED' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('id',actor,'role',p_role,'branch_id',row_data->>'branch_id','permissions',row_data->'permissions');
END $$;
REVOKE ALL ON FUNCTION private.kinto_staff_actor_v1(text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_staff_directory_session_v1(
 p_role text,p_session_token text,p_table text,p_filters jsonb DEFAULT '[]',
 p_order text DEFAULT 'id',p_ascending boolean DEFAULT true,p_limit integer DEFAULT 2000)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor jsonb; actor_id text; scope_sql text:='true'; filter_sql text:='';
 columns_allowed text[]; f jsonb; field_name text; operator_name text; order_name text;
BEGIN
 actor:=private.kinto_staff_actor_v1(p_role,p_session_token); actor_id:=actor->>'id';
 IF p_table NOT IN ('employees','branches','couriers') OR p_table IS NULL THEN
  RAISE EXCEPTION 'DIRECTORY_TABLE_NOT_ALLOWED' USING ERRCODE='42501';
 END IF;
 IF p_role='employee' AND p_table<>'employees'
 AND actor->'permissions'->>'orders'='false' AND actor->'permissions'->>'branches'='false' THEN
  RAISE EXCEPTION 'DIRECTORY_PERMISSION_REQUIRED' USING ERRCODE='42501';
 END IF;
 IF p_table='employees' THEN
  IF p_role NOT IN ('admin','employee') THEN RAISE EXCEPTION 'DIRECTORY_ROLE_DENIED' USING ERRCODE='42501'; END IF;
  IF p_role='employee' THEN scope_sql:=format('t.id::text=%L',actor_id); END IF;
  columns_allowed:=ARRAY['id','created_at','name','phone','role','branch','status','is_active','permissions'];
 ELSIF p_table='branches' THEN
  IF p_role='branch' THEN scope_sql:=format('t.id::text=%L',actor_id);
  ELSIF p_role='courier' THEN scope_sql:=format('t.id::text=%L',actor->>'branch_id'); END IF;
  -- Legacy opaque payload is intentionally excluded; no credential-bearing JSON.
  columns_allowed:=ARRAY['id','name','phone','status','created_at','updated_at','address'];
 ELSE
  IF p_role='branch' THEN scope_sql:=format('t.branch_id::text=%L',actor_id);
  ELSIF p_role='courier' THEN scope_sql:=format('t.id::text=%L',actor_id); END IF;
  columns_allowed:=ARRAY['id','courier_uuid','branch_id','name','phone','delivery_fee','is_active','created_at'];
 END IF;
 IF jsonb_typeof(p_filters) IS DISTINCT FROM 'array' OR jsonb_array_length(p_filters)>20 THEN
  RAISE EXCEPTION 'DIRECTORY_FILTER_INVALID' USING ERRCODE='22023';
 END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p_filters) LOOP
  field_name:=f->>'field'; operator_name:=f->>'op';
  IF field_name IS NULL OR NOT field_name=ANY(columns_allowed) OR field_name NOT IN ('id','branch_id','phone') THEN
   RAISE EXCEPTION 'DIRECTORY_FILTER_INVALID' USING ERRCODE='22023';
  END IF;
  IF operator_name IN ('eq','neq') AND jsonb_typeof(f->'value') IN ('string','number') THEN
   filter_sql:=filter_sql||format(' AND (to_jsonb(t)->>%L) %s %L',field_name,CASE WHEN operator_name='eq' THEN '=' ELSE '<>' END,f->>'value');
  ELSIF operator_name='in' AND jsonb_typeof(f->'value')='array' AND jsonb_array_length(f->'value')<=2000 THEN
   filter_sql:=filter_sql||format(' AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(%L::jsonb) x(value) WHERE x.value=to_jsonb(t)->>%L)',f->'value',field_name);
  ELSE RAISE EXCEPTION 'DIRECTORY_FILTER_INVALID' USING ERRCODE='22023'; END IF;
 END LOOP;
 order_name:=coalesce(p_order,'id');
 IF order_name NOT IN ('id','name','created_at') THEN RAISE EXCEPTION 'DIRECTORY_ORDER_INVALID' USING ERRCODE='22023'; END IF;
 RETURN QUERY EXECUTE format(
  'SELECT (SELECT jsonb_object_agg(e.key,e.value) FROM jsonb_each(to_jsonb(t)) e WHERE e.key=ANY($1)) FROM public.%I t WHERE (%s) %s ORDER BY t.%I %s,t.id LIMIT $2',
  p_table,scope_sql,filter_sql,order_name,CASE WHEN p_ascending IS FALSE THEN 'DESC' ELSE 'ASC' END)
 USING columns_allowed,least(greatest(coalesce(p_limit,2000),1),2000);
END $$;
REVOKE ALL ON FUNCTION public.kinto_staff_directory_session_v1(text,text,text,jsonb,text,boolean,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_staff_directory_session_v1(text,text,text,jsonb,text,boolean,integer) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_admin_delete_branch_session_v1(p_session_token text,p_branch_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 PERFORM private.kinto_staff_actor_v1('admin',p_session_token);
 PERFORM 1 FROM public.branches WHERE id::text=p_branch_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'BRANCH_NOT_FOUND' USING ERRCODE='P0002'; END IF;
 -- Keep the existing no-linked-orders rule atomic with branch deletion.
 LOCK TABLE public.orders IN SHARE MODE;
 IF EXISTS(SELECT 1 FROM public.orders WHERE branch_id::text=p_branch_id) THEN
  RAISE EXCEPTION 'BRANCH_HAS_ORDERS' USING ERRCODE='23503';
 END IF;
 DELETE FROM public.branches WHERE id::text=p_branch_id;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.kinto_admin_delete_branch_session_v1(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_admin_delete_branch_session_v1(text,text) TO anon,authenticated;
COMMIT;
