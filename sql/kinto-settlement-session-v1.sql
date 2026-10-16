-- Additive stage: no ACL revocation, trigger attachment, or historical row updates.
BEGIN;
ALTER TABLE public.settlements ADD COLUMN IF NOT EXISTS calculation_basis text;
ALTER TABLE public.delivery_settlements
 ADD COLUMN IF NOT EXISTS currency text, ADD COLUMN IF NOT EXISTS order_ids jsonb,
 ADD COLUMN IF NOT EXISTS notes text, ADD COLUMN IF NOT EXISTS settled_by_type text,
 ADD COLUMN IF NOT EXISTS settled_by_id text, ADD COLUMN IF NOT EXISTS courier_id text,
 ADD COLUMN IF NOT EXISTS courier_name text, ADD COLUMN IF NOT EXISTS branch_name text;

CREATE OR REPLACE FUNCTION private.kinto_settlement_actor_v1(p_role text,p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
BEGIN
 IF p_role IS NULL OR p_role NOT IN ('admin','branch') THEN RAISE EXCEPTION 'SETTLEMENT_ROLE_REQUIRED' USING ERRCODE='42501'; END IF;
 RETURN private.kinto_staff_actor_v1(p_role,p_token);
END $$;
REVOKE ALL ON FUNCTION private.kinto_settlement_actor_v1(text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION private.kinto_settlement_amounts_v1(p_price numeric,p_fee numeric,p_payment text,p_basis text)
RETURNS TABLE(gross numeric,fee numeric,net numeric) LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$
 WITH amounts AS (SELECT coalesce(p_price,0) price,coalesce(p_fee,0) fee), collected AS (
 SELECT *,CASE p_payment WHEN 'paid_prepaid' THEN 0 WHEN 'product_paid_delivery_cod' THEN fee ELSE price+fee END collected FROM amounts)
 SELECT CASE WHEN p_basis='legacy_goods' THEN price ELSE collected END,fee,
 CASE p_basis WHEN 'legacy_goods' THEN price-fee WHEN 'delivery_report' THEN greatest(0,collected-fee) ELSE collected END FROM collected;
$$;
REVOKE ALL ON FUNCTION private.kinto_settlement_amounts_v1(numeric,numeric,text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_request_settlements_session_v1(
 p_role text,p_session_token text,p_type text,p_branch_id text,p_courier_id text,p_order_ids uuid[],p_basis text DEFAULT 'collection')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor jsonb; bid text; entry public.orders%rowtype; locked jsonb:='[]'; bucket record; sid bigint; result jsonb:='[]'; n integer:=0;
BEGIN
 actor:=private.kinto_settlement_actor_v1(p_role,p_session_token);
 bid:=CASE WHEN p_role='branch' THEN actor->>'id' ELSE nullif(btrim(p_branch_id),'') END;
 IF bid IS NULL OR (p_role='branch' AND p_branch_id IS DISTINCT FROM bid) THEN RAISE EXCEPTION 'SETTLEMENT_BRANCH_DENIED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id::text=bid) THEN RAISE EXCEPTION 'SETTLEMENT_BRANCH_NOT_FOUND'; END IF;
 IF p_type IS NULL OR p_type NOT IN ('branch','courier') OR p_basis IS NULL OR p_basis NOT IN ('collection','legacy_goods')
 OR (p_basis='legacy_goods' AND (p_role<>'admin' OR p_type<>'courier')) THEN RAISE EXCEPTION 'SETTLEMENT_REQUEST_INVALID'; END IF;
 IF (p_type='branch' AND p_courier_id IS NOT NULL) OR (p_type='courier' AND NOT EXISTS(SELECT 1 FROM public.couriers c WHERE c.id::text=p_courier_id AND c.branch_id::text=bid)) THEN RAISE EXCEPTION 'SETTLEMENT_COURIER_DENIED'; END IF;
 IF coalesce(cardinality(p_order_ids),0) NOT BETWEEN 1 AND 10000 OR (SELECT count(DISTINCT x) FROM unnest(p_order_ids) x)<>cardinality(p_order_ids) THEN RAISE EXCEPTION 'SETTLEMENT_ORDER_IDS_INVALID'; END IF;
 FOR entry IN SELECT * FROM public.orders WHERE id=ANY(p_order_ids) ORDER BY id FOR UPDATE LOOP
  IF entry.branch_id IS DISTINCT FROM bid OR entry.status IS DISTINCT FROM 'تم التسليم'
  OR entry.settlement_id IS NOT NULL OR (p_type='courier' AND entry.courier_id IS DISTINCT FROM p_courier_id) THEN RAISE EXCEPTION 'SETTLEMENT_ORDER_NOT_ELIGIBLE'; END IF;
  IF entry.total_price::text IN ('NaN','Infinity','-Infinity') OR entry.delivery_fee::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'SETTLEMENT_AMOUNT_INVALID'; END IF;
  locked:=locked||jsonb_build_array(to_jsonb(entry));n:=n+1;
 END LOOP;
 IF n<>cardinality(p_order_ids) THEN RAISE EXCEPTION 'SETTLEMENT_ORDER_NOT_FOUND'; END IF;
 FOR bucket IN SELECT coalesce(nullif(r->>'currency',''),'$') currency,sum(a.gross) gross,sum(a.fee) fee,sum(a.net) net,
  array_agg((r->>'id')::uuid ORDER BY r->>'id') ids FROM jsonb_array_elements(locked) r
  CROSS JOIN LATERAL private.kinto_settlement_amounts_v1((r->>'total_price')::numeric,(r->>'delivery_fee')::numeric,r->>'delivery_payment_type',p_basis) a GROUP BY 1 ORDER BY 1 LOOP
  INSERT INTO public.settlements(settlement_type,branch_id,courier_id,gross_amount,delivery_fee,net_amount,currency,order_ids,status,requested_by,requested_at,calculation_basis)
  VALUES(p_type,bid,p_courier_id,bucket.gross,bucket.fee,bucket.net,bucket.currency,to_jsonb(bucket.ids),'pending',p_role||':'||(actor->>'id'),now(),p_basis) RETURNING id INTO sid;
  UPDATE public.orders SET settlement_id=sid,settlement_status='pending' WHERE id=ANY(bucket.ids);
  result:=result||jsonb_build_array(jsonb_build_object('id',sid,'currency',bucket.currency,'order_count',cardinality(bucket.ids)));
 END LOOP;
 RETURN jsonb_build_object('ok',true,'created',jsonb_array_length(result),'settlements',result,'order_count',n);
END $$;
REVOKE ALL ON FUNCTION public.kinto_request_settlements_session_v1(text,text,text,text,text,uuid[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_request_settlements_session_v1(text,text,text,text,text,uuid[],text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_decide_settlement_session_v1(p_role text,p_session_token text,p_settlement_id bigint,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor jsonb; claim public.settlements%rowtype; entry public.orders%rowtype; n integer:=0; gross numeric:=0; fee numeric:=0; net numeric:=0; legacy_gross numeric:=0; legacy_net numeric:=0; a record;
BEGIN
 actor:=private.kinto_settlement_actor_v1(p_role,p_session_token);
 IF p_role<>'admin' THEN RAISE EXCEPTION 'SETTLEMENT_ADMIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('approve','reject') THEN RAISE EXCEPTION 'SETTLEMENT_ACTION_INVALID'; END IF;
 SELECT * INTO claim FROM public.settlements WHERE id=p_settlement_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SETTLEMENT_NOT_FOUND'; END IF;
 IF claim.status NOT IN ('pending','pending_admin') THEN RAISE EXCEPTION 'SETTLEMENT_ALREADY_PROCESSED'; END IF;
 FOR entry IN SELECT * FROM public.orders WHERE settlement_id=claim.id ORDER BY id FOR UPDATE LOOP
  n:=n+1;
  IF p_action='approve' THEN
   IF entry.total_price::text IN ('NaN','Infinity','-Infinity') OR entry.delivery_fee::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'SETTLEMENT_AMOUNT_INVALID'; END IF;
   IF entry.branch_id IS DISTINCT FROM claim.branch_id OR entry.status IS DISTINCT FROM 'تم التسليم'
    OR coalesce(nullif(entry.currency,''),'$') IS DISTINCT FROM claim.currency
    OR (claim.settlement_type='courier' AND entry.courier_id IS DISTINCT FROM claim.courier_id)
    OR NOT coalesce(claim.order_ids ? entry.id::text,false) THEN RAISE EXCEPTION 'SETTLEMENT_SNAPSHOT_MISMATCH'; END IF;
   SELECT * INTO a FROM private.kinto_settlement_amounts_v1(entry.total_price,entry.delivery_fee,entry.delivery_payment_type,'collection');gross:=gross+a.gross;fee:=fee+a.fee;net:=net+a.net;
   SELECT * INTO a FROM private.kinto_settlement_amounts_v1(entry.total_price,entry.delivery_fee,entry.delivery_payment_type,'legacy_goods');legacy_gross:=legacy_gross+a.gross;legacy_net:=legacy_net+a.net;
  END IF;
 END LOOP;
 IF p_action='approve' THEN
  IF n=0 OR jsonb_typeof(claim.order_ids) IS DISTINCT FROM 'array' OR n<>jsonb_array_length(claim.order_ids) THEN RAISE EXCEPTION 'SETTLEMENT_SNAPSHOT_MISMATCH'; END IF;
  IF NOT coalesce((coalesce(claim.calculation_basis,'collection')='collection' AND abs(claim.gross_amount-gross)<=0.00000001 AND abs(claim.delivery_fee-fee)<=0.00000001 AND abs(claim.net_amount-net)<=0.00000001)
   OR (claim.settlement_type='courier' AND (claim.calculation_basis IS NULL OR claim.calculation_basis='legacy_goods') AND abs(claim.gross_amount-legacy_gross)<=0.00000001 AND abs(claim.delivery_fee-fee)<=0.00000001 AND abs(claim.net_amount-legacy_net)<=0.00000001),false) THEN RAISE EXCEPTION 'SETTLEMENT_AMOUNT_MISMATCH'; END IF;
  UPDATE public.orders SET settlement_status='settled' WHERE settlement_id=claim.id;
 ELSE UPDATE public.orders SET settlement_id=NULL,settlement_status='unsettled' WHERE settlement_id=claim.id;
 END IF;
 UPDATE public.settlements SET status=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END,approved_by=actor->>'id',approved_at=now() WHERE id=claim.id;
 RETURN jsonb_build_object('ok',true,'id',claim.id,'action',p_action,'order_count',n);
END $$;
REVOKE ALL ON FUNCTION public.kinto_decide_settlement_session_v1(text,text,bigint,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_decide_settlement_session_v1(text,text,bigint,text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_cash_settle_courier_session_v1(p_role text,p_session_token text,p_courier_id text,p_order_ids uuid[],p_notes text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor jsonb; courier public.couriers%rowtype; entry public.orders%rowtype; locked jsonb:='[]'; bucket record; result jsonb:='[]'; n integer:=0; agent uuid; bid text; bname text; sid uuid;
BEGIN
 actor:=private.kinto_settlement_actor_v1(p_role,p_session_token);
 SELECT * INTO courier FROM public.couriers WHERE id::text=p_courier_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'SETTLEMENT_COURIER_NOT_FOUND'; END IF;
 bid:=courier.branch_id::text;agent:=courier.courier_uuid;
 IF agent IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_COURIER_AGENT_ID_REQUIRED'; END IF;
 IF p_role='branch' AND bid IS DISTINCT FROM actor->>'id' THEN RAISE EXCEPTION 'SETTLEMENT_BRANCH_DENIED'; END IF;
 SELECT name INTO bname FROM public.branches WHERE id::text=bid;
 IF coalesce(length(p_notes),0)>4000 OR coalesce(cardinality(p_order_ids),0) NOT BETWEEN 1 AND 10000 OR (SELECT count(DISTINCT x) FROM unnest(p_order_ids) x)<>cardinality(p_order_ids) THEN RAISE EXCEPTION 'SETTLEMENT_REQUEST_INVALID'; END IF;
 FOR entry IN SELECT * FROM public.orders WHERE id=ANY(p_order_ids) ORDER BY id FOR UPDATE LOOP
  IF entry.branch_id IS DISTINCT FROM bid OR entry.status IS DISTINCT FROM 'تم التسليم' OR coalesce(entry.is_settled,false)
  OR NOT (coalesce(entry.courier_id=p_courier_id,false) OR coalesce(entry.delivery_agent_id=agent,false)) THEN RAISE EXCEPTION 'SETTLEMENT_ORDER_NOT_ELIGIBLE'; END IF;
  IF entry.total_price::text IN ('NaN','Infinity','-Infinity') OR entry.delivery_fee::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'SETTLEMENT_AMOUNT_INVALID'; END IF;
  locked:=locked||jsonb_build_array(to_jsonb(entry));n:=n+1;
 END LOOP;
 IF n<>cardinality(p_order_ids) THEN RAISE EXCEPTION 'SETTLEMENT_ORDER_NOT_FOUND'; END IF;
 FOR bucket IN SELECT coalesce(nullif(r->>'currency',''),'$') currency,sum(a.gross) gross,sum(a.fee) fee,sum(a.net) net,array_agg((r->>'id')::uuid ORDER BY r->>'id') ids FROM jsonb_array_elements(locked) r
 CROSS JOIN LATERAL private.kinto_settlement_amounts_v1((r->>'total_price')::numeric,(r->>'delivery_fee')::numeric,r->>'delivery_payment_type','delivery_report') a GROUP BY 1 ORDER BY 1 LOOP
  INSERT INTO public.delivery_settlements(settlement_code,delivery_agent_id,branch_id,total_collected_amount,total_delivery_fees,net_submitted_amount,orders_count,currency,order_ids,notes,settled_by_type,settled_by_id,courier_id,courier_name,branch_name)
  VALUES('DS-'||replace(gen_random_uuid()::text,'-',''),agent,bid::uuid,bucket.gross,bucket.fee,bucket.net,cardinality(bucket.ids),bucket.currency,to_jsonb(bucket.ids),p_notes,p_role,actor->>'id',p_courier_id,courier.name,bname) RETURNING id INTO sid;
  UPDATE public.orders SET is_settled=true WHERE id=ANY(bucket.ids);
  result:=result||jsonb_build_array(jsonb_build_object('id',sid,'currency',bucket.currency,'order_count',cardinality(bucket.ids)));
 END LOOP;
 RETURN jsonb_build_object('ok',true,'created',jsonb_array_length(result),'settlements',result,'order_count',n);
END $$;
REVOKE ALL ON FUNCTION public.kinto_cash_settle_courier_session_v1(text,text,text,uuid[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_cash_settle_courier_session_v1(text,text,text,uuid[],text) TO anon,authenticated;

CREATE OR REPLACE FUNCTION public.kinto_settlements_directory_session_v1(
 p_role text,p_session_token text,p_table text,p_filters jsonb DEFAULT '[]',p_order text DEFAULT 'id',p_ascending boolean DEFAULT true,p_limit integer DEFAULT 2000,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor jsonb; base_sql text; where_sql text:='true'; order_sql text; direction text; f jsonb; field text; op text; result jsonb;
 allowed text[]:=ARRAY['id','branch_id','courier_id','status','settlement_type','currency','requested_at','created_at'];
BEGIN
 actor:=private.kinto_settlement_actor_v1(p_role,p_session_token);
 IF p_table='settlements' THEN base_sql:='SELECT to_jsonb(s) doc FROM public.settlements s';
 ELSIF p_table='delivery_settlements' THEN
  base_sql:='SELECT to_jsonb(s)||jsonb_build_object(''courier_id'',coalesce(s.courier_id,c.id::text,s.delivery_agent_id::text),''courier_name'',coalesce(s.courier_name,c.name),''branch_name'',coalesce(s.branch_name,b.name),''amount'',s.net_submitted_amount,''net_amount'',s.net_submitted_amount,''order_count'',s.orders_count,''settled_at'',s.created_at) doc FROM public.delivery_settlements s LEFT JOIN LATERAL (SELECT x.id,x.name FROM public.couriers x WHERE x.courier_uuid=s.delivery_agent_id ORDER BY x.id LIMIT 1) c ON true LEFT JOIN public.branches b ON b.id=s.branch_id';
 ELSE RAISE EXCEPTION 'SETTLEMENT_DIRECTORY_TABLE_INVALID'; END IF;
 IF p_role='branch' THEN where_sql:=format('doc->>''branch_id''=%L',actor->>'id'); END IF;
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'array' OR jsonb_array_length(p_filters)>32 OR p_order IS NULL OR NOT p_order=ANY(allowed)
 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 10000 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 10000000 THEN RAISE EXCEPTION 'SETTLEMENT_DIRECTORY_QUERY_INVALID'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p_filters) LOOP
  field:=f->>'field';op:=f->>'op';
  IF field IS NULL OR NOT field=ANY(allowed) OR op IS NULL OR op NOT IN ('eq','in','gte','lte') THEN RAISE EXCEPTION 'SETTLEMENT_DIRECTORY_FILTER_INVALID'; END IF;
  IF op='in' THEN
   IF jsonb_typeof(f->'value') IS DISTINCT FROM 'array' OR jsonb_array_length(f->'value')>10000 THEN RAISE EXCEPTION 'SETTLEMENT_DIRECTORY_FILTER_INVALID'; END IF;
   where_sql:=where_sql||format(' AND doc->>%L IN (SELECT jsonb_array_elements_text(%L::jsonb))',field,(f->'value')::text);
  ELSIF op IN ('gte','lte') THEN
   IF field NOT IN ('requested_at','created_at') OR jsonb_typeof(f->'value') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'SETTLEMENT_DIRECTORY_FILTER_INVALID'; END IF;
   where_sql:=where_sql||format(' AND (doc->>%L)::timestamptz %s %L::timestamptz',field,CASE WHEN op='gte' THEN '>=' ELSE '<=' END,f->>'value');
  ELSE
   IF jsonb_typeof(f->'value') NOT IN ('string','number') OR f->'value' IS NULL THEN RAISE EXCEPTION 'SETTLEMENT_DIRECTORY_FILTER_INVALID'; END IF;
   where_sql:=where_sql||format(' AND doc->>%L=%L',field,f->>'value');
  END IF;
 END LOOP;
 direction:=CASE WHEN coalesce(p_ascending,true) THEN 'ASC' ELSE 'DESC' END;
 order_sql:=format('(doc->>%L)',p_order);
 IF p_order IN ('created_at','requested_at') THEN order_sql:=order_sql||'::timestamptz';
 ELSIF p_order='id' AND p_table='settlements' THEN order_sql:=order_sql||'::bigint'; END IF;
 EXECUTE format('WITH base AS (%s), matched AS MATERIALIZED (SELECT doc FROM base WHERE %s), page AS (SELECT doc FROM matched ORDER BY %s %s,doc->>''id'' %s LIMIT %s OFFSET %s) SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(doc ORDER BY %s %s,doc->>''id'' %s) FROM page),''[]''::jsonb),''count'',(SELECT count(*) FROM matched))',base_sql,where_sql,order_sql,direction,direction,p_limit,p_offset,order_sql,direction,direction) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.kinto_settlements_directory_session_v1(text,text,text,jsonb,text,boolean,integer,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_settlements_directory_session_v1(text,text,text,jsonb,text,boolean,integer,integer) TO anon,authenticated;

-- SECURITY INVOKER is intentional: current_user must remain the Data API role.
-- Created now, attached only by the final lockdown after frontend deployment.
CREATE OR REPLACE FUNCTION private.kinto_order_settlement_guard_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF current_user NOT IN ('anon','authenticated') THEN
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.settlement_id IS NOT NULL OR coalesce(NEW.is_settled,false) OR coalesce(NEW.settlement_status,'unsettled') NOT IN ('','unsettled') THEN RAISE EXCEPTION 'SETTLEMENT_SESSION_RPC_REQUIRED' USING ERRCODE='42501'; END IF;
 ELSIF TG_OP='DELETE' THEN
  IF OLD.settlement_id IS NOT NULL OR coalesce(OLD.is_settled,false) THEN RAISE EXCEPTION 'SETTLED_ORDER_DELETE_DENIED' USING ERRCODE='42501'; END IF;
  RETURN OLD;
 ELSE
  IF NEW.settlement_id IS DISTINCT FROM OLD.settlement_id OR NEW.settlement_status IS DISTINCT FROM OLD.settlement_status OR NEW.is_settled IS DISTINCT FROM OLD.is_settled THEN RAISE EXCEPTION 'SETTLEMENT_SESSION_RPC_REQUIRED' USING ERRCODE='42501'; END IF;
  IF (OLD.settlement_id IS NOT NULL OR coalesce(OLD.is_settled,false)) AND
   (NEW.total_price IS DISTINCT FROM OLD.total_price OR NEW.currency IS DISTINCT FROM OLD.currency OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee OR NEW.delivery_payment_type IS DISTINCT FROM OLD.delivery_payment_type OR NEW.branch_id IS DISTINCT FROM OLD.branch_id OR NEW.courier_id IS DISTINCT FROM OLD.courier_id OR NEW.delivery_agent_id IS DISTINCT FROM OLD.delivery_agent_id) THEN RAISE EXCEPTION 'SETTLED_ORDER_FINANCE_LOCKED' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.kinto_order_settlement_guard_v1() FROM PUBLIC,anon,authenticated;
COMMIT;
