-- DISPOSABLE DATABASE ONLY. Existing world lifecycle/bootstrap checks must run first.
CREATE FUNCTION pg_temp.expect_error(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $$BEGIN BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN;END IF;RAISE;END;RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: %',expected;END $$;
CREATE TEMP TABLE zara_preservation AS SELECT
 (SELECT md5(string_agg(p.oid::text||p.prosrc,',' ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.oid<>'public.kinto_world_submit_v1(text,uuid,jsonb)'::regprocedure) AS functions,
 (SELECT md5(coalesce(string_agg(pg_get_triggerdef(oid),',' ORDER BY oid),'')) FROM pg_trigger WHERE NOT tgisinternal) AS triggers,
 (SELECT jsonb_agg(to_jsonb(o)) FROM public.orders o) AS local_orders;
\i sql/kinto-world-zara-v1.sql
\i sql/kinto-world-zara-v1.sql
SET ROLE anon;
DO $$DECLARE request jsonb; item jsonb; o jsonb; replay jsonb; bad text; n bigint; BEGIN
 request:='{"policy_accepted":true,"contact":{"name":"TEST Zara customer","phone":"00000000","address":"TEST destination address"},"items":[{"url":"https://www.zara.com/tr/tr/test-p00000001.html?v1=100","image":"https://static.zara.net/assets/test.jpg","title":"TEST Zara product","price":"1000","quantity":1,"size":"L","color":"Haki","options_confirmed":true}]}';
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009101',request);
 IF o->>'state'<>'review' OR o->'request'->'items'->0->>'image'<>'https://static.zara.net/assets/test.jpg' OR (o->'estimates'->0->>'amount')::numeric<>35750 THEN RAISE EXCEPTION 'ZARA_REVIEW_PRICING';END IF;
 replay:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009101',request);
 IF replay->>'id'<>o->>'id' THEN RAISE EXCEPTION 'ZARA_DUPLICATE';END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_submit_v1(%L,%L,%L)','test-customer','00000000-0000-0000-0000-000000009101',jsonb_set(request,'{items,0,price}','"2000"')),'WORLD_IDEMPOTENCY_CONFLICT');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_submit_v1(%L,%L,%L)','bad-session','00000000-0000-0000-0000-000000009102',request),'CUSTOMER_SESSION_INVALID');
 FOREACH bad IN ARRAY ARRAY['https://www.zara.com.evil.test/tr/tr/test-p00000001.html','http://www.zara.com/tr/tr/test-p00000001.html','https://user@www.zara.com/tr/tr/test-p00000001.html','https://www.zara.com:444/tr/tr/test-p00000001.html','https://www.zara.com/tr/tr/man-l737.html','https://www.zara.com/us/en/test-p00000001.html'] LOOP
  PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_submit_v1(%L,%L,%L)','test-customer','00000000-0000-0000-0000-000000009102',jsonb_set(request,'{items,0,url}',to_jsonb(bad))),'WORLD_ITEM_INVALID');
 END LOOP;
 item:=request->'items'->0;
 request:=jsonb_set(request,'{items,0,url}','"https://www.hepsiburada.com/test-pm-HBC0000TEST"');
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009103',request);
 IF o->>'state'<>'review' THEN RAISE EXCEPTION 'HEPSI_REGRESSION';END IF;
 request:=jsonb_set(request,'{items,0,url}','"https://www.trendyol.com/test-p-9002"');
 request:=jsonb_set(request,'{items,0,image}','"https://cdn.dsmcdn.com/test.jpg"');
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009102',request);
 IF o->'request'->'items'->0->>'image'<>'https://cdn.dsmcdn.com/test.jpg' OR o->>'state'<>'review' THEN RAISE EXCEPTION 'TRENDYOL_REGRESSION';END IF;
 replay:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009102',request);IF replay->>'id'<>o->>'id' THEN RAISE EXCEPTION 'TRENDYOL_REPLAY';END IF;
END $$;
RESET ROLE;
\i sql/kinto-world-zara-rollback-v1.sql
\i sql/kinto-world-zara-v1.sql
DO $$BEGIN
 IF (SELECT count(*) FROM private.kinto_world_orders_v1 WHERE request_key='00000000-0000-0000-0000-000000009101')<>1 THEN RAISE EXCEPTION 'ZARA_ROWS_LOST';END IF;
 IF (SELECT functions FROM zara_preservation) IS DISTINCT FROM (SELECT md5(string_agg(p.oid::text||p.prosrc,',' ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.oid<>'public.kinto_world_submit_v1(text,uuid,jsonb)'::regprocedure) THEN RAISE EXCEPTION 'UNRELATED_FUNCTION_CHANGED';END IF;
 IF (SELECT triggers FROM zara_preservation) IS DISTINCT FROM (SELECT md5(coalesce(string_agg(pg_get_triggerdef(oid),',' ORDER BY oid),'')) FROM pg_trigger WHERE NOT tgisinternal) THEN RAISE EXCEPTION 'TRIGGER_CHANGED';END IF;
 IF (SELECT local_orders FROM zara_preservation) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(o)) FROM public.orders o) THEN RAISE EXCEPTION 'LOCAL_ORDER_CHANGED';END IF;
 IF has_table_privilege('anon','private.kinto_world_orders_v1','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','private.kinto_world_orders_v1','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'DIRECT_ACCESS';END IF;
END $$;
SELECT 'PASS Zara review/pricing, stable request, URL/seller/image boundaries, legacy Trendyol and rollback; local functions/triggers/orders unchanged' AS result;
