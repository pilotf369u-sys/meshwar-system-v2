-- ISOLATED disposable PostgreSQL only. Fake tokens never go to production.
CREATE SCHEMA private;
CREATE ROLE anon;CREATE ROLE authenticated;
CREATE FUNCTION private.require_admin_session_v147(token text) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN IF token IS DISTINCT FROM 'test-admin' THEN RAISE EXCEPTION 'ADMIN_SESSION_INVALID';END IF;RETURN '00000000-0000-0000-0000-000000000001';END $$;
\i sql/kinto-global-pricing-v1.sql
SET ROLE anon;
DO $$BEGIN
 BEGIN PERFORM public.kinto_global_pricing_save_v1('visitor',0,'{}');RAISE EXCEPTION 'UNAUTHORIZED_SAVE_SUCCEEDED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'ADMIN_SESSION_INVALID' THEN RAISE;END IF;END;
 BEGIN PERFORM * FROM private.kinto_global_pricing_v1;RAISE EXCEPTION 'DIRECT_READ_SUCCEEDED';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
SELECT public.kinto_global_pricing_save_v1('test-admin',0,'{"enabled":true,"commission_percent":"10","display_currency":"IQD","currencies":[{"code":"USD","name":"USD","per_usd":"1"},{"code":"TRY","name":"TRY","per_usd":"40"},{"code":"IQD","name":"IQD","per_usd":"1300"},{"code":"EUR","name":"EUR","per_usd":"0.8"}]}');
DO $$DECLARE q jsonb;doc jsonb;BEGIN
 q:=public.kinto_global_price_estimate_v1(1000,'TRY',1);IF (q->>'amount')::numeric<>35750 OR q->'shipping'<>'null'::jsonb THEN RAISE EXCEPTION 'CROSS_RATE_FAILED';END IF;
 q:=public.kinto_global_price_estimate_v1(10,'EUR',2);IF (q->>'amount')::numeric<>35750 THEN RAISE EXCEPTION 'EUR_FAILED';END IF;
 doc:=public.kinto_global_pricing_read_v1();doc:=doc-'revision'-'schema_version'-'updated_at'-'formula'-'shipping_included';
 BEGIN PERFORM public.kinto_global_pricing_save_v1('test-admin',0,doc);RAISE EXCEPTION 'STALE_SAVE_SUCCEEDED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'GLOBAL_PRICING_REVISION_CONFLICT' THEN RAISE;END IF;END;
 BEGIN PERFORM public.kinto_global_pricing_save_v1('test-admin',1,jsonb_set(doc,'{currencies,1,per_usd}','"0"'));RAISE EXCEPTION 'ZERO_RATE_SUCCEEDED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'GLOBAL_RATE_INVALID' THEN RAISE;END IF;END;
 BEGIN PERFORM public.kinto_global_price_estimate_v1(1,'GBP',1);RAISE EXCEPTION 'UNKNOWN_CURRENCY_SUCCEEDED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'GLOBAL_CURRENCY_MISSING' THEN RAISE;END IF;END;
 BEGIN PERFORM public.kinto_global_price_estimate_v1(1,'TRY',0);RAISE EXCEPTION 'ZERO_QUANTITY_SUCCEEDED';EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'GLOBAL_PRICE_INVALID' THEN RAISE;END IF;END;
END $$;
RESET ROLE;
DO $$BEGIN IF (SELECT count(*) FROM private.kinto_global_pricing_history_v1)<>1 THEN RAISE EXCEPTION 'AUDIT_OR_ATOMICITY_FAILED'; END IF;END $$;
SELECT 'PASS isolated pricing, cross rates, admin guard, direct access denial, audit and stale revision protection' AS result;
