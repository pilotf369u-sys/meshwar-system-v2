-- Source only. Preserve reviewed invoice identity without rewriting frozen orders.
-- This does NOT delete/disable an account or enable the account eraser.
BEGIN;
CREATE TABLE private.kinto_privacy_invoice_identity_v1(
 order_id uuid PRIMARY KEY,
 customer_id uuid NOT NULL,request_id uuid NOT NULL REFERENCES private.kinto_deletion_requests_v1(id),
 identity jsonb NOT NULL CHECK(jsonb_typeof(identity)='object'),
 order_hash text NOT NULL,
 retained_by uuid NOT NULL,retained_at timestamptz NOT NULL DEFAULT now(),review_on timestamptz NOT NULL
);
ALTER TABLE private.kinto_privacy_invoice_identity_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_privacy_invoice_identity_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.kinto_privacy_invoice_trim_v1(v text)RETURNS text LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog AS $$SELECT btrim(v,E' \t\n\r\f'||chr(11)||chr(160)||chr(5760)||chr(8192)||chr(8193)||chr(8194)||chr(8195)||chr(8196)||chr(8197)||chr(8198)||chr(8199)||chr(8200)||chr(8201)||chr(8202)||chr(8232)||chr(8233)||chr(8239)||chr(8287)||chr(12288)||chr(65279))$$;
CREATE FUNCTION private.kinto_privacy_electronic_identity_v1(o jsonb,p jsonb)RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,private,pg_temp AS $$
DECLARE d jsonb;c jsonb;s jsonb;result jsonb;values_to_try jsonb;value jsonb;k text;aliases jsonb;alias text;found boolean;v text;mapping jsonb:='{"name":["name"],"code":["customer_code","code","customerCode"],"phone":["phone"],"secondary_phone":["secondary_phone","phone2","alt_phone"],"country":["country","country_name"],"province":["province","governorate","state","city"],"address":["address","address_details","full_address","delivery_address"]}';
BEGIN
 IF jsonb_typeof(o)IS DISTINCT FROM 'object'OR octet_length(o::text)>65536 OR(p IS NOT NULL AND(jsonb_typeof(p)IS DISTINCT FROM 'object'OR octet_length(p::text)>65536))THEN RETURN NULL;END IF;
 d:=CASE WHEN jsonb_typeof(o->'details')='object'THEN o->'details'WHEN jsonb_typeof(o->'details')='string'THEN private.kinto_privacy_preview_object_v1(o->>'details')ELSE '{}'::jsonb END;
 IF d IS NULL THEN RETURN NULL;END IF;
 FOR s IN SELECT x FROM jsonb_array_elements(jsonb_build_array(o->'customer_snapshot',d->'customer'))x LOOP
  IF jsonb_typeof(s)IS DISTINCT FROM 'object'THEN CONTINUE;END IF;result:='{}';
  FOR k,aliases IN SELECT *FROM jsonb_each(mapping)LOOP
   found:=false;
   FOR alias IN SELECT jsonb_array_elements_text(aliases)LOOP
    IF jsonb_typeof(s->alias)='string'THEN result:=result||jsonb_build_object(k,private.kinto_privacy_invoice_trim_v1(s->>alias));found:=true;EXIT;END IF;
   END LOOP;
   IF NOT found THEN EXIT;END IF;
  END LOOP;
  IF (SELECT count(*)FROM jsonb_object_keys(result))=7 AND result->>'name'<>''AND result->>'code'<>''AND result->>'phone'<>''THEN RETURN result;END IF;
 END LOOP;
 c:=coalesce(p,CASE WHEN jsonb_typeof(d->'customer')='object'THEN d->'customer'ELSE '{}'::jsonb END);result:='{}';
 FOR k,values_to_try IN SELECT *FROM jsonb_each(jsonb_build_object(
 'name',jsonb_build_array(c->'name',o->'customer_name',d->'customer_name'),
 'code',jsonb_build_array(c->'customer_code',c->'code',c->'customerCode',o->'_customer_code',o->'customer_code',d->'customer_code'),
 'phone',jsonb_build_array(c->'phone',o->'_customer_phone',o->'customer_phone',d->'customer_phone'),
 'secondary_phone',jsonb_build_array(c->'secondary_phone',c->'phone2',c->'alt_phone',o->'_secondary_phone',o->'secondary_phone',d->'secondary_phone',d->'customer_secondary_phone'),
 'country',jsonb_build_array(c->'country',c->'country_name',o->'country',d->'country',d->'customer_country'),
 'province',jsonb_build_array(c->'province',c->'governorate',c->'state',c->'city',o->'province',o->'governorate',o->'state',o->'city',d->'province',d->'governorate',d->'state',d->'city',d->'customer_province',d->'customer_governorate'),
 'address',jsonb_build_array(c->'address',c->'address_details',c->'full_address',c->'delivery_address',o->'address',o->'address_details',o->'delivery_address',d->'address',d->'address_details',d->'full_address',d->'delivery_address',d->'customer_address')))LOOP
  v:='';FOR value IN SELECT x FROM jsonb_array_elements(values_to_try)x LOOP
   IF value='null'::jsonb THEN CONTINUE;END IF;
   -- Never approximate JS conversion of an unexpected structured/scalar value.
   IF jsonb_typeof(value)IS DISTINCT FROM 'string'THEN RETURN NULL;END IF;
   v:=private.kinto_privacy_invoice_trim_v1(value#>>'{}');IF v<>''THEN EXIT;END IF;
  END LOOP;
  IF length(v)>2048 THEN RETURN NULL;END IF;result:=result||jsonb_build_object(k,v);
 END LOOP;
 IF result->>'name'=''OR result->>'code'=''OR result->>'phone'=''THEN RETURN NULL;END IF;
 RETURN result;
END$$;
CREATE FUNCTION public.kinto_privacy_invoice_preserve_v1(p_session_token text,p_request_id uuid,p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp
SET lock_timeout='500ms' SET statement_timeout='5s' AS $$
DECLARE aid uuid:=private.require_admin_session_v147(p_session_token)::uuid;cid uuid;o jsonb;p jsonb;h text;identity jsonb;decision private.kinto_privacy_retention_decisions_v1;existing private.kinto_privacy_invoice_identity_v1;
BEGIN
 SELECT customer_id INTO cid FROM private.kinto_deletion_requests_v1 WHERE id=p_request_id AND status='verified'AND verified_by IS NOT NULL FOR UPDATE;
 IF cid IS NULL THEN RAISE EXCEPTION 'VERIFIED_REQUEST_REQUIRED';END IF;
 SELECT to_jsonb(c)INTO p FROM public.customers c WHERE id=cid FOR SHARE;
 IF p IS NULL THEN RAISE EXCEPTION 'CUSTOMER_MISSING';END IF;
 o:=private.kinto_privacy_retention_row_v1(cid,'orders',p_order_id,true);
 IF o IS NULL OR octet_length(o::text)>65536 THEN RAISE EXCEPTION 'OWNED_INVOICE_REQUIRED';END IF;
 h:=encode(digest(o::text,'sha256'),'hex');
 SELECT *INTO decision FROM private.kinto_privacy_retention_decisions_v1 WHERE request_id=p_request_id AND record_group='orders'AND record_id=p_order_id FOR UPDATE;
 IF decision.content_hash IS DISTINCT FROM h OR decision.inventory_signature IS DISTINCT FROM private.kinto_erasure_signature_v1()
 OR decision.reason NOT IN('accounting','invoice_dependency') OR NOT('invoice_identity'=ANY(decision.needed_fields)) OR decision.review_on IS NULL OR decision.review_on<=now()THEN RAISE EXCEPTION 'CURRENT_INVOICE_RETENTION_REVIEW_REQUIRED';END IF;
 identity:=private.kinto_privacy_electronic_identity_v1(o,p);
 IF identity IS NULL THEN RAISE EXCEPTION 'INVOICE_IDENTITY_NOT_QUALIFIED';END IF;
 SELECT *INTO existing FROM private.kinto_privacy_invoice_identity_v1 WHERE order_id=p_order_id FOR UPDATE;
 IF FOUND THEN
  IF existing.customer_id IS DISTINCT FROM cid OR existing.request_id IS DISTINCT FROM p_request_id OR existing.identity IS DISTINCT FROM identity OR existing.order_hash IS DISTINCT FROM h THEN RAISE EXCEPTION 'PRESERVED_INVOICE_CONTEXT_CHANGED';END IF;
  RETURN jsonb_build_object('preserved',true,'duplicate',true,'account_deleted',false);
 END IF;
 INSERT INTO private.kinto_privacy_invoice_identity_v1(order_id,customer_id,request_id,identity,order_hash,retained_by,review_on)VALUES(p_order_id,cid,p_request_id,identity,h,aid,decision.review_on);
 INSERT INTO private.kinto_privacy_events_v1(request_id,event,admin_id)VALUES(p_request_id,'invoice_identity_preserved',aid);
 RETURN jsonb_build_object('preserved',true,'duplicate',false,'account_deleted',false);
END$$;
CREATE FUNCTION public.kinto_privacy_invoice_read_v1(p_role text,p_session_token text,p_order_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp
SET statement_timeout='5s' AS $$
DECLARE actor jsonb;actor_id text;o jsonb;d jsonb;result jsonb;r private.kinto_privacy_invoice_identity_v1;BEGIN
 IF p_role='customer'THEN actor_id:=private.require_customer_review_session(p_session_token)::text;actor:=jsonb_build_object('role','customer','id',actor_id);
 ELSIF p_role='vendor'THEN actor_id:=private.require_vendor_session(p_session_token)::text;
 ELSIF p_role IN('admin','employee','branch','courier')THEN
  actor:=private.kinto_staff_actor_v1(p_role,p_session_token);actor_id:=actor->>'id';
  IF p_role='employee'AND(actor->'permissions'->'orders'='false'::jsonb OR actor->'permissions'->'manage_orders'='false'::jsonb)THEN RAISE EXCEPTION 'INVOICE_SCOPE_DENIED' USING ERRCODE='42501';END IF;
  IF p_role='courier'THEN SELECT actor||jsonb_build_object('courier_uuid',to_jsonb(c)->>'courier_uuid','branch_id',to_jsonb(c)->>'branch_id')INTO actor FROM public.couriers c WHERE c.id::text=actor_id;END IF;
 ELSE RAISE EXCEPTION 'INVOICE_ROLE_DENIED' USING ERRCODE='42501';END IF;
 IF actor_id IS NULL OR actor_id=''THEN RAISE EXCEPTION 'INVOICE_SESSION_REQUIRED' USING ERRCODE='42501';END IF;
 SELECT to_jsonb(x)INTO o FROM public.orders x WHERE x.id=p_order_id;
 IF o IS NULL THEN RAISE EXCEPTION 'INVOICE_SCOPE_DENIED' USING ERRCODE='42501';END IF;
 IF p_role='vendor'THEN
  d:=private.kinto_privacy_preview_object_v1(o->>'details');
  IF d IS NULL OR NOT(EXISTS(SELECT 1 FROM public.order_store_segments x WHERE x.order_id=p_order_id AND x.store_id::text=actor_id)
   OR coalesce(d->>'store_id'=actor_id,false)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(d->'items')='array'THEN d->'items'ELSE '[]'::jsonb END)i WHERE i->>'store_id'=actor_id))THEN RAISE EXCEPTION 'INVOICE_SCOPE_DENIED' USING ERRCODE='42501';END IF;
 ELSIF NOT private.kinto_order_visible_v1(o,actor)THEN RAISE EXCEPTION 'INVOICE_SCOPE_DENIED' USING ERRCODE='42501';END IF;
 SELECT *INTO r FROM private.kinto_privacy_invoice_identity_v1 WHERE order_id=p_order_id;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF lower(o->>'customer_id')IS DISTINCT FROM r.customer_id::text OR encode(digest(o::text,'sha256'),'hex')IS DISTINCT FROM r.order_hash THEN RAISE EXCEPTION 'PRESERVED_INVOICE_CONTEXT_CHANGED';END IF;
 RETURN r.identity;
END$$;
REVOKE ALL ON FUNCTION public.kinto_privacy_invoice_read_v1(text,text,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.kinto_privacy_invoice_read_v1(text,text,uuid)TO anon,authenticated;
REVOKE ALL ON FUNCTION private.kinto_privacy_invoice_trim_v1(text),private.kinto_privacy_electronic_identity_v1(jsonb,jsonb),public.kinto_privacy_invoice_preserve_v1(text,uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.kinto_privacy_invoice_preserve_v1(text,uuid,uuid)TO anon,authenticated;
COMMIT;
