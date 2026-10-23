-- REVIEW / approval required before production. Global orders only.
-- Adds two RPCs; no existing tables, local operations or existing functions are changed.
BEGIN;
CREATE FUNCTION public.kinto_world_staff_search_v2(p_role text,p_session_token text,p_search text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;term text;digits text;BEGIN
 IF p_role IS NULL OR p_role NOT IN('world_employee','employee','admin') THEN RAISE EXCEPTION 'WORLD_ACCESS_DENIED';END IF;
 actor:=private.kinto_world_actor_v1(p_role,p_session_token);
 term:=lower(trim(coalesce(p_search,'')));digits:=regexp_replace(term,'[^0-9]','','g');
 IF length(term) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'WORLD_SEARCH_INVALID';END IF;
 RETURN coalesce((SELECT jsonb_agg(private.kinto_world_public_v1(x) ORDER BY x.created_at DESC) FROM (
  SELECT o.* FROM private.kinto_world_orders_v1 o WHERE
   strpos(lower(coalesce(o.request->'contact'->>'name','')),term)>0 OR
   strpos(lower(coalesce(o.request->'contact'->>'phone','')),term)>0 OR
   (length(digits)>=5 AND strpos(regexp_replace(coalesce(o.request->'contact'->>'phone',''),'[^0-9]','','g'),digits)>0) OR
   strpos(lower('KG-'||lpad(o.order_no::text,greatest(8,length(o.order_no::text)),'0')),term)>0 OR
   o.order_no::text=term OR
   strpos(lower(coalesce(o.purchase->>'reference','')),term)>0 OR
   strpos(lower(coalesce(o.purchase->>'tracking','')),term)>0
  ORDER BY o.created_at DESC LIMIT 100
 ) x),'[]');
END $$;
CREATE FUNCTION public.kinto_world_fulfillment_action_v2(p_role text,p_session_token text,p_order_id uuid,p_expected_revision bigint,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid;o private.kinto_world_orders_v1;tracking text;BEGIN
 IF p_role IS NULL OR p_role NOT IN('world_employee','employee','admin') THEN RAISE EXCEPTION 'WORLD_ACCESS_DENIED';END IF;
 actor:=private.kinto_world_actor_v1(p_role,p_session_token);
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>10000 THEN RAISE EXCEPTION 'WORLD_INVALID';END IF;
 SELECT * INTO o FROM private.kinto_world_orders_v1 WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORLD_NOT_FOUND';END IF;
 IF o.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'WORLD_REVISION_CONFLICT';END IF;
 IF o.payment->>'status' IS DISTINCT FROM 'confirmed' OR o.state NOT IN('purchased','shipping') THEN RAISE EXCEPTION 'WORLD_FULFILLMENT_STATE';END IF;
 tracking:=trim(coalesce(p_data->>'tracking',''));
 CASE p_action
 WHEN 'tracking','prepare_shipping' THEN
  IF o.state<>'purchased' OR length(tracking) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'WORLD_TRACKING_REQUIRED';END IF;
  IF p_action='prepare_shipping' AND o.purchase ? 'shipping_requested_at' THEN RAISE EXCEPTION 'WORLD_FULFILLMENT_STATE';END IF;
  o.purchase:=o.purchase||jsonb_build_object('tracking',tracking);
  IF p_action='prepare_shipping' THEN o.purchase:=o.purchase||jsonb_build_object('shipping_requested_at',now());END IF;
 WHEN 'ship_world' THEN
  IF o.state<>'purchased' OR NOT(o.purchase ? 'shipping_requested_at') OR length(tracking) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'WORLD_PREPARATION_REQUIRED';END IF;
  o.purchase:=o.purchase||jsonb_build_object('tracking',tracking,'shipped_at',now());o.state:='shipping';
 WHEN 'deliver_world' THEN
  IF o.state<>'shipping' OR p_data->>'received_confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'WORLD_DELIVERY_CONFIRMATION_REQUIRED';END IF;
  -- An already routed parcel must finish through its assigned branch/courier workflow.
  IF EXISTS(SELECT FROM private.kinto_world_fulfillment_v1 WHERE order_id=o.id) THEN RAISE EXCEPTION 'WORLD_DELIVERY_USE_ASSIGNED_COURIER';END IF;
  o.purchase:=o.purchase||jsonb_build_object('delivered_at',now());o.state:='delivered';
 ELSE RAISE EXCEPTION 'WORLD_ACTION_DENIED';
 END CASE;
 UPDATE private.kinto_world_orders_v1 SET state=o.state,purchase=o.purchase,revision=revision+1,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 INSERT INTO private.kinto_world_events_v1(order_id,actor_id,actor_role,action,revision,detail) VALUES(o.id,actor,p_role,p_action,o.revision,p_data);
 RETURN private.kinto_world_public_v1(o);
END $$;
REVOKE ALL ON FUNCTION public.kinto_world_staff_search_v2(text,text,text),public.kinto_world_fulfillment_action_v2(text,text,uuid,bigint,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_world_staff_search_v2(text,text,text),public.kinto_world_fulfillment_action_v2(text,text,uuid,bigint,text,jsonb) TO anon,authenticated;
COMMIT;
