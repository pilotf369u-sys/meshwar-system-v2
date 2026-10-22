-- REVIEW DRAFT: apply only after owner approval. No existing pricing/orders/settings are changed.
BEGIN;
CREATE TABLE IF NOT EXISTS private.kinto_global_pricing_v1 (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), revision bigint NOT NULL DEFAULT 0,
 config jsonb NOT NULL DEFAULT '{"enabled":false,"commission_percent":"0","display_currency":"USD","currencies":[{"code":"USD","name":"الدولار الأمريكي","per_usd":"1"}]}',
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.kinto_global_pricing_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_global_pricing_v1 FROM PUBLIC,anon,authenticated;
INSERT INTO private.kinto_global_pricing_v1(singleton) VALUES(true) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS private.kinto_global_pricing_history_v1 (
 revision bigint PRIMARY KEY, config jsonb NOT NULL, actor_id uuid NOT NULL, saved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.kinto_global_pricing_history_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.kinto_global_pricing_history_v1 FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION private.kinto_validate_global_pricing_v1(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c jsonb; codes text[]:='{}'; n numeric;
BEGIN
 IF p IS NULL OR jsonb_typeof(p)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(p) k WHERE k<>ALL(ARRAY['enabled','commission_percent','display_currency','currencies']))
 OR jsonb_typeof(p->'enabled') IS DISTINCT FROM 'boolean' OR coalesce(p->>'commission_percent','') !~ '^[0-9]{1,3}(\.[0-9]{1,6})?$'
 OR jsonb_typeof(p->'currencies') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'GLOBAL_PRICING_INVALID'; END IF;
 n:=(p->>'commission_percent')::numeric;
 IF n<0 OR n>100 OR jsonb_array_length(p->'currencies') NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'GLOBAL_PRICING_INVALID'; END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p->'currencies') LOOP
  IF jsonb_typeof(c)<>'object' OR EXISTS(SELECT FROM jsonb_object_keys(c) k WHERE k<>ALL(ARRAY['code','name','per_usd']))
  OR coalesce(c->>'code','') !~ '^[A-Z]{3}$' OR c->>'code'=ANY(codes) OR length(coalesce(trim(c->>'name'),'')) NOT BETWEEN 1 AND 60
  OR coalesce(c->>'per_usd','') !~ '^[0-9]{1,13}(\.[0-9]{1,8})?$' THEN RAISE EXCEPTION 'GLOBAL_CURRENCY_INVALID'; END IF;
  n:=(c->>'per_usd')::numeric;
  IF n<=0 OR n>1000000000000 OR (c->>'code'='USD' AND n<>1) THEN RAISE EXCEPTION 'GLOBAL_RATE_INVALID'; END IF;
  codes:=array_append(codes,c->>'code');
 END LOOP;
 IF NOT 'USD'=ANY(codes) OR NOT coalesce(p->>'display_currency','')=ANY(codes) THEN RAISE EXCEPTION 'GLOBAL_CURRENCY_MISSING'; END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION private.kinto_validate_global_pricing_v1(jsonb) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.kinto_global_pricing_read_v1()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT config||jsonb_build_object('schema_version',1,'revision',revision,'updated_at',updated_at,'formula','usd_cross_markup_v1','shipping_included',false)
 FROM private.kinto_global_pricing_v1 WHERE singleton
$$;
REVOKE ALL ON FUNCTION public.kinto_global_pricing_read_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_global_pricing_read_v1() TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.kinto_global_pricing_save_v1(p_session_token text,p_expected_revision bigint,p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor uuid; current_revision bigint; next_config jsonb;
BEGIN
 actor:=private.require_admin_session_v147(p_session_token)::uuid;
 next_config:=private.kinto_validate_global_pricing_v1(p_config);
 SELECT revision INTO current_revision FROM private.kinto_global_pricing_v1 WHERE singleton FOR UPDATE;
 IF p_expected_revision IS DISTINCT FROM current_revision THEN RAISE EXCEPTION 'GLOBAL_PRICING_REVISION_CONFLICT'; END IF;
 UPDATE private.kinto_global_pricing_v1 SET config=next_config,revision=revision+1,updated_at=now() WHERE singleton;
 INSERT INTO private.kinto_global_pricing_history_v1(revision,config,actor_id) VALUES(current_revision+1,next_config,actor);
 RETURN public.kinto_global_pricing_read_v1();
END $$;
REVOKE ALL ON FUNCTION public.kinto_global_pricing_save_v1(text,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_global_pricing_save_v1(text,bigint,jsonb) TO anon,authenticated;
-- Quote is an estimate, not an order or authorization to charge. Source price must still be reviewed.
CREATE OR REPLACE FUNCTION public.kinto_global_price_estimate_v1(p_price numeric,p_currency text,p_quantity integer DEFAULT 1)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE doc jsonb; a numeric;b numeric; raw numeric; amount numeric; digits integer;
BEGIN
 doc:=public.kinto_global_pricing_read_v1();
 IF NOT coalesce((doc->>'enabled')::boolean,false) THEN RAISE EXCEPTION 'GLOBAL_PRICING_DISABLED'; END IF;
 IF p_price IS NULL OR p_price::text IN ('NaN','Infinity','-Infinity') OR p_price<=0 OR p_price>1000000000000 OR scale(p_price)>8
 OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'GLOBAL_PRICE_INVALID'; END IF;
 SELECT (value->>'per_usd')::numeric INTO a FROM jsonb_array_elements(doc->'currencies') WHERE value->>'code'=p_currency;
 SELECT (value->>'per_usd')::numeric INTO b FROM jsonb_array_elements(doc->'currencies') WHERE value->>'code'=doc->>'display_currency';
 IF a IS NULL OR b IS NULL THEN RAISE EXCEPTION 'GLOBAL_CURRENCY_MISSING'; END IF;
 digits:=CASE WHEN doc->>'display_currency'='IQD' THEN 0 ELSE 2 END;
 raw:=p_price*p_quantity*b*(100+(doc->>'commission_percent')::numeric)/(a*100);
 amount:=ceil(raw*power(10::numeric,digits))/power(10::numeric,digits);
 RETURN jsonb_build_object('amount',amount::text,'currency',doc->>'display_currency','revision',doc->'revision','source_price',p_price::text,'source_currency',p_currency,'quantity',p_quantity,'source_per_usd',a::text,'target_per_usd',b::text,'commission_percent',doc->>'commission_percent','shipping',NULL,'estimate_only',true,'formula','usd_cross_markup_v1');
END $$;
REVOKE ALL ON FUNCTION public.kinto_global_price_estimate_v1(numeric,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kinto_global_price_estimate_v1(numeric,text,integer) TO anon,authenticated;
COMMIT;
