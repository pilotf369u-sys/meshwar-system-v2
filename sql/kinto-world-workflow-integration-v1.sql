-- REVIEW: connect the global specialty to existing login and fulfillment surfaces.
-- Existing local orders/stock/payment/auth functions are not changed.
BEGIN;
ALTER FUNCTION public.kinto_world_staff_accounts_v1(text) VOLATILE;
ALTER FUNCTION public.kinto_world_list_v1(text,text) VOLATILE;
CREATE FUNCTION public.kinto_world_login_roles_v1(p_identity text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('roles',CASE WHEN EXISTS(SELECT FROM private.kinto_world_accounts_v1 WHERE phone=trim(p_identity) OR regexp_replace(phone,'[^0-9]','','g')=regexp_replace(p_identity,'[^0-9]','','g') AND length(regexp_replace(p_identity,'[^0-9]','','g'))>=5) THEN '["world_employee"]'::jsonb ELSE '[]'::jsonb END)
$$;
CREATE FUNCTION public.kinto_world_staff_login_normalized_v1(p_phone text,p_password text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE canonical text;matches integer;BEGIN
 SELECT phone INTO canonical FROM private.kinto_world_accounts_v1 WHERE phone=trim(p_phone);
 IF canonical IS NULL AND length(regexp_replace(coalesce(p_phone,''),'[^0-9]','','g'))>=5 AND length(coalesce(p_phone,''))<=40 THEN
  SELECT count(*),min(phone) INTO matches,canonical FROM private.kinto_world_accounts_v1 WHERE regexp_replace(phone,'[^0-9]','','g')=regexp_replace(p_phone,'[^0-9]','','g');
  IF matches<>1 THEN canonical:=NULL;END IF;
 END IF;
 RETURN public.kinto_world_staff_login_v1(coalesce(canonical,p_phone),p_password);
END $$;
CREATE TABLE private.kinto_world_fulfillment_v1(order_id uuid PRIMARY KEY REFERENCES private.kinto_world_orders_v1(id),branch_id text,courier_id text,phase text NOT NULL CHECK(phase IN('routed','received','out_for_delivery','delivered')),updated_at timestamptz NOT NULL DEFAULT now(),CHECK(branch_id IS NOT NULL OR courier_id IS NOT NULL));
CREATE TABLE private.kinto_world_fulfillment_events_v1(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,order_id uuid NOT NULL REFERENCES private.kinto_world_orders_v1(id),actor_role text NOT NULL,actor_id text NOT NULL,action text NOT NULL,detail jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE private.kinto_world_fulfillment_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kinto_world_fulfillment_events_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_world_fulfillment_v1,private.kinto_world_fulfillment_events_v1 FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.kinto_world_dispatch_actor_v1(p_role text,p_token text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text;row_data jsonb;BEGIN
 IF p_role IN('world_employee','employee','admin') THEN RETURN private.kinto_world_actor_v1(p_role,p_token)::text;END IF;
 IF p_role='branch' THEN actor:=private.require_branch_session_v148(p_token)::text;SELECT to_jsonb(b) INTO row_data FROM public.branches b WHERE id::text=actor;
 ELSIF p_role='courier' THEN actor:=private.require_courier_session_v149(p_token)::text;SELECT to_jsonb(c) INTO row_data FROM public.couriers c WHERE id::text=actor;
 ELSE RAISE EXCEPTION 'WORLD_ACCESS_DENIED';END IF;
 IF row_data IS NULL OR lower(coalesce(row_data->>'is_active','true')) IN('false','0') OR lower(coalesce(row_data->>'active','true')) IN('false','0') OR lower(coalesce(row_data->>'disabled','false')) IN('true','1') THEN RAISE EXCEPTION 'WORLD_ACCESS_DENIED';END IF;
 RETURN actor;
END $$;
CREATE FUNCTION public.kinto_world_dispatch_directory_v1(p_role text,p_session_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text;BEGIN
 actor:=private.kinto_world_dispatch_actor_v1(p_role,p_session_token);
 IF p_role='courier' THEN RAISE EXCEPTION 'WORLD_ACCESS_DENIED';END IF;
 RETURN jsonb_build_object('branches',CASE WHEN p_role='branch' THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id::text,'name',coalesce(to_jsonb(b)->>'name',to_jsonb(b)->>'branch_name'))),'[]') FROM public.branches b WHERE lower(coalesce(to_jsonb(b)->>'is_active','true')) NOT IN('false','0')) END,'couriers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id::text,'name',to_jsonb(c)->>'name','branch_id',to_jsonb(c)->>'branch_id')),'[]') FROM public.couriers c WHERE lower(coalesce(to_jsonb(c)->>'is_active','true')) NOT IN('false','0') AND (p_role<>'branch' OR to_jsonb(c)->>'branch_id'=actor)));
END $$;
CREATE FUNCTION public.kinto_world_dispatch_list_v1(p_role text,p_session_token text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text;BEGIN
 actor:=private.kinto_world_dispatch_actor_v1(p_role,p_session_token);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'reference','KG-'||lpad(o.order_no::text,greatest(8,length(o.order_no::text)),'0'),'revision',o.revision,'state',o.state,'request',o.request,'total',o.quote->>'total','currency',o.quote->>'currency','paid',o.payment->>'status'='confirmed','fulfillment',to_jsonb(f)) ORDER BY o.created_at DESC) FROM private.kinto_world_orders_v1 o JOIN private.kinto_world_fulfillment_v1 f ON f.order_id=o.id WHERE (p_role IN('world_employee','employee','admin') OR p_role='branch' AND f.branch_id=actor OR p_role='courier' AND f.courier_id=actor)),'[]');
END $$;
CREATE FUNCTION public.kinto_world_dispatch_action_v1(p_role text,p_session_token text,p_order_id uuid,p_expected_revision bigint,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor text;o private.kinto_world_orders_v1;f private.kinto_world_fulfillment_v1;target jsonb;tid text;BEGIN
 actor:=private.kinto_world_dispatch_actor_v1(p_role,p_session_token);
 SELECT * INTO o FROM private.kinto_world_orders_v1 WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORLD_NOT_FOUND';END IF;
 IF o.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'WORLD_REVISION_CONFLICT';END IF;
 IF o.state NOT IN('purchased','shipping') OR o.payment->>'status' IS DISTINCT FROM 'confirmed' THEN RAISE EXCEPTION 'WORLD_DISPATCH_REQUIRES_PAID_PURCHASE';END IF;
 SELECT * INTO f FROM private.kinto_world_fulfillment_v1 WHERE order_id=o.id;
 IF p_action IN('route','reroute') AND p_role IN('world_employee','employee','admin') THEN
  IF f.order_id IS NOT NULL AND p_action='route' THEN RAISE EXCEPTION 'WORLD_ALREADY_ROUTED';END IF;
  IF p_action='reroute' AND (f.order_id IS NULL OR f.phase IN('out_for_delivery','delivered')) THEN RAISE EXCEPTION 'WORLD_DISPATCH_ACTION_DENIED';END IF;
  tid:=p_data->>'target_id';
  IF p_data->>'target_role'='branch' THEN SELECT to_jsonb(b) INTO target FROM public.branches b WHERE id::text=tid;
  ELSIF p_data->>'target_role'='courier' THEN SELECT to_jsonb(c) INTO target FROM public.couriers c WHERE id::text=tid;
  ELSE RAISE EXCEPTION 'WORLD_TARGET_INVALID';END IF;
  IF target IS NULL OR lower(coalesce(target->>'is_active','true')) IN('false','0') OR lower(coalesce(target->>'active','true')) IN('false','0') OR lower(coalesce(target->>'disabled','false')) IN('true','1') THEN RAISE EXCEPTION 'WORLD_TARGET_INVALID';END IF;
  INSERT INTO private.kinto_world_fulfillment_v1(order_id,branch_id,courier_id,phase) VALUES(o.id,CASE WHEN p_data->>'target_role'='branch' THEN tid END,CASE WHEN p_data->>'target_role'='courier' THEN tid END,'routed') ON CONFLICT(order_id) DO UPDATE SET branch_id=excluded.branch_id,courier_id=excluded.courier_id,phase='routed',updated_at=now();
 ELSIF p_action='receive' AND (p_role='branch' AND f.branch_id=actor OR p_role='courier' AND f.courier_id=actor) AND f.phase='routed' THEN
  UPDATE private.kinto_world_fulfillment_v1 SET phase='received',updated_at=now() WHERE order_id=o.id;
 ELSIF p_action='assign_courier' AND p_role='branch' AND f.branch_id=actor AND f.phase='received' AND f.courier_id IS NULL THEN
  tid:=p_data->>'target_id';SELECT to_jsonb(c) INTO target FROM public.couriers c WHERE id::text=tid;
  IF target IS NULL OR target->>'branch_id' IS DISTINCT FROM actor OR lower(coalesce(target->>'is_active','true')) IN('false','0') OR lower(coalesce(target->>'active','true')) IN('false','0') OR lower(coalesce(target->>'disabled','false')) IN('true','1') THEN RAISE EXCEPTION 'WORLD_TARGET_INVALID';END IF;
  UPDATE private.kinto_world_fulfillment_v1 SET courier_id=tid,phase='routed',updated_at=now() WHERE order_id=o.id;
 ELSIF p_action='start_delivery' AND p_role='courier' AND f.courier_id=actor AND f.phase='received' THEN
  UPDATE private.kinto_world_fulfillment_v1 SET phase='out_for_delivery',updated_at=now() WHERE order_id=o.id;
 ELSIF p_action='deliver' AND p_role='courier' AND f.courier_id=actor AND f.phase='out_for_delivery' THEN
  UPDATE private.kinto_world_fulfillment_v1 SET phase='delivered',updated_at=now() WHERE order_id=o.id;
 ELSE RAISE EXCEPTION 'WORLD_DISPATCH_ACTION_DENIED';END IF;
 UPDATE private.kinto_world_orders_v1 SET state=CASE WHEN p_action='deliver' THEN 'delivered' ELSE 'shipping' END,revision=revision+1,updated_at=now() WHERE id=o.id;
 INSERT INTO private.kinto_world_fulfillment_events_v1(order_id,actor_role,actor_id,action,detail) VALUES(o.id,p_role,actor,p_action,p_data);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION private.kinto_world_dispatch_actor_v1(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.kinto_world_staff_login_normalized_v1(text,text),public.kinto_world_login_roles_v1(text),public.kinto_world_dispatch_directory_v1(text,text),public.kinto_world_dispatch_list_v1(text,text),public.kinto_world_dispatch_action_v1(text,text,uuid,bigint,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_world_staff_login_normalized_v1(text,text),public.kinto_world_login_roles_v1(text),public.kinto_world_dispatch_directory_v1(text,text),public.kinto_world_dispatch_list_v1(text,text),public.kinto_world_dispatch_action_v1(text,text,uuid,bigint,text,jsonb) TO anon,authenticated;
COMMIT;
