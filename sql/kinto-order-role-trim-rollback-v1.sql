-- Emergency rollback of the role-label normalization only. Padded legacy roles will be rejected again.
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
 IF (role_name='admin' AND lower(coalesce(row_data->>'role','')) NOT IN ('admin','أدمن','ادمن'))
 OR (role_name='employee' AND lower(coalesce(row_data->>'role','')) NOT IN ('employee','موظف')) THEN RAISE EXCEPTION 'ORDER_ACTOR_ROLE_INVALID' USING ERRCODE='42501'; END IF;
 permissions:=row_data->'permissions';IF jsonb_typeof(permissions)='string' THEN permissions:=(permissions#>>'{}')::jsonb; END IF;
 IF role_name='employee' AND (permissions->'orders'='false'::jsonb OR permissions->'manage_orders'='false'::jsonb) THEN
  RAISE EXCEPTION 'ORDER_SESSION_PERMISSION_DENIED' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('id',actor_id,'role',role_name,'permissions',permissions,'name',row_data->>'name','phone',row_data->>'phone','branch_id',row_data->>'branch_id','courier_uuid',row_data->>'courier_uuid');

END $$;
COMMIT;
