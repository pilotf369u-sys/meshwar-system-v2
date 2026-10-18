-- Review image preflight compatibility. No bucket ACL/policy or business row changes.
BEGIN;
CREATE TABLE IF NOT EXISTS private.kinto_review_upload_backup_v1(
 signature text PRIMARY KEY,before_definition text NOT NULL,after_definition text
);
REVOKE ALL ON private.kinto_review_upload_backup_v1 FROM PUBLIC,anon,authenticated;
INSERT INTO private.kinto_review_upload_backup_v1(signature,before_definition)
 SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE (n.nspname='private' AND p.proname='review_storage_upload_allowed_v150')
 OR (n.nspname='public' AND p.proname IN ('customer_create_review_image_upload_v150','customer_finalize_review_image_upload_v150'))
 ON CONFLICT DO NOTHING;
DO $$ BEGIN IF (SELECT count(*) FROM private.kinto_review_upload_backup_v1)<>3 THEN RAISE EXCEPTION 'REVIEW_UPLOAD_CONTRACT_MISSING'; END IF; END $$;
CREATE OR REPLACE FUNCTION private.review_storage_upload_allowed_v150(p_bucket text,p_name text,p_metadata jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public,private,storage,pg_temp AS $$
 SELECT p_bucket='product-review-images' AND EXISTS(
  SELECT 1 FROM private.product_review_upload_tickets_v150 t
  JOIN public.product_reviews r ON r.id=t.review_id AND r.customer_id=t.customer_id
  WHERE t.storage_path=p_name AND t.used_at IS NULL AND t.expires_at>now()
  AND t.byte_size BETWEEN 12 AND 51200 AND r.moderation_status IN ('pending','rejected')
  -- Storage probes INSERT permission before final metadata.size exists.
  -- Authorize the exact ticket path now; enforce any supplied type/size and
  -- require the persisted actual type AND size again in finalize.
  AND (p_metadata->>'mimetype' IS NULL OR lower(p_metadata->>'mimetype')=t.mime_type)
  AND (p_metadata->>'size' IS NULL OR CASE WHEN p_metadata->>'size' ~ '^[0-9]{1,8}$'
       THEN (p_metadata->>'size')::integer=t.byte_size ELSE false END)
 );
$$;
CREATE OR REPLACE FUNCTION public.customer_create_review_image_upload_v150(p_session_token text, p_review_id uuid, p_mime_type text, p_byte_size integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'storage', 'pg_temp'
AS $function$
declare
  v_customer_id uuid;
  v_review public.product_reviews%rowtype;
  v_ticket private.product_review_upload_tickets_v150%rowtype;
  v_ext text;
  v_max_images smallint;
begin
  v_customer_id :=
    private.require_customer_review_session(p_session_token);

  if p_mime_type not in (
    'image/jpeg',
    'image/png',
    'image/webp'
  ) then
    raise exception 'IMAGE_TYPE_NOT_ALLOWED';
  end if;

  if coalesce(p_byte_size, 0) not between 12 and 51200 then
    raise exception 'IMAGE_SIZE_NOT_ALLOWED';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(p_review_id::text, 150)
  );

  select *
  into v_review
  from public.product_reviews
  where id = p_review_id
    and customer_id = v_customer_id
  for update;

  if v_review.id is null then
    raise exception 'REVIEW_NOT_FOUND';
  end if;

  if v_review.moderation_status not in ('pending','rejected') then
    raise exception 'REVIEW_IMAGES_LOCKED';
  end if;

  -- Reuse an unused, matching capability after a failed preflight/upload.
  select * into v_ticket from private.product_review_upload_tickets_v150 t
  where t.review_id=p_review_id and t.customer_id=v_customer_id and t.used_at is null
    and t.expires_at>now() and t.mime_type=p_mime_type and t.byte_size=p_byte_size
    and not exists(select 1 from storage.objects o where o.bucket_id='product-review-images' and o.name=t.storage_path)
  order by t.created_at desc limit 1;
  if v_ticket.id is not null then
    return jsonb_build_object('ok',true,'ticket_id',v_ticket.id,'bucket','product-review-images',
      'storage_path',v_ticket.storage_path,'expires_at',v_ticket.expires_at);
  end if;

  select coalesce(max_images, 1)
  into v_max_images
  from private.product_review_media_policy_v149
  where singleton;

  if (
    select count(*)
    from public.product_review_images
    where review_id = p_review_id
  ) + (
    select count(*)
    from private.product_review_upload_tickets_v150
    where review_id = p_review_id
      and used_at is null
      and expires_at > now()
  ) >= v_max_images then
    raise exception 'REVIEW_IMAGE_LIMIT_REACHED';
  end if;

  delete from private.product_review_upload_tickets_v150
  where expires_at <= now();

  v_ext :=
    case p_mime_type
      when 'image/webp' then 'webp'
      when 'image/png' then 'png'
      else 'jpg'
    end;

  insert into private.product_review_upload_tickets_v150 (
    review_id,
    customer_id,
    storage_path,
    mime_type,
    byte_size
  )
  values (
    p_review_id,
    v_customer_id,
    'reviews/'
      || p_review_id::text
      || '/'
      || gen_random_uuid()::text
      || '.'
      || v_ext,
    p_mime_type,
    p_byte_size
  )
  returning *
  into v_ticket;

  return jsonb_build_object(
    'ok', true,
    'ticket_id', v_ticket.id,
    'bucket', 'product-review-images',
    'storage_path', v_ticket.storage_path,
    'expires_at', v_ticket.expires_at
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.customer_finalize_review_image_upload_v150(p_session_token text, p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'extensions', 'storage', 'pg_temp'
AS $function$
declare
  v_customer_id uuid;
  v_ticket private.product_review_upload_tickets_v150%rowtype;
  v_image_id uuid := gen_random_uuid();
  v_sort smallint;
begin
  v_customer_id :=
    private.require_customer_review_session(p_session_token);

  select *
  into v_ticket
  from private.product_review_upload_tickets_v150
  where id = p_ticket_id
    and customer_id = v_customer_id
    and used_at is null
    and expires_at > now()
  for update;

  if v_ticket.id is null then
    raise exception 'REVIEW_UPLOAD_TICKET_INVALID';
  end if;

  if not exists (
    select 1
    from storage.objects o
    where o.bucket_id = 'product-review-images'
      and o.name = v_ticket.storage_path
      and lower(coalesce(o.metadata ->> 'mimetype', ''))
          = v_ticket.mime_type
      and coalesce((o.metadata ->> 'size')::integer, 0)
          = v_ticket.byte_size
  ) then
    raise exception 'REVIEW_STORAGE_OBJECT_NOT_FOUND';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(v_ticket.review_id::text, 150)
  );

  -- Serialize with moderation and refuse attaching an unreviewed image after publication.
  perform 1 from public.product_reviews r where r.id=v_ticket.review_id
    and r.customer_id=v_customer_id and r.moderation_status in ('pending','rejected') for update;
  if not found then raise exception 'REVIEW_IMAGES_LOCKED'; end if;

  select slot::smallint
  into v_sort
  from generate_series(0, 4) slot
  where not exists (
    select 1
    from public.product_review_images i
    where i.review_id = v_ticket.review_id
      and i.sort_order = slot
  )
  order by slot
  limit 1;

  if v_sort is null then
    raise exception 'REVIEW_IMAGE_LIMIT_REACHED';
  end if;

  insert into public.product_review_images (
    id,
    review_id,
    storage_path,
    mime_type,
    byte_size,
    sort_order,
    moderation_status
  )
  values (
    v_image_id,
    v_ticket.review_id,
    v_ticket.storage_path,
    v_ticket.mime_type,
    v_ticket.byte_size,
    v_sort,
    'pending'
  );

  update private.product_review_upload_tickets_v150
  set used_at = now()
  where id = v_ticket.id;

  return jsonb_build_object(
    'ok', true,
    'id', v_image_id,
    'storage_path', v_ticket.storage_path,
    'byte_size', v_ticket.byte_size,
    'sort_order', v_sort,
    'status', 'pending'
  );
end;
$function$;

UPDATE private.kinto_review_upload_backup_v1 SET after_definition=pg_get_functiondef(signature::regprocedure);
COMMIT;
SELECT 'review image upload v1 installed' result;

