-- Additive, disabled by default. Review media only; no order/payment/stock writes.
BEGIN;
CREATE TABLE private.kinto_privacy_media_policy_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,inventory_signature text NOT NULL);
CREATE TABLE private.kinto_privacy_media_jobs_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES private.kinto_deletion_requests_v1(id),
 customer_id uuid REFERENCES public.customers(id)ON DELETE SET NULL,image_id uuid NOT NULL,review_id uuid NOT NULL,
 object_path text,kind text NOT NULL CHECK(kind IN('storage','database')),state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','leased','removed','held')),
 lease uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,image_id));
CREATE TABLE private.kinto_privacy_media_permits_v1(transaction_id bigint NOT NULL,image_id uuid NOT NULL,PRIMARY KEY(transaction_id,image_id));
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['kinto_privacy_media_policy_v1','kinto_privacy_media_jobs_v1','kinto_privacy_media_permits_v1']LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);END LOOP;END$$;
CREATE FUNCTION private.kinto_privacy_media_guard_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
BEGIN
 -- Lock job rows so a concurrent source change cannot pass using an earlier lease snapshot.
 IF TG_TABLE_NAME='product_review_images'THEN
  PERFORM 1 FROM private.kinto_privacy_media_jobs_v1 WHERE image_id=OLD.id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM private.kinto_privacy_media_jobs_v1 WHERE image_id=OLD.id AND state='leased')AND NOT EXISTS(SELECT 1 FROM private.kinto_privacy_media_permits_v1 WHERE transaction_id=txid_current()AND image_id=OLD.id)THEN RAISE EXCEPTION 'PRIVACY_MEDIA_IN_PROGRESS';END IF;
 ELSIF TG_TABLE_NAME='product_reviews'THEN
  PERFORM 1 FROM private.kinto_privacy_media_jobs_v1 WHERE review_id=OLD.id ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM private.kinto_privacy_media_jobs_v1 WHERE review_id=OLD.id AND state='leased')THEN RAISE EXCEPTION 'PRIVACY_MEDIA_IN_PROGRESS';END IF;
 ELSE
  IF NEW.status='cancelled'AND OLD.status IS DISTINCT FROM NEW.status THEN
   PERFORM 1 FROM private.kinto_privacy_media_jobs_v1 WHERE request_id=OLD.id ORDER BY id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM private.kinto_privacy_media_jobs_v1 WHERE request_id=OLD.id AND state IN('leased','removed'))THEN RAISE EXCEPTION 'PRIVACY_DELETION_ALREADY_STARTED';END IF;
  END IF;
 END IF;
 IF TG_OP='DELETE'THEN RETURN OLD;END IF;RETURN NEW;
END$$;
CREATE TRIGGER kinto_privacy_media_image_v1 BEFORE DELETE OR UPDATE OF review_id,storage_path ON public.product_review_images FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_media_guard_v1();
CREATE TRIGGER kinto_privacy_media_review_v1 BEFORE DELETE OR UPDATE OF customer_id ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_media_guard_v1();
CREATE TRIGGER kinto_privacy_media_cancel_v1 BEFORE UPDATE OF status ON private.kinto_deletion_requests_v1 FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_media_guard_v1();
CREATE FUNCTION private.kinto_privacy_media_check_v1(p_session_token text,p_request_id uuid)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE aid uuid:=private.require_admin_session_v147(p_session_token)::uuid;cid uuid;BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.kinto_privacy_media_policy_v1 WHERE singleton AND enabled AND inventory_signature=private.kinto_erasure_signature_v1())THEN RAISE EXCEPTION 'PRIVACY_MEDIA_POLICY_REQUIRED';END IF;
 SELECT customer_id INTO cid FROM private.kinto_deletion_requests_v1 WHERE id=p_request_id AND status='verified'AND verified_by IS NOT NULL FOR UPDATE;
 IF cid IS NULL THEN RAISE EXCEPTION 'VERIFIED_REQUEST_REQUIRED';END IF;RETURN cid;
END$$;
CREATE FUNCTION public.kinto_privacy_media_prepare_v1(p_session_token text,p_request_id uuid,p_confirm_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE cid uuid;cnt integer;BEGIN
 IF p_request_id IS NULL OR p_request_id IS DISTINCT FROM p_confirm_request_id THEN RAISE EXCEPTION 'EXACT_REQUEST_CONFIRMATION_REQUIRED';END IF;
 cid:=private.kinto_privacy_media_check_v1(p_session_token,p_request_id);
 INSERT INTO private.kinto_privacy_media_jobs_v1(request_id,customer_id,image_id,review_id,object_path,kind)
 SELECT p_request_id,cid,i.id,i.review_id,i.storage_path,CASE WHEN i.storage_path LIKE 'database://%'THEN 'database'ELSE 'storage'END
 FROM public.product_review_images i JOIN public.product_reviews r ON r.id=i.review_id WHERE r.customer_id=cid ON CONFLICT(request_id,image_id)DO NOTHING;
 GET DIAGNOSTICS cnt=ROW_COUNT;
 RETURN jsonb_build_object('prepared',cnt,'account_deleted',false);
END$$;
CREATE FUNCTION public.kinto_privacy_media_claim_v1(p_session_token text,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE cid uuid;j private.kinto_privacy_media_jobs_v1;im public.product_review_images;owner uuid;BEGIN
 cid:=private.kinto_privacy_media_check_v1(p_session_token,p_request_id);
 SELECT *INTO j FROM private.kinto_privacy_media_jobs_v1 WHERE request_id=p_request_id AND(state='pending'OR(state='leased'AND lease_until<now()))ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF j.id IS NULL THEN RETURN jsonb_build_object('idle',true,'account_deleted',false);END IF;
 SELECT *INTO im FROM public.product_review_images WHERE id=j.image_id FOR UPDATE;
 SELECT customer_id INTO owner FROM public.product_reviews WHERE id=j.review_id FOR UPDATE;
 IF j.customer_id IS DISTINCT FROM cid OR owner IS DISTINCT FROM cid OR im.id IS NULL OR im.review_id IS DISTINCT FROM j.review_id OR im.storage_path IS DISTINCT FROM j.object_path OR j.attempts>=3 OR(j.kind='storage'AND(j.object_path NOT LIKE 'reviews/'||j.review_id::text||'/%' OR j.object_path !~ '^[a-zA-Z0-9/_.-]+$' OR position('..'IN j.object_path)>0))THEN
  UPDATE private.kinto_privacy_media_jobs_v1 SET state='held',lease=NULL,lease_until=NULL,updated_at=now()WHERE id=j.id;
  RETURN jsonb_build_object('held',true,'account_deleted',false);
 END IF;
 UPDATE private.kinto_privacy_media_jobs_v1 SET state='leased',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()WHERE id=j.id RETURNING *INTO j;
 RETURN jsonb_build_object('id',j.id,'lease',j.lease,'kind',j.kind,'bucket','product-review-images','path',j.object_path,'account_deleted',false);
END$$;
CREATE FUNCTION public.kinto_privacy_media_finish_v1(p_session_token text,p_request_id uuid,p_job_id uuid,p_lease uuid,p_removed boolean)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp SET lock_timeout='500ms' AS $$
DECLARE cid uuid;j private.kinto_privacy_media_jobs_v1;im public.product_review_images;owner uuid;BEGIN
 cid:=private.kinto_privacy_media_check_v1(p_session_token,p_request_id);
 SELECT *INTO j FROM private.kinto_privacy_media_jobs_v1 WHERE id=p_job_id AND request_id=p_request_id FOR UPDATE;
 IF j.id IS NULL OR j.customer_id IS DISTINCT FROM cid OR j.lease IS DISTINCT FROM p_lease THEN RAISE EXCEPTION 'PRIVACY_MEDIA_LEASE_INVALID';END IF;
 IF j.state='removed'THEN RETURN jsonb_build_object('removed',true,'duplicate',true,'account_deleted',false);END IF;
 IF j.state<>'leased'OR j.lease_until<now()THEN RAISE EXCEPTION 'PRIVACY_MEDIA_LEASE_INVALID';END IF;
 IF p_removed IS DISTINCT FROM true THEN UPDATE private.kinto_privacy_media_jobs_v1 SET state='pending',lease=NULL,lease_until=NULL,updated_at=now()WHERE id=j.id;RETURN jsonb_build_object('retry',true,'account_deleted',false);END IF;
 SELECT *INTO im FROM public.product_review_images WHERE id=j.image_id FOR UPDATE;
 SELECT customer_id INTO owner FROM public.product_reviews WHERE id=j.review_id FOR UPDATE;
 IF owner IS DISTINCT FROM cid OR im.id IS NULL OR im.review_id IS DISTINCT FROM j.review_id OR im.storage_path IS DISTINCT FROM j.object_path THEN RAISE EXCEPTION 'PRIVACY_MEDIA_IDENTITY_CHANGED';END IF;
 -- The service worker only acknowledges Storage after remove + exact-name absence verification.
 -- Database payload removal uses the already-observed image FK cascade.
 INSERT INTO private.kinto_privacy_media_permits_v1 VALUES(txid_current(),j.image_id);
 DELETE FROM public.product_review_images WHERE id=j.image_id;
 DELETE FROM private.kinto_privacy_media_permits_v1 WHERE transaction_id=txid_current()AND image_id=j.image_id;
 UPDATE private.kinto_privacy_media_jobs_v1 SET state='removed',object_path=NULL,lease_until=NULL,updated_at=now()WHERE id=j.id;
 RETURN jsonb_build_object('removed',true,'account_deleted',false);
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_media_guard_v1(),private.kinto_privacy_media_check_v1(text,uuid)FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.kinto_privacy_media_prepare_v1(text,uuid,uuid),public.kinto_privacy_media_claim_v1(text,uuid),public.kinto_privacy_media_finish_v1(text,uuid,uuid,uuid,boolean)FROM PUBLIC,anon,authenticated;
-- Paths and completion authority are server-only; no browser/anonymous worker access.
GRANT EXECUTE ON FUNCTION public.kinto_privacy_media_prepare_v1(text,uuid,uuid),public.kinto_privacy_media_claim_v1(text,uuid),public.kinto_privacy_media_finish_v1(text,uuid,uuid,uuid,boolean)TO service_role;
COMMIT;
