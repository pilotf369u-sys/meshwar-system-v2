-- DISPOSABLE DATABASE ONLY. Existing world lifecycle/bootstrap checks must run first.
-- The preceding search test deliberately creates 105 FUTURE-dated empty requests.
-- Remove only those synthetic fixtures after their own >100-row assertion passed;
-- otherwise they displace every new request from the normal 100-row listing.
DELETE FROM private.kinto_world_orders_v1 WHERE request->'items'='[]'::jsonb AND request->'contact'->>'name'='TEST newer';
CREATE FUNCTION pg_temp.expect_error(stmt text,expected text) RETURNS void LANGUAGE plpgsql AS $$BEGIN BEGIN EXECUTE stmt;EXCEPTION WHEN OTHERS THEN IF SQLERRM=expected THEN RETURN;END IF;RAISE;END;RAISE EXCEPTION 'EXPECTED_ERROR_NOT_RAISED: %',expected;END $$;
CREATE TEMP TABLE madame_preservation AS SELECT
 (SELECT md5(string_agg(p.oid::text||p.prosrc,',' ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.oid<>'public.kinto_world_submit_v1(text,uuid,jsonb)'::regprocedure) AS functions,
 (SELECT md5(coalesce(string_agg(pg_get_triggerdef(oid),',' ORDER BY oid),'')) FROM pg_trigger WHERE NOT tgisinternal) AS triggers,
 (SELECT jsonb_agg(to_jsonb(o)) FROM public.orders o) AS local_orders;
\i sql/kinto-world-madamecoco-v1.sql
\i sql/kinto-world-madamecoco-v1.sql
SET ROLE anon;
DO $$DECLARE request jsonb; item jsonb; o jsonb; replay jsonb; bad text; n bigint; BEGIN
 request:='{"policy_accepted":true,"contact":{"name":"TEST Madame customer","phone":"00000000","address":"TEST destination address"},"items":[{"url":"https://www.madamecoco.com/test-nt0000000001-101/","image":"https://4d0873.akinoncloudcdn.com/products/test.jpg","title":"TEST Madame product","price":"1000","quantity":1,"size":"L","color":"Haki","options_confirmed":true}]}';
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009101',request);
 IF o->>'state'<>'review' OR o->'request'->'items'->0->>'image'<>'https://4d0873.akinoncloudcdn.com/products/test.jpg' OR (o->'estimates'->0->>'amount')::numeric<>35750 THEN RAISE EXCEPTION 'MADAME_REVIEW_PRICING';END IF;
 replay:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009101',request);
 IF replay->>'id'<>o->>'id' THEN RAISE EXCEPTION 'MADAME_DUPLICATE';END IF;
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_submit_v1(%L,%L,%L)','test-customer','00000000-0000-0000-0000-000000009101',jsonb_set(request,'{items,0,price}','"2000"')),'WORLD_IDEMPOTENCY_CONFLICT');
 PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_submit_v1(%L,%L,%L)','bad-session','00000000-0000-0000-0000-000000009102',request),'CUSTOMER_SESSION_INVALID');
 FOREACH bad IN ARRAY ARRAY['https://madamecoco.com.evil.test/test-nt0000000001-101/','http://www.madamecoco.com/test-nt0000000001-101/','https://user@www.madamecoco.com/test-nt0000000001-101/','https://www.madamecoco.com:444/test-nt0000000001-101/','https://www.madamecoco.com/nevresim-takimi/','https://www.madamecoco.com/test-123456-101/','https://www.madamecoco.com/test-abcdef-101/','https://evil.test/test-nt0000000001-101/'] LOOP
  PERFORM pg_temp.expect_error(format('SELECT public.kinto_world_submit_v1(%L,%L,%L)','test-customer','00000000-0000-0000-0000-000000009102',jsonb_set(request,'{items,0,url}',to_jsonb(bad))),'WORLD_ITEM_INVALID');
 END LOOP;
 item:=request->'items'->0;
 request:=jsonb_set(request,'{items,0,url}','"https://www.trendyol.com/test-p-9002"');
 request:=jsonb_set(request,'{items,0,image}','"https://cdn.dsmcdn.com/test.jpg"');
 o:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009102',request);
 IF o->'request'->'items'->0->>'image'<>'https://cdn.dsmcdn.com/test.jpg' OR o->>'state'<>'review' THEN RAISE EXCEPTION 'TRENDYOL_REGRESSION';END IF;
 replay:=public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000009102',request);IF replay->>'id'<>o->>'id' THEN RAISE EXCEPTION 'TRENDYOL_REPLAY';END IF;
END $$;
-- Listing is a separate API request/statement after submission commits.
DO $$DECLARE o jsonb;BEGIN
 SELECT value INTO o FROM jsonb_array_elements(public.kinto_world_list_v1('customer','test-customer')) WHERE value->'request'->'items'->0->>'url'='https://www.madamecoco.com/test-nt0000000001-101/';
 IF o IS NULL THEN RAISE EXCEPTION 'MADAME_CUSTOMER_NOT_VISIBLE: %',public.kinto_world_list_v1('customer','test-customer');END IF;
 IF NOT EXISTS(SELECT FROM jsonb_array_elements(public.kinto_world_list_v1('employee','test-staff')) x WHERE x->>'id'=o->>'id') THEN RAISE EXCEPTION 'MADAME_STAFF_NOT_VISIBLE';END IF;
 IF EXISTS(SELECT FROM jsonb_array_elements(public.kinto_world_list_v1('customer','other-customer')) x WHERE x->>'id'=o->>'id') THEN RAISE EXCEPTION 'MADAME_CUSTOMER_ISOLATION';END IF;
END $$;
RESET ROLE;
\i sql/kinto-world-madamecoco-rollback-v1.sql
\i sql/kinto-world-madamecoco-v1.sql
DO $$BEGIN
 IF (SELECT count(*) FROM private.kinto_world_orders_v1 WHERE request_key='00000000-0000-0000-0000-000000009101')<>1 THEN RAISE EXCEPTION 'MADAME_ROWS_LOST';END IF;
 IF (SELECT functions FROM madame_preservation) IS DISTINCT FROM (SELECT md5(string_agg(p.oid::text||p.prosrc,',' ORDER BY p.oid)) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.oid<>'public.kinto_world_submit_v1(text,uuid,jsonb)'::regprocedure) THEN RAISE EXCEPTION 'UNRELATED_FUNCTION_CHANGED';END IF;
 IF (SELECT triggers FROM madame_preservation) IS DISTINCT FROM (SELECT md5(coalesce(string_agg(pg_get_triggerdef(oid),',' ORDER BY oid),'')) FROM pg_trigger WHERE NOT tgisinternal) THEN RAISE EXCEPTION 'TRIGGER_CHANGED';END IF;
 IF (SELECT local_orders FROM madame_preservation) IS DISTINCT FROM (SELECT jsonb_agg(to_jsonb(o)) FROM public.orders o) THEN RAISE EXCEPTION 'LOCAL_ORDER_CHANGED';END IF;
 IF has_table_privilege('anon','private.kinto_world_orders_v1','SELECT,INSERT,UPDATE,DELETE') OR has_table_privilege('authenticated','private.kinto_world_orders_v1','SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'DIRECT_ACCESS';END IF;
END $$;
SELECT 'PASS Madame review/pricing, stable request, URL/seller/image boundaries, legacy Trendyol and rollback; local functions/triggers/orders unchanged' AS result;
