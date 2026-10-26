-- Stop/drain the server worker first. Retain the audit/queue; removed files are irreversible.
BEGIN;
UPDATE private.kinto_privacy_media_policy_v1 SET enabled=false;
REVOKE ALL ON FUNCTION public.kinto_privacy_media_prepare_v1(text,uuid,uuid),public.kinto_privacy_media_claim_v1(text,uuid),public.kinto_privacy_media_finish_v1(text,uuid,uuid,uuid,boolean)FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS kinto_privacy_media_ticket_v1 ON private.product_review_upload_tickets_v150;
DROP TRIGGER IF EXISTS kinto_privacy_media_image_v1 ON public.product_review_images;
DROP TRIGGER IF EXISTS kinto_privacy_media_review_v1 ON public.product_reviews;
DROP TRIGGER IF EXISTS kinto_privacy_media_cancel_v1 ON private.kinto_deletion_requests_v1;
COMMIT;
