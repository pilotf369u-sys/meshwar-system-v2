-- REVIEW ONLY. Additive isolated workflow; never applies to public.orders or local payments.
BEGIN;
CREATE TABLE private.kinto_world_staff_v1(employee_id uuid PRIMARY KEY, enabled boolean NOT NULL DEFAULT true);
CREATE TABLE private.kinto_world_orders_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_no bigint GENERATED ALWAYS AS IDENTITY UNIQUE, customer_id uuid NOT NULL, request_key uuid NOT NULL,
 request jsonb NOT NULL, estimates jsonb NOT NULL, state text NOT NULL DEFAULT 'review', revision bigint NOT NULL DEFAULT 0,
 quote jsonb, payment jsonb, purchase jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(customer_id,request_key), CHECK(state IN('review','quoted','transfer_pending','paid','purchased','shipping','delivered','rejected','cancelled','refund_pending','refunded'))
);
CREATE TABLE private.kinto_world_events_v1(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, order_id uuid REFERENCES private.kinto_world_orders_v1(id),
 actor_id uuid NOT NULL, actor_role text NOT NULL, action text NOT NULL, revision bigint NOT NULL, detail jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.kinto_world_receipts_v1(
 reference text PRIMARY KEY, order_id uuid NOT NULL REFERENCES private.kinto_world_orders_v1(id), kind text NOT NULL CHECK(kind IN('transfer','refund')), amount numeric NOT NULL CHECK(amount>0), currency text NOT NULL, actor_id uuid NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.kinto_world_receipts_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_world_receipts_v1 FROM PUBLIC,anon,authenticated;
ALTER TABLE private.kinto_world_staff_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kinto_world_orders_v1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.kinto_world_events_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_world_staff_v1,private.kinto_world_orders_v1,private.kinto_world_events_v1 FROM PUBLIC,anon,authenticated;
CREATE FUNCTION private.kinto_world_actor_v1(p_role text,p_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; BEGIN
 IF p_role='customer' THEN RETURN private.require_customer_review_session(p_token)::uuid; END IF;
 IF p_role='admin' THEN RETURN private.require_admin_session_v147(p_token)::uuid; END IF;
 IF p_role='employee' THEN
  actor:=private.require_employee_session_v143(p_token)::uuid;
  IF EXISTS(SELECT FROM private.kinto_world_staff_v1 WHERE employee_id=actor AND enabled) THEN RETURN actor; END IF;
 END IF;
 RAISE EXCEPTION 'WORLD_ACCESS_DENIED' USING ERRCODE='42501'; END $$;
CREATE FUNCTION public.kinto_world_assign_staff_v1(p_session_token text,p_employee_id uuid,p_enabled boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM private.kinto_world_actor_v1('admin',p_session_token);
 IF p_employee_id IS NULL OR p_enabled IS NULL THEN RAISE EXCEPTION 'WORLD_INVALID'; END IF;
 INSERT INTO private.kinto_world_staff_v1 VALUES(p_employee_id,p_enabled) ON CONFLICT(employee_id) DO UPDATE SET enabled=excluded.enabled;
 INSERT INTO private.kinto_world_events_v1(actor_id,actor_role,action,revision,detail) VALUES(private.kinto_world_actor_v1('admin',p_session_token),'admin','assign_staff',0,jsonb_build_object('employee_id',p_employee_id,'enabled',p_enabled));
END $$;
CREATE FUNCTION private.kinto_world_public_v1(o private.kinto_world_orders_v1) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',o.id,'reference','KG-'||lpad(o.order_no::text,greatest(8,length(o.order_no::text)),'0'),'state',o.state,'revision',o.revision,'request',o.request,'estimates',(SELECT coalesce(jsonb_agg(jsonb_build_object('amount',value->>'amount','currency',value->>'currency','quantity',value->'quantity')),'[]') FROM jsonb_array_elements(o.estimates)),'quote',o.quote,'payment',o.payment,'purchase',o.purchase,'created_at',o.created_at,'updated_at',o.updated_at,'shipping_policy','staff_review','gateway_available',false)
$$;
CREATE FUNCTION public.kinto_world_submit_v1(p_session_token text,p_request_key uuid,p_request jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cid uuid; o private.kinto_world_orders_v1; item jsonb; estimates jsonb:='[]'; normalized jsonb:='[]'; entry jsonb; BEGIN
 cid:=private.kinto_world_actor_v1('customer',p_session_token);
 IF p_request_key IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR jsonb_typeof(p_request->'items') IS DISTINCT FROM 'array' OR p_request->>'policy_accepted' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'WORLD_INVALID'; END IF;
 IF length(coalesce(trim(p_request->'contact'->>'name'),'')) NOT BETWEEN 2 AND 100 OR length(coalesce(trim(p_request->'contact'->>'phone'),'')) NOT BETWEEN 6 AND 40 OR length(coalesce(trim(p_request->'contact'->>'address'),'')) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'WORLD_CONTACT_REQUIRED'; END IF;
 IF jsonb_array_length(p_request->'items') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'WORLD_ITEMS_INVALID'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_request->'items') LOOP
  IF coalesce(item->>'url','') !~ '^https://(www\.)?trendyol\.com/[^?#]*-p-[0-9]+([?#].*)?$' OR length(item->>'url')>2048
  OR length(coalesce(trim(item->>'title'),'')) NOT BETWEEN 1 AND 500 OR item->>'options_confirmed' IS DISTINCT FROM 'true'
  OR coalesce(item->>'price','') !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$' OR coalesce(item->>'quantity','') !~ '^[0-9]{1,2}$'
  OR length(coalesce(item->>'size',''))>60 OR length(coalesce(item->>'color',''))>60 THEN RAISE EXCEPTION 'WORLD_ITEM_INVALID'; END IF;
  entry:=jsonb_build_object('image',CASE WHEN length(coalesce(item->>'image',''))<=2048 AND coalesce(item->>'image','') ~ '^https://([A-Za-z0-9-]+\.)*(dsmcdn\.com|trendyolcdn\.com)/' THEN item->>'image' ELSE '' END,'url',item->>'url','title',item->>'title','price',item->>'price','currency','TRY','quantity',(item->>'quantity')::int,'size',coalesce(item->>'size',''),'color',coalesce(item->>'color',''),'options_confirmed',true);
  normalized:=normalized||jsonb_build_array(entry);
 END LOOP;
 -- Lock a customer/request pair before estimating: safe retry still returns an existing request if rates change.
 PERFORM pg_advisory_xact_lock(hashtextextended(cid::text||p_request_key::text,0));
 SELECT * INTO o FROM private.kinto_world_orders_v1 WHERE customer_id=cid AND request_key=p_request_key;
 IF FOUND THEN IF o.request->'items' IS DISTINCT FROM normalized OR o.request->'contact' IS DISTINCT FROM p_request->'contact' THEN RAISE EXCEPTION 'WORLD_IDEMPOTENCY_CONFLICT'; END IF; RETURN private.kinto_world_public_v1(o); END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(normalized) LOOP
  estimates:=estimates||jsonb_build_array(public.kinto_global_price_estimate_v1((item->>'price')::numeric,'TRY',(item->>'quantity')::int));
 END LOOP;
 INSERT INTO private.kinto_world_orders_v1(customer_id,request_key,request,estimates) VALUES(cid,p_request_key,jsonb_build_object('items',normalized,'contact',jsonb_build_object('name',p_request->'contact'->>'name','phone',p_request->'contact'->>'phone','address',p_request->'contact'->>'address'),'policy_accepted',true),estimates) RETURNING * INTO o;
 INSERT INTO private.kinto_world_events_v1(order_id,actor_id,actor_role,action,revision,detail) VALUES(o.id,cid,'customer','submit',0,'{}');
 RETURN private.kinto_world_public_v1(o);
END $$;
CREATE FUNCTION public.kinto_world_list_v1(p_role text,p_session_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; BEGIN
 actor:=private.kinto_world_actor_v1(p_role,p_session_token);
 RETURN coalesce((SELECT jsonb_agg(private.kinto_world_public_v1(x) ORDER BY x.created_at DESC) FROM (SELECT * FROM private.kinto_world_orders_v1 WHERE p_role<>'customer' OR customer_id=actor ORDER BY created_at DESC LIMIT 100) x),'[]');
END $$;
CREATE FUNCTION public.kinto_world_action_v1(p_role text,p_session_token text,p_order_id uuid,p_expected_revision bigint,p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
    IF length(coalesce(trim(p_data->>'reference'),'')) NOT BETWEEN 3 AND 160 THEN RAISE EXCEPTION 'WORLD_PAYMENT_REFERENCE_REQUIRED'; END IF;
    o.payment:=jsonb_build_object('method','transfer','customer_reference',p_data->>'reference','status','pending_verification');next_state:='transfer_pending';
   WHEN 'gateway' THEN RAISE EXCEPTION 'WORLD_GATEWAY_NOT_CONNECTED';
   ELSE RAISE EXCEPTION 'WORLD_ACTION_DENIED';
  END CASE;
 ELSE
  CASE p_action
   WHEN 'quote' THEN
    IF o.state NOT IN('review','quoted') THEN RAISE EXCEPTION 'WORLD_STATE'; END IF;
    IF p_data->>'can_ship' IS DISTINCT FROM 'true' OR p_data->>'availability_checked' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'WORLD_REVIEW_REQUIRED'; END IF;
    IF coalesce(p_data->>'goods','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' OR coalesce(p_data->>'shipping','') !~ '^[0-9]{1,12}(\.[0-9]{1,2})?$' OR coalesce(p_data->>'currency','') !~ '^[A-Z]{3}$'
    OR length(coalesce(trim(p_data->>'instructions'),'')) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION 'WORLD_QUOTE_INVALID'; END IF;
    IF NOT EXISTS(SELECT FROM jsonb_array_elements(public.kinto_global_pricing_read_v1()->'currencies') WHERE value->>'code'=p_data->>'currency') THEN RAISE EXCEPTION 'WORLD_CURRENCY_INVALID'; END IF;
    goods:=(p_data->>'goods')::numeric;shipping:=(p_data->>'shipping')::numeric;
    IF goods<=0 OR (p_data->>'currency'='IQD' AND (goods<>trunc(goods) OR shipping<>trunc(shipping))) THEN RAISE EXCEPTION 'WORLD_QUOTE_INVALID'; END IF;
    expiry:=(p_data->>'expires_at')::timestamptz;
    IF expiry IS NULL OR expiry<=now() OR expiry>now()+interval '48 hours' THEN RAISE EXCEPTION 'WORLD_QUOTE_EXPIRY'; END IF;
    q:=jsonb_build_object('goods',goods::text,'shipping',shipping::text,'total',(goods+shipping)::text,'currency',p_data->>'currency','expires_at',expiry,'instructions',p_data->>'instructions','revision',o.revision+1);
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
   WHEN 'ship' THEN IF o.state<>'purchased' OR length(coalesce(trim(p_data->>'tracking'),'')) NOT BETWEEN 3 AND 300 THEN RAISE EXCEPTION 'WORLD_STATE'; END IF;o.purchase:=o.purchase||jsonb_build_object('tracking',p_data->>'tracking');next_state:='shipping';
   WHEN 'deliver' THEN IF o.state<>'shipping' THEN RAISE EXCEPTION 'WORLD_STATE'; END IF;next_state:='delivered';
   ELSE RAISE EXCEPTION 'WORLD_ACTION_DENIED';
  END CASE;
 END IF;
 UPDATE private.kinto_world_orders_v1 SET state=next_state,revision=revision+1,quote=o.quote,payment=o.payment,purchase=o.purchase,updated_at=now() WHERE id=o.id RETURNING * INTO o;
 INSERT INTO private.kinto_world_events_v1(order_id,actor_id,actor_role,action,revision,detail) VALUES(o.id,actor,p_role,p_action,o.revision,p_data);
 RETURN private.kinto_world_public_v1(o);
END $$;
REVOKE ALL ON FUNCTION private.kinto_world_actor_v1(text,text),private.kinto_world_public_v1(private.kinto_world_orders_v1) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.kinto_world_assign_staff_v1(text,uuid,boolean),public.kinto_world_submit_v1(text,uuid,jsonb),public.kinto_world_list_v1(text,text),public.kinto_world_action_v1(text,text,uuid,bigint,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_world_assign_staff_v1(text,uuid,boolean),public.kinto_world_submit_v1(text,uuid,jsonb),public.kinto_world_list_v1(text,text),public.kinto_world_action_v1(text,text,uuid,bigint,text,jsonb) TO anon,authenticated;
COMMIT;
