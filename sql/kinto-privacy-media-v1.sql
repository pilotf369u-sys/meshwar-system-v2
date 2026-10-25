-- Additive, disabled by default. Review media only; no order/payment/stock writes.
BEGIN;
CREATE TABLE private.kinto_privacy_media_policy_v1(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,inventory_signature text NOT NULL);
CREATE TABLE private.kinto_privacy_media_jobs_v1(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),request_id uuid NOT NULL REFERENCES private.kinto_deletion_requests_v1(id),
 customer_id uuid REFERENCES public.customers(id)ON DELETE SET NULL,source_type text NOT NULL DEFAULT 'image'CHECK(source_type IN('image','upload_ticket')),source_id uuid NOT NULL,review_id uuid NOT NULL,
 object_path text,kind text NOT NULL CHECK(kind IN('storage','database')),state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','leased','removed','held')),
 lease uuid,lease_until timestamptz,attempts integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(request_id,source_type,source_id));
CREATE INDEX kinto_privacy_media_source_v1 ON private.kinto_privacy_media_jobs_v1(source_type,source_id);
CREATE INDEX kinto_privacy_media_leased_path_v1 ON private.kinto_privacy_media_jobs_v1(object_path)WHERE state='leased';
CREATE TABLE private.kinto_privacy_media_permits_v1(transaction_id bigint NOT NULL,source_type text NOT NULL,source_id uuid NOT NULL,PRIMARY KEY(transaction_id,source_type,source_id));
-- Private deletion evidence for media restored from an older/manual copy. No raw object path.
CREATE TABLE private.kinto_privacy_media_ledger_v1(sequence_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,request_id uuid NOT NULL REFERENCES private.kinto_deletion_requests_v1(id),bucket text NOT NULL CHECK(bucket='product-review-images'),path_hash text NOT NULL CHECK(path_hash~'^[0-9a-f]{64}$'),removed_at timestamptz NOT NULL DEFAULT now(),UNIQUE(request_id,bucket,path_hash));
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['kinto_privacy_media_policy_v1','kinto_privacy_media_jobs_v1','kinto_privacy_media_permits_v1','kinto_privacy_media_ledger_v1']LOOP EXECUTE format('ALTER TABLE private.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON private.%I FROM PUBLIC,anon,authenticated',t);END LOOP;END$$;
CREATE FUNCTION private.kinto_privacy_media_guard_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE source_kind text;old_id uuid;old_path text;new_path text;BEGIN
 IF TG_TABLE_NAME IN('product_review_images','product_review_upload_tickets_v150')THEN
  source_kind:=CASE WHEN TG_TABLE_NAME='product_review_images'THEN 'image'ELSE 'upload_ticket'END;
  IF TG_OP<>'INSERT'THEN old_id:=OLD.id;old_path:=OLD.storage_path;END IF;
  IF TG_OP<>'DELETE'THEN new_path:=NEW.storage_path;END IF;
  -- Also protect the exact path from new references while an orphan-ticket job removes it.
  PERFORM 1 FROM private.kinto_privacy_media_jobs_v1 j WHERE(j.source_type=source_kind AND j.source_id=old_id)OR j.object_path IN(old_path,new_path)ORDER BY j.id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM private.kinto_privacy_media_jobs_v1 j WHERE j.state='leased'AND((j.source_type=source_kind AND j.source_id=old_id)OR j.object_path IN(old_path,new_path)))AND NOT EXISTS(SELECT 1 FROM private.kinto_privacy_media_permits_v1 p WHERE p.transaction_id=txid_current()AND p.source_type=source_kind AND p.source_id=old_id)THEN RAISE EXCEPTION 'PRIVACY_MEDIA_IN_PROGRESS';END IF;
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
CREATE TRIGGER kinto_privacy_media_image_v1 BEFORE INSERT OR DELETE OR UPDATE OF review_id,storage_path ON public.product_review_images FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_media_guard_v1();
CREATE TRIGGER kinto_privacy_media_ticket_v1 BEFORE INSERT OR DELETE OR UPDATE ON private.product_review_upload_tickets_v150 FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_media_guard_v1();
CREATE TRIGGER kinto_privacy_media_review_v1 BEFORE DELETE OR UPDATE OF customer_id ON public.product_reviews FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_media_guard_v1();
CREATE TRIGGER kinto_privacy_media_cancel_v1 BEFORE UPDATE OF status ON private.kinto_deletion_requests_v1 FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_media_guard_v1();
CREATE FUNCTION private.kinto_privacy_media_check_v1(p_session_token text,p_request_id uuid)RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE aid uuid:=private.require_admin_session_v147(p_session_token)::uuid;cid uuid;BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.kinto_privacy_media_policy_v1 WHERE singleton AND enabled AND inventory_signature=private.kinto_erasure_signature_v1()) OR NOT EXISTS(SELECT 1 FROM private.kinto_erasure_policy_v1 WHERE singleton AND enabled AND inventory_signature=private.kinto_erasure_signature_v1())THEN RAISE EXCEPTION 'PRIVACY_MEDIA_POLICY_REQUIRED';END IF;
 SELECT customer_id INTO cid FROM private.kinto_deletion_requests_v1 WHERE id=p_request_id AND status='verified'AND verified_by IS NOT NULL FOR UPDATE;
 IF cid IS NULL THEN RAISE EXCEPTION 'VERIFIED_REQUEST_REQUIRED';END IF;RETURN cid;
END$$;
CREATE FUNCTION public.kinto_privacy_media_prepare_v1(p_session_token text,p_request_id uuid,p_confirm_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp SET lock_timeout='500ms' AS $$
DECLARE cid uuid;cnt integer;extra integer;BEGIN
 IF p_request_id IS NULL OR p_request_id IS DISTINCT FROM p_confirm_request_id THEN RAISE EXCEPTION 'EXACT_REQUEST_CONFIRMATION_REQUIRED';END IF;
 cid:=private.kinto_privacy_media_check_v1(p_session_token,p_request_id);
 INSERT INTO private.kinto_privacy_media_jobs_v1(request_id,customer_id,source_id,review_id,object_path,kind)
 SELECT p_request_id,cid,i.id,i.review_id,i.storage_path,CASE WHEN i.storage_path LIKE 'database://%'THEN 'database'ELSE 'storage'END
 FROM public.product_review_images i JOIN public.product_reviews r ON r.id=i.review_id WHERE r.customer_id=cid ON CONFLICT(request_id,source_type,source_id)DO NOTHING;
 GET DIAGNOSTICS cnt=ROW_COUNT;
 -- Only used tickets prove a completed upload. Unused tickets are held, even if expired.
 -- Their expiry alone is not proof that a previously started upload has finished.
 INSERT INTO private.kinto_privacy_media_jobs_v1(request_id,customer_id,source_type,source_id,review_id,object_path,kind,state)
 SELECT p_request_id,cid,'upload_ticket',t.id,t.review_id,t.storage_path,'storage',CASE WHEN t.used_at IS NULL THEN 'held'ELSE 'pending'END
 FROM private.product_review_upload_tickets_v150 t JOIN public.product_reviews r ON r.id=t.review_id
 WHERE t.customer_id=cid AND r.customer_id=cid AND NOT EXISTS(SELECT 1 FROM public.product_review_images i WHERE i.storage_path=t.storage_path)
 ON CONFLICT(request_id,source_type,source_id)DO NOTHING;
 GET DIAGNOSTICS extra=ROW_COUNT;cnt:=cnt+extra;

 RETURN jsonb_build_object('prepared',cnt,'account_deleted',false);
END$$;
CREATE FUNCTION public.kinto_privacy_media_claim_v1(p_session_token text,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp SET lock_timeout='500ms' AS $$
DECLARE cid uuid;j private.kinto_privacy_media_jobs_v1;im public.product_review_images;ticket private.product_review_upload_tickets_v150;owner uuid;valid_source boolean;BEGIN
 cid:=private.kinto_privacy_media_check_v1(p_session_token,p_request_id);
 SELECT *INTO j FROM private.kinto_privacy_media_jobs_v1 WHERE request_id=p_request_id AND(state='pending'OR(state='leased'AND lease_until<now()))ORDER BY created_at,id LIMIT 1 FOR UPDATE SKIP LOCKED;
 IF j.id IS NULL THEN RETURN jsonb_build_object('idle',true,'held',EXISTS(SELECT 1 FROM private.kinto_privacy_media_jobs_v1 WHERE request_id=p_request_id AND state='held'),'account_deleted',false);END IF;
 IF j.source_type='image'THEN
  SELECT *INTO im FROM public.product_review_images WHERE id=j.source_id FOR UPDATE;
  valid_source:=im.id IS NOT NULL AND im.review_id=j.review_id AND im.storage_path=j.object_path AND NOT EXISTS(SELECT 1 FROM private.product_review_upload_tickets_v150 t WHERE t.storage_path=j.object_path AND t.used_at IS NULL);
 ELSE
  SELECT *INTO ticket FROM private.product_review_upload_tickets_v150 WHERE id=j.source_id FOR UPDATE;
  valid_source:=ticket.id IS NOT NULL AND ticket.customer_id=cid AND ticket.review_id=j.review_id AND ticket.storage_path=j.object_path AND ticket.used_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.product_review_images i WHERE i.storage_path=j.object_path);
 END IF;
 SELECT customer_id INTO owner FROM public.product_reviews WHERE id=j.review_id FOR UPDATE;
 IF j.customer_id IS DISTINCT FROM cid OR owner IS DISTINCT FROM cid OR valid_source IS DISTINCT FROM true OR j.attempts>=3 OR(j.kind='storage'AND(j.object_path NOT LIKE 'reviews/'||j.review_id::text||'/%' OR j.object_path !~ '^[a-zA-Z0-9/_.-]+$' OR position('..'IN j.object_path)>0))THEN
  UPDATE private.kinto_privacy_media_jobs_v1 SET state='held',lease=NULL,lease_until=NULL,updated_at=now()WHERE id=j.id;
  RETURN jsonb_build_object('held',true,'account_deleted',false);
 END IF;
 UPDATE private.kinto_privacy_media_jobs_v1 SET state='leased',lease=gen_random_uuid(),lease_until=now()+interval '5 minutes',attempts=attempts+1,updated_at=now()WHERE id=j.id RETURNING *INTO j;
 RETURN jsonb_build_object('id',j.id,'lease',j.lease,'kind',j.kind,'source_type',j.source_type,'bucket','product-review-images','path',j.object_path,'account_deleted',false);
END$$;
CREATE FUNCTION public.kinto_privacy_media_finish_v1(p_session_token text,p_request_id uuid,p_job_id uuid,p_lease uuid,p_removed boolean)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp SET lock_timeout='500ms' AS $$
DECLARE cid uuid;j private.kinto_privacy_media_jobs_v1;im public.product_review_images;ticket private.product_review_upload_tickets_v150;owner uuid;valid_source boolean;BEGIN
 cid:=private.kinto_privacy_media_check_v1(p_session_token,p_request_id);
 SELECT *INTO j FROM private.kinto_privacy_media_jobs_v1 WHERE id=p_job_id AND request_id=p_request_id FOR UPDATE;
 IF j.id IS NULL OR j.customer_id IS DISTINCT FROM cid OR j.lease IS DISTINCT FROM p_lease THEN RAISE EXCEPTION 'PRIVACY_MEDIA_LEASE_INVALID';END IF;
 IF j.state='removed'THEN RETURN jsonb_build_object('removed',true,'duplicate',true,'account_deleted',false);END IF;
 IF j.state<>'leased'OR j.lease_until<now()THEN RAISE EXCEPTION 'PRIVACY_MEDIA_LEASE_INVALID';END IF;
 IF p_removed IS DISTINCT FROM true THEN UPDATE private.kinto_privacy_media_jobs_v1 SET state='pending',lease=NULL,lease_until=NULL,updated_at=now()WHERE id=j.id;RETURN jsonb_build_object('retry',true,'account_deleted',false);END IF;
 IF j.source_type='image'THEN
  SELECT *INTO im FROM public.product_review_images WHERE id=j.source_id FOR UPDATE;
  valid_source:=im.id IS NOT NULL AND im.review_id=j.review_id AND im.storage_path=j.object_path AND NOT EXISTS(SELECT 1 FROM private.product_review_upload_tickets_v150 t WHERE t.storage_path=j.object_path AND t.used_at IS NULL);
 ELSE
  SELECT *INTO ticket FROM private.product_review_upload_tickets_v150 WHERE id=j.source_id FOR UPDATE;
  valid_source:=ticket.id IS NOT NULL AND ticket.customer_id=cid AND ticket.review_id=j.review_id AND ticket.storage_path=j.object_path AND ticket.used_at IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.product_review_images i WHERE i.storage_path=j.object_path);
 END IF;
 SELECT customer_id INTO owner FROM public.product_reviews WHERE id=j.review_id FOR UPDATE;
 IF owner IS DISTINCT FROM cid OR valid_source IS DISTINCT FROM true THEN RAISE EXCEPTION 'PRIVACY_MEDIA_IDENTITY_CHANGED';END IF;
 -- The service worker only acknowledges Storage after remove + exact-name absence verification.
 -- Database payload removal uses the already-observed image FK cascade.
 IF j.kind='storage'THEN
  INSERT INTO private.kinto_privacy_media_ledger_v1(request_id,bucket,path_hash)VALUES(j.request_id,'product-review-images',encode(digest('product-review-images/'||j.object_path,'sha256'),'hex'))ON CONFLICT(request_id,bucket,path_hash)DO NOTHING;
 END IF;
 INSERT INTO private.kinto_privacy_media_permits_v1 VALUES(txid_current(),j.source_type,j.source_id);
 IF j.source_type='image'THEN DELETE FROM public.product_review_images WHERE id=j.source_id;
 ELSE DELETE FROM private.product_review_upload_tickets_v150 WHERE id=j.source_id;END IF;
 DELETE FROM private.kinto_privacy_media_permits_v1 WHERE transaction_id=txid_current()AND source_type=j.source_type AND source_id=j.source_id;
 UPDATE private.kinto_privacy_media_jobs_v1 SET state='removed',object_path=NULL,lease_until=NULL,updated_at=now()WHERE id=j.id;
 RETURN jsonb_build_object('removed',true,'account_deleted',false);
END$$;
-- Operator-only exports/restore detection. An external coherent checkpoint is still mandatory.
CREATE FUNCTION private.kinto_privacy_media_ledger_export_v1(p_after_sequence bigint DEFAULT 0,p_limit integer DEFAULT 200)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(l)ORDER BY sequence_id),'[]'::jsonb)FROM(SELECT *FROM private.kinto_privacy_media_ledger_v1 WHERE sequence_id>greatest(coalesce(p_after_sequence,0),0)ORDER BY sequence_id LIMIT least(greatest(coalesce(p_limit,200),1),500))l;
$$;
CREATE FUNCTION private.kinto_privacy_restore_media_matches_v1(p_external_hashes jsonb)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
DECLARE matches jsonb;stored jsonb:='[]';has_storage boolean:=to_regclass('storage.objects')IS NOT NULL;BEGIN
 IF jsonb_typeof(p_external_hashes)IS DISTINCT FROM 'array'THEN RAISE EXCEPTION 'EXTERNAL_MEDIA_LEDGER_REQUIRED';END IF;
 IF jsonb_array_length(p_external_hashes)NOT BETWEEN 1 AND 10000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_external_hashes)x WHERE jsonb_typeof(x)<>'string'OR(x#>>'{}')!~'^[0-9a-f]{64}$')THEN RAISE EXCEPTION 'EXTERNAL_MEDIA_LEDGER_REQUIRED';END IF;
 SELECT coalesce(jsonb_agg(DISTINCT h),'[]'::jsonb)INTO matches FROM(
  SELECT encode(digest('product-review-images/'||storage_path,'sha256'),'hex')h FROM public.product_review_images WHERE storage_path NOT LIKE 'database://%'
  UNION SELECT encode(digest('product-review-images/'||storage_path,'sha256'),'hex')FROM private.product_review_upload_tickets_v150
 )p WHERE h IN(SELECT jsonb_array_elements_text(p_external_hashes));
 IF has_storage THEN
  EXECUTE $q$SELECT coalesce(jsonb_agg(DISTINCT encode(digest('product-review-images/'||name,'sha256'),'hex')),'[]'::jsonb)FROM storage.objects WHERE bucket_id='product-review-images'AND encode(digest('product-review-images/'||name,'sha256'),'hex')IN(SELECT jsonb_array_elements_text($1))$q$INTO stored USING p_external_hashes;
 END IF;
 RETURN jsonb_build_object('matched_hashes',(SELECT coalesce(jsonb_agg(DISTINCT v),'[]'::jsonb)FROM jsonb_array_elements(matches||stored)v),'storage_metadata_examined',has_storage,'coverage_verified',false,'restore_authorized',false);
END$$;
REVOKE ALL ON FUNCTION private.kinto_privacy_media_ledger_export_v1(bigint,integer),private.kinto_privacy_restore_media_matches_v1(jsonb)FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.kinto_privacy_media_guard_v1(),private.kinto_privacy_media_check_v1(text,uuid)FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.kinto_privacy_media_prepare_v1(text,uuid,uuid),public.kinto_privacy_media_claim_v1(text,uuid),public.kinto_privacy_media_finish_v1(text,uuid,uuid,uuid,boolean)FROM PUBLIC,anon,authenticated;
-- Paths and completion authority are server-only; no browser/anonymous worker access.
GRANT EXECUTE ON FUNCTION public.kinto_privacy_media_prepare_v1(text,uuid,uuid),public.kinto_privacy_media_claim_v1(text,uuid),public.kinto_privacy_media_finish_v1(text,uuid,uuid,uuid,boolean)TO service_role;
COMMIT;
