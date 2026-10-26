-- Runs inside one outer transaction together with the actual migration, then rolls back.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS country text,ADD COLUMN IF NOT EXISTS state text,ADD COLUMN IF NOT EXISTS address text,ADD COLUMN IF NOT EXISTS secondary_phone text;
ALTER TABLE public.orders DROP CONSTRAINT orders_customer_id_fkey;
ALTER TABLE public.orders ALTER COLUMN customer_id TYPE text USING customer_id::text;
ALTER TABLE public.orders ADD COLUMN branch_id text,ADD COLUMN courier_id text,ADD COLUMN delivery_agent_id text;
CREATE TABLE public.couriers(id uuid PRIMARY KEY,branch_id text,courier_uuid text);
CREATE FUNCTION private.kinto_staff_actor_v1(r text,t text)RETURNS jsonb LANGUAGE plpgsql AS $$BEGIN IF t IS DISTINCT FROM 'TEST-'||r THEN RAISE EXCEPTION 'TEST_SESSION_DENIED';END IF;RETURN jsonb_build_object('role',r,'id','00000000-0000-4000-8000-000000000209','permissions',jsonb_build_object('orders',true));END$$;
CREATE FUNCTION private.require_vendor_session(t text)RETURNS uuid LANGUAGE plpgsql AS $$BEGIN IF t IS DISTINCT FROM 'TEST-vendor'THEN RAISE EXCEPTION 'TEST_SESSION_DENIED';END IF;RETURN '00000000-0000-4000-8000-000000000208';END$$;
INSERT INTO public.customers(id,name,phone,code,country,state,address)VALUES
 ('00000000-0000-4000-8000-000000000201','TEST LEGACY NAME','TEST PHONE','TEST CODE','TEST COUNTRY','TEST STATE','TEST ADDRESS'),
 ('00000000-0000-4000-8000-000000000202','TEST OTHER','TEST OTHER PHONE','TEST OTHER CODE','OTHER','OTHER','OTHER');
INSERT INTO public.orders(id,customer_id,status,details)VALUES
 ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000201','TEST paid','{}'),
 ('00000000-0000-4000-8000-000000000204','00000000-0000-4000-8000-000000000202','TEST paid','{}');
INSERT INTO private.kinto_deletion_requests_v1(id,customer_id,status,verified_by)VALUES('00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000201','verified','00000000-0000-4000-8000-000000000099');
UPDATE public.orders SET branch_id='00000000-0000-4000-8000-000000000209' WHERE id='00000000-0000-4000-8000-000000000203';
INSERT INTO public.local_stores(id)VALUES('00000000-0000-4000-8000-000000000208');
INSERT INTO public.order_store_segments(id,order_id,store_id,items_snapshot)VALUES('00000000-0000-4000-8000-000000000206','00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000208','[]');
INSERT INTO public.couriers VALUES('00000000-0000-4000-8000-000000000209','00000000-0000-4000-8000-000000000209','00000000-0000-4000-8000-000000000210');
UPDATE public.orders SET courier_id='00000000-0000-4000-8000-000000000209' WHERE id='00000000-0000-4000-8000-000000000203';
CREATE TEMP TABLE preserved_orders_before AS SELECT id,to_jsonb(o)payload FROM public.orders o;
DO $$DECLARE row jsonb;result jsonb;BEGIN
 BEGIN PERFORM public.kinto_privacy_invoice_preserve_v1('test-admin','00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000203');RAISE EXCEPTION 'expected missing decision failure';EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM<>'CURRENT_INVOICE_RETENTION_REVIEW_REQUIRED'THEN RAISE;END IF;END;
 row:=public.kinto_privacy_retention_review_v1('test-admin','00000000-0000-4000-8000-000000000205')->'items'->0;
 PERFORM public.kinto_privacy_retention_review_v1('test-admin','00000000-0000-4000-8000-000000000205','orders','retain','00000000-0000-4000-8000-000000000203',NULL,row->>'content_hash',row->>'inventory_signature',0,'invoice_dependency',ARRAY['invoice_identity'],now()+interval '7 days');
 result:=public.kinto_privacy_invoice_preserve_v1('test-admin','00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000203');
 PERFORM public.test_assert(result->>'preserved'='true'AND result->>'account_deleted'='false','reviewed legacy identity preserved without deleting account');
 PERFORM public.test_assert((SELECT identity->>'name'='TEST LEGACY NAME'AND identity->>'phone'='TEST PHONE'FROM private.kinto_privacy_invoice_identity_v1 WHERE order_id='00000000-0000-4000-8000-000000000203'),'identity derived from owned current profile');
 result:=public.kinto_privacy_invoice_preserve_v1('test-admin','00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000203');
 PERFORM public.test_assert(result->>'duplicate'='true','duplicate does not create another identity copy');
 BEGIN PERFORM public.kinto_privacy_invoice_preserve_v1('test-admin','00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000204');RAISE EXCEPTION 'expected ownership failure';EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM<>'OWNED_INVOICE_REQUIRED'THEN RAISE;END IF;END;
END$$;
SELECT public.test_assert(NOT has_table_privilege('anon','private.kinto_privacy_invoice_identity_v1','SELECT')AND NOT has_table_privilege('authenticated','private.kinto_privacy_invoice_identity_v1','SELECT'),'no direct access to retained identity');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.orders o JOIN preserved_orders_before b USING(id)WHERE to_jsonb(o)IS DISTINCT FROM b.payload),'all order rows including amounts/status/details unchanged');
SELECT public.test_assert((SELECT count(*)FROM private.kinto_privacy_invoice_identity_v1)=1,'only one reviewed owned invoice copied');
SELECT 'PASS_INVOICE_RETENTION_CAPTURE: verified request and current per-record decision, exact owner, idempotency, no direct grants, original orders unchanged; no account erasure claim';

SELECT public.test_assert(public.kinto_privacy_invoice_read_v1('admin','TEST-admin','00000000-0000-4000-8000-000000000203')->>'name'='TEST LEGACY NAME','admin reads retained invoice through session scope');
SELECT public.test_assert(public.kinto_privacy_invoice_read_v1('branch','TEST-branch','00000000-0000-4000-8000-000000000203')->>'name'='TEST LEGACY NAME','assigned branch scope retained');
DO $$BEGIN
 BEGIN PERFORM public.kinto_privacy_invoice_read_v1('vendor','TEST-vendor','00000000-0000-4000-8000-000000000204');RAISE EXCEPTION 'expected vendor denial';EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM<>'INVOICE_SCOPE_DENIED'THEN RAISE;END IF;END;
 BEGIN PERFORM public.kinto_privacy_invoice_read_v1('branch','TEST-branch','00000000-0000-4000-8000-000000000204');RAISE EXCEPTION 'expected branch denial';EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM<>'INVOICE_SCOPE_DENIED'THEN RAISE;END IF;END;
 BEGIN PERFORM public.kinto_privacy_invoice_read_v1('admin','WRONG','00000000-0000-4000-8000-000000000203');RAISE EXCEPTION 'expected session denial';EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM<>'TEST_SESSION_DENIED'THEN RAISE;END IF;END;
END$$;
SELECT public.test_assert(public.kinto_privacy_invoice_read_v1('vendor','TEST-vendor','00000000-0000-4000-8000-000000000203')->>'name'='TEST LEGACY NAME','only owning vendor reads retained customer identity');
SELECT public.test_assert(public.kinto_privacy_invoice_read_v1('courier','TEST-courier','00000000-0000-4000-8000-000000000203')->>'name'='TEST LEGACY NAME','only assigned courier reads retained customer identity');
DELETE FROM public.customers WHERE id='00000000-0000-4000-8000-000000000201';
SELECT public.test_assert(public.kinto_privacy_invoice_read_v1('admin','TEST-admin','00000000-0000-4000-8000-000000000203')->>'phone'='TEST PHONE','retained invoice survives actual synthetic profile deletion');
SELECT public.test_assert(NOT EXISTS(SELECT 1 FROM public.orders o JOIN preserved_orders_before b USING(id)WHERE to_jsonb(o)IS DISTINCT FROM b.payload),'synthetic profile deletion leaves all orders unchanged');
SELECT public.test_assert((SELECT name='TEST OTHER'FROM public.customers WHERE id='00000000-0000-4000-8000-000000000202'),'other customer preserved');
-- Altering a later business value is allowed normally, but invalidates the archived context.
UPDATE public.orders SET status='TEST changed normally' WHERE id='00000000-0000-4000-8000-000000000203';
DO $$BEGIN
 BEGIN PERFORM public.kinto_privacy_invoice_read_v1('admin','TEST-admin','00000000-0000-4000-8000-000000000203');RAISE EXCEPTION 'expected stale archive denial';EXCEPTION WHEN raise_exception OR insufficient_privilege THEN IF SQLERRM<>'PRESERVED_INVOICE_CONTEXT_CHANGED'THEN RAISE;END IF;END;
END$$;
SELECT 'PASS_INVOICE_RETENTION_READ: existing order-visibility helper; assigned branch allowed, other branch/vendor/wrong session denied, changed record held. Role validators are explicit fixture doubles, not production-auth certification.';
