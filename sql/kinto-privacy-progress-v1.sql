-- Source-only progress/cancellation coordination. Install after media/chat/review modules.
-- No new deletion executor or order/payment/Storage mutation.
BEGIN;
CREATE FUNCTION private.kinto_privacy_progress_v1(p_request_id uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,private,public,extensions,pg_temp AS $$
 WITH facts AS(
 SELECT r.*,
  EXISTS(SELECT 1 FROM private.kinto_privacy_media_jobs_v1 WHERE request_id=r.id AND(attempts>0 OR state IN('leased','removed')))media_started,
  EXISTS(SELECT 1 FROM private.kinto_privacy_media_jobs_v1 WHERE request_id=r.id AND state='removed')media_completed,
  EXISTS(SELECT 1 FROM private.kinto_privacy_chat_decisions_v1 WHERE request_id=r.id AND state='erased')chat_completed,
  EXISTS(SELECT 1 FROM private.kinto_privacy_review_decisions_v1 WHERE request_id=r.id AND state='erased')review_completed,
  EXISTS(SELECT 1 FROM private.kinto_erasure_ledger_v1 WHERE request_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM private.kinto_erasure_ledger_v1 l JOIN public.customers c ON encode(digest(c.id::text,'sha256'),'hex')=l.customer_hash WHERE l.request_id=r.id)account_evidence,
  (SELECT min(review_on)FROM(SELECT review_on FROM private.kinto_privacy_chat_decisions_v1 WHERE request_id=r.id AND state='retained'UNION ALL SELECT review_on FROM private.kinto_privacy_review_decisions_v1 WHERE request_id=r.id AND state='retained'UNION ALL SELECT review_on FROM private.kinto_privacy_retention_decisions_v1 WHERE request_id=r.id)dates)review_at
 FROM private.kinto_deletion_requests_v1 r WHERE r.id=p_request_id
 ), derived AS(SELECT *,media_started OR chat_completed OR review_completed processing_started,status='deleted'AND customer_id IS NULL AND account_evidence account_completed FROM facts)
 SELECT jsonb_build_object('id',id,'status',status,'created_at',created_at,'updated_at',updated_at,
 'stage',CASE WHEN account_completed THEN 'completed'WHEN status='cancelled'THEN 'cancelled'WHEN status='deleted'THEN 'review_required'WHEN processing_started THEN 'processing'WHEN status IN('verified','manual_review')THEN 'review_required'ELSE 'verification_required'END,
 'processing_started',processing_started,'partial_work_recorded',media_completed OR chat_completed OR review_completed,
 'cancellation_allowed',status IN('pending','verified','manual_review')AND NOT processing_started,
 'retention_review_required',review_at IS NOT NULL,'next_retention_review_at',review_at,'account_deleted',account_completed)
 FROM derived;
$$;
CREATE FUNCTION public.kinto_deletion_progress_v1(p_session_token text,p_request_id uuid DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE cid uuid:=private.require_customer_review_session(p_session_token);result jsonb;BEGIN
 SELECT coalesce(jsonb_agg(private.kinto_privacy_progress_v1(x.id)ORDER BY x.created_at DESC,x.id),'[]')INTO result FROM(SELECT id,created_at FROM private.kinto_deletion_requests_v1 WHERE customer_id=cid AND(p_request_id IS NULL OR id=p_request_id)ORDER BY created_at DESC,id LIMIT 10)x;
 RETURN result;
END$$;
CREATE FUNCTION public.kinto_deletion_progress_admin_v1(p_session_token text,p_request_id uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,public,pg_temp AS $$
DECLARE aid text:=private.require_admin_session_v147(p_session_token);BEGIN RETURN private.kinto_privacy_progress_v1(p_request_id);END$$;
CREATE FUNCTION private.kinto_privacy_progress_cancel_guard_v1()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,private,pg_temp AS $$
BEGIN
 -- A failed Storage acknowledgement may follow successful physical removal.
 -- Even a retry/held job with attempts>0 must not be advertised as safely cancellable.
 IF NEW.status='cancelled'AND OLD.status IS DISTINCT FROM NEW.status AND coalesce((private.kinto_privacy_progress_v1(OLD.id)->>'processing_started')::boolean,false)THEN RAISE EXCEPTION 'PRIVACY_DELETION_ALREADY_STARTED';END IF;
 RETURN NEW;
END$$;
CREATE TRIGGER kinto_privacy_progress_cancel_v1 BEFORE UPDATE OF status ON private.kinto_deletion_requests_v1 FOR EACH ROW EXECUTE FUNCTION private.kinto_privacy_progress_cancel_guard_v1();
REVOKE ALL ON FUNCTION private.kinto_privacy_progress_v1(uuid),private.kinto_privacy_progress_cancel_guard_v1(),public.kinto_deletion_progress_v1(text,uuid),public.kinto_deletion_progress_admin_v1(text,uuid)FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kinto_deletion_progress_v1(text,uuid),public.kinto_deletion_progress_admin_v1(text,uuid)TO anon,authenticated,service_role;
COMMIT;
