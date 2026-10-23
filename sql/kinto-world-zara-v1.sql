-- REVIEW / explicit approval required before production. ZARA Turkish product URL/image allowlists only.
-- No local orders, payments, session helpers, pricing rules, tables or triggers are changed.
BEGIN;
DO $guard$
DECLARE h text;BEGIN
 SELECT md5(prosrc) INTO h FROM pg_proc WHERE oid='public.kinto_world_submit_v1(text,uuid,jsonb)'::regprocedure;
 IF h NOT IN ('b41f68bd08ff5bf37a36f297196c2d5d','b616a21cc62bd5db2a7c1a8d9db4e1e1') THEN RAISE EXCEPTION 'WORLD_SUBMIT_SOURCE_CHANGED: review before activation';END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.kinto_world_submit_v1(p_session_token text, p_request_key uuid, p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE cid uuid; o private.kinto_world_orders_v1; item jsonb; estimates jsonb:='[]'; normalized jsonb:='[]'; entry jsonb; BEGIN
 cid:=private.kinto_world_actor_v1('customer',p_session_token);
 IF p_request_key IS NULL OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR jsonb_typeof(p_request->'items') IS DISTINCT FROM 'array' OR p_request->>'policy_accepted' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'WORLD_INVALID'; END IF;
 IF length(coalesce(trim(p_request->'contact'->>'name'),'')) NOT BETWEEN 2 AND 100 OR length(coalesce(trim(p_request->'contact'->>'phone'),'')) NOT BETWEEN 6 AND 40 OR length(coalesce(trim(p_request->'contact'->>'address'),'')) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'WORLD_CONTACT_REQUIRED'; END IF;
 IF jsonb_array_length(p_request->'items') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'WORLD_ITEMS_INVALID'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_request->'items') LOOP
  IF coalesce(item->>'url','') !~ '(^https://(www\.)?trendyol\.com/[^?#]*-p-[0-9]+([?#].*)?$|^https://(www\.|m\.)?hepsiburada\.com/[^?#]*-(p|pm)-[A-Za-z0-9]{3,40}/?([?#].*)?$|^https://(www\.)?zara\.com/tr/tr/[^/?#]+-p[0-9]{8}\.html([?#].*)?$)' OR length(item->>'url')>2048
  OR length(coalesce(trim(item->>'title'),'')) NOT BETWEEN 1 AND 500 OR item->>'options_confirmed' IS DISTINCT FROM 'true'
  OR coalesce(item->>'price','') !~ '^[0-9]{1,12}(\.[0-9]{1,8})?$' OR coalesce(item->>'quantity','') !~ '^[0-9]{1,2}$'
  OR length(coalesce(item->>'size',''))>60 OR length(coalesce(item->>'color',''))>60 THEN RAISE EXCEPTION 'WORLD_ITEM_INVALID'; END IF;
  entry:=jsonb_build_object('image',CASE WHEN length(coalesce(item->>'image',''))<=2048 AND coalesce(item->>'image','') ~ '(^https://([A-Za-z0-9-]+\.)*(dsmcdn\.com|trendyolcdn\.com)/|^https://productimages\.hepsiburada\.net/|^https://static\.zara\.net/assets/)' THEN item->>'image' ELSE '' END,'url',item->>'url','title',item->>'title','price',item->>'price','currency','TRY','quantity',(item->>'quantity')::int,'size',coalesce(item->>'size',''),'color',coalesce(item->>'color',''),'options_confirmed',true);
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
END $function$
;

DO $verify$ BEGIN
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.kinto_world_submit_v1(text,uuid,jsonb)'::regprocedure)<>'b616a21cc62bd5db2a7c1a8d9db4e1e1' THEN RAISE EXCEPTION 'WORLD_SUBMIT_VERIFY_FAILED';END IF;
END $verify$;
COMMIT;
