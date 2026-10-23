-- REVIEW / production requires approval. Only GLOBAL order formatting/actions.
-- Keep internal verified receipt references for deduplication; no proof uploads or customer banking details.
BEGIN;
CREATE OR REPLACE FUNCTION private.kinto_world_public_v1(o private.kinto_world_orders_v1) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',o.id,'reference','KG-'||lpad(o.order_no::text,greatest(8,length(o.order_no::text)),'0'),'state',o.state,'revision',o.revision,'request',o.request,'estimates',(SELECT coalesce(jsonb_agg(jsonb_build_object('amount',value->>'amount','currency',value->>'currency','quantity',value->'quantity')),'[]') FROM jsonb_array_elements(o.estimates)),'quote',CASE WHEN o.quote ? 'instructions' THEN jsonb_set(o.quote,'{instructions}',to_jsonb('يتواصل الموظف معك لتنسيق الدفع عبر واتساب.'::text)) ELSE o.quote END,'payment',CASE WHEN o.payment IS NULL THEN NULL ELSE (SELECT coalesce(jsonb_object_agg(key,value),'{}') FROM jsonb_each(o.payment) WHERE key IN('method','status','amount','currency','confirmed_at','refunded_at')) END,'purchase',o.purchase,'created_at',o.created_at,'updated_at',o.updated_at,'shipping_policy','staff_review','gateway_available',false)
$$;
CREATE OR REPLACE FUNCTION public.kinto_world_action_v1(p_role text,p_session_token text,p_order_id uuid,p_expected_revision bigint,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; o private.kinto_world_orders_v1; q jsonb; goods numeric; shipping numeric; expiry timestamptz; next_state text; BEGIN
 actor:=private.kinto_world_actor_v1(p_role,p_session_token);
 SELECT * INTO o FROM private.kinto_world_orders_v1 WHERE id=p_order_id AND (p_role<>'customer' OR customer_id=actor) FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WORLD_NOT_FOUND'; END IF;
 IF o.revision IS DISTINCT FROM p_expected_revision THEN RAISE EXCEPTION 'WORLD_REVISION_CONFLICT'; END IF;
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>10000 THEN RAISE EXCEPTION 'WORLD_INVALID'; END IF;
 IF p_role='customer' THEN
  CASE p_action
   WHEN 'cancel' THEN IF o.state NOT IN('review','quoted') THEN RAISE EXCEPTION 'WORLD_STATE'; END IF; next_state:='cancelled';
   WHEN 'request_review' THEN IF o.state<>'quoted' THEN RAISE EXCEPTION 'WORLD_STATE'; END IF;next_state:='review';o.quote:=NULL;
   WHEN 'transfer' THEN
    IF o.state<>'quoted' OR (o.quote->>'expires_at')::timestamptz<=now() THEN RAISE EXCEPTION 'WORLD_QUOTE_EXPIRED_OR_STATE'; END IF;
    o.payment:=jsonb_build_object('method','transfer','reported_via','external_contact','status','pending_verification');next_state:='transfer_pending';
   WHEN 'gateway' THEN RAISE EXCEPTION 'WORLD_GATEWAY_NOT_CONNECTED';
   ELSE RAISE EXCEPTION 'WORLD_ACTION_DENIED';
  END CASE;
 ELSE
  CASE p_action
   WHEN 'quote' THEN
    IF o.state NOT IN('review','quoted') THEN RAISE EXCEPTION 'WORLD_STATE'; END IF;
    IF p_data->>'can_ship' IS DISTINCT FROM 'true' OR p_data->>'availability_checked' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'WORLD_REVIEW_REQUIRED'; END IF;
    IF coalesce(p_data->>'goods','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' OR coalesce(p_data->>'shipping','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' OR coalesce(p_data->>'currency','') !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'WORLD_QUOTE_INVALID'; END IF;
    IF NOT EXISTS(SELECT FROM jsonb_array_elements(public.kinto_global_pricing_read_v1()->'currencies') WHERE value->>'code'=p_data->>'currency') THEN RAISE EXCEPTION 'WORLD_CURRENCY_INVALID'; END IF;
    goods:=(p_data->>'goods')::numeric;shipping:=(p_data->>'shipping')::numeric;
    IF goods<=0 OR (p_data->>'currency'='IQD' AND (goods<>trunc(goods) OR shipping<>trunc(shipping))) THEN RAISE EXCEPTION 'WORLD_QUOTE_INVALID'; END IF;
    expiry:=(p_data->>'expires_at')::timestamptz;
    IF expiry IS NULL OR expiry<=now() OR expiry>now()+interval '48 hours' THEN RAISE EXCEPTION 'WORLD_QUOTE_EXPIRY'; END IF;
    q:=jsonb_build_object('goods',goods::text,'shipping',shipping::text,'total',(goods+shipping)::text,'currency',p_data->>'currency','expires_at',expiry,'instructions','يتواصل الموظف معك لتنسيق الدفع عبر واتساب.','revision',o.revision+1);
    o.quote:=q;next_state:='quoted';
   WHEN 'reject' THEN IF o.state NOT IN('review','quoted') OR length(coalesce(trim(p_data->>'reason'),'')) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'WORLD_STATE_OR_REASON'; END IF; next_state:='rejected';o.quote:=jsonb_build_object('reason',p_data->>'reason');
   WHEN 'reject_transfer' THEN
    IF o.state<>'transfer_pending' OR p_data->>'not_received_verified' IS DISTINCT FROM 'true' OR length(coalesce(trim(p_data->>'reason'),'')) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'WORLD_REVIEW_REQUIRED'; END IF;
    o.payment:=o.payment||jsonb_build_object('status','not_received','reason',p_data->>'reason');next_state:=CASE WHEN (o.quote->>'expires_at')::timestamptz>now() THEN 'quoted' ELSE 'review' END;
   WHEN 'confirm_transfer' THEN
    IF o.state<>'transfer_pending' OR o.payment->>'method'<>'transfer' OR p_data->>'bank_verified' IS DISTINCT FROM 'true' OR p_data->>'amount' IS DISTINCT FROM o.quote->>'total' OR p_data->>'currency' IS DISTINCT FROM o.quote->>'currency' OR length(coalesce(trim(p_data->>'reference'),'')) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'WORLD_PAYMENT_VERIFICATION_REQUIRED'; END IF;
    INSERT INTO private.kinto_world_receipts_v1 VALUES(trim(p_data->>'reference'),o.id,'transfer',(o.quote->>'total')::numeric,o.quote->>'currency',actor,now());
    o.payment:=o.payment||jsonb_build_object('status','confirmed','staff_reference',p_data->>'reference','amount',o.quote->>'total','currency',o.quote->>'currency','confirmed_at',now());next_state:='paid';
   WHEN 'purchase' THEN
    IF o.state<>'paid' OR p_data->>'availability_rechecked' IS DISTINCT FROM 'true' OR p_data->>'within_paid_amount' IS DISTINCT FROM 'true' OR length(coalesce(trim(p_data->>'reference'),'')) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'WORLD_PURCHASE_REQUIRES_PAYMENT_AND_RECHECK'; END IF;
    o.purchase:=jsonb_build_object('reference',p_data->>'reference','purchased_at',now());next_state:='purchased';
   WHEN 'refund_required' THEN
    IF o.state NOT IN('paid','purchased') OR length(coalesce(trim(p_data->>'reason'),'')) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'WORLD_STATE_OR_REASON'; END IF;next_state:='refund_pending';
   WHEN 'confirm_refund' THEN
    IF o.state<>'refund_pending' OR p_data->>'amount' IS DISTINCT FROM o.quote->>'total' OR p_data->>'currency' IS DISTINCT FROM o.quote->>'currency' OR length(coalesce(trim(p_data->>'reference'),'')) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'WORLD_REFUND_VERIFICATION_REQUIRED'; END IF;
    INSERT INTO private.kinto_world_receipts_v1 VALUES(trim(p_data->>'reference'),o.id,'refund',(o.quote->>'total')::numeric,o.quote->>'currency',actor,now());
    o.payment:=o.payment||jsonb_build_object('refund_reference',p_data->>'reference','refunded_at',now());next_state:='refunded';
   WHEN 'ship' THEN IF o.state<>'purchased' OR NOT(o.purchase ? 'shipping_requested_at') OR length(coalesce(trim(p_data->>'tracking'),'')) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'WORLD_PREPARATION_REQUIRED'; END IF;o.purchase:=o.purchase||jsonb_build_object('tracking',p_data->>'tracking');next_state:='shipping';
   WHEN 'deliver' THEN IF o.state<>'shipping' OR p_data->>'received_confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'WORLD_DELIVERY_CONFIRMATION_REQUIRED'; END IF;IF EXISTS(SELECT FROM private.kinto_world_fulfillment_v1 WHERE order_id=o.id) THEN RAISE EXCEPTION 'WORLD_DELIVERY_USE_ASSIGNED_COURIER';END IF;next_state:='delivered';
   ELSE RAISE EXCEPTION 'WORLD_ACTION_DENIED';
  END CASE;
 END IF;
 UPDATE private.kinto_world_orders_v1 SET state=next_state,revision=revision+1,quote=o.quote,payment=o.payment,purchase=o.purchase,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 INSERT INTO private.kinto_world_events_v1(order_id,actor_id,actor_role,action,revision,detail) VALUES(o.id,actor,p_role,p_action,o.revision,CASE WHEN p_action='quote' THEN jsonb_build_object('goods',goods::text,'shipping',shipping::text,'currency',p_data->>'currency','expires_at',expiry,'can_ship',true,'availability_checked',true) WHEN p_action='transfer' THEN '{}'::jsonb ELSE p_data END);
 RETURN private.kinto_world_public_v1(o);
END $$;
COMMIT;
