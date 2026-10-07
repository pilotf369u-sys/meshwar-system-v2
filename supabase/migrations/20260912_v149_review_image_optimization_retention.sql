-- KINTO V149: one automatically-compressed review image and rejected-image cleanup.
-- Additive policy layer. Future image-count increases require changing policy only.

begin;

create table if not exists private.product_review_media_policy_v149 (
  singleton boolean primary key default true check (singleton),
  max_images smallint not null default 1 check (max_images between 1 and 5),
  max_image_bytes integer not null default 350000 check (max_image_bytes between 50000 and 5242880),
  target_dimension integer not null default 1280 check (target_dimension between 480 and 2560),
  updated_at timestamptz not null default now()
);

insert into private.product_review_media_policy_v149(singleton, max_images, max_image_bytes, target_dimension)
values (true, 1, 350000, 1280)
on conflict (singleton) do update
set max_images = excluded.max_images,
    max_image_bytes = excluded.max_image_bytes,
    target_dimension = excluded.target_dimension,
    updated_at = now();

revoke all on private.product_review_media_policy_v149 from public, anon, authenticated;

create or replace function public.customer_upload_review_image_v139(
  p_session_token text,
  p_review_id uuid,
  p_mime_type text,
  p_base64 text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_customer_id uuid;
  v_review public.product_reviews%rowtype;
  v_bytes bytea;
  v_image_id uuid := gen_random_uuid();
  v_sort_order smallint;
  v_max_images smallint;
  v_max_bytes integer;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);
  select max_images, max_image_bytes into v_max_images, v_max_bytes
  from private.product_review_media_policy_v149 where singleton;
  v_max_images := coalesce(v_max_images, 1);
  v_max_bytes := coalesce(v_max_bytes, 350000);

  if p_mime_type not in ('image/jpeg','image/png','image/webp') then raise exception 'IMAGE_TYPE_NOT_ALLOWED'; end if;
  if p_base64 is null or length(p_base64) > ceil(v_max_bytes * 1.38) then raise exception 'IMAGE_SIZE_NOT_ALLOWED'; end if;
  begin v_bytes := decode(p_base64, 'base64'); exception when others then raise exception 'IMAGE_BASE64_INVALID'; end;
  if octet_length(v_bytes) < 12 or octet_length(v_bytes) > v_max_bytes then raise exception 'IMAGE_SIZE_NOT_ALLOWED'; end if;
  if not (
    (p_mime_type = 'image/jpeg' and substring(v_bytes from 1 for 3) = decode('ffd8ff','hex')) or
    (p_mime_type = 'image/png' and substring(v_bytes from 1 for 8) = decode('89504e470d0a1a0a','hex')) or
    (p_mime_type = 'image/webp' and substring(v_bytes from 1 for 4) = convert_to('RIFF','UTF8') and substring(v_bytes from 9 for 4) = convert_to('WEBP','UTF8'))
  ) then raise exception 'IMAGE_SIGNATURE_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_review_id::text, 149));
  select * into v_review from public.product_reviews
  where id = p_review_id and customer_id = v_customer_id for update;
  if v_review.id is null then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_review.moderation_status not in ('pending','rejected') then raise exception 'REVIEW_IMAGES_LOCKED'; end if;
  if (select count(*) from public.product_review_images where review_id = p_review_id) >= v_max_images then
    raise exception 'REVIEW_IMAGE_LIMIT_REACHED';
  end if;

  select slot::smallint into v_sort_order from generate_series(0, v_max_images - 1) slot
  where not exists (select 1 from public.product_review_images i where i.review_id = p_review_id and i.sort_order = slot)
  order by slot limit 1;
  if v_sort_order is null then raise exception 'REVIEW_IMAGE_LIMIT_REACHED'; end if;

  insert into public.product_review_images(id, review_id, storage_path, mime_type, byte_size, sort_order, moderation_status)
  values (v_image_id, p_review_id, 'database://' || p_review_id::text || '/' || v_image_id::text,
    p_mime_type, octet_length(v_bytes), v_sort_order, 'pending');
  insert into public.product_review_image_payloads(image_id, image_bytes, content_sha256)
  values (v_image_id, v_bytes, digest(v_bytes, 'sha256'));
  return jsonb_build_object('ok', true, 'id', v_image_id, 'sort_order', v_sort_order,
    'status', 'pending', 'byte_size', octet_length(v_bytes), 'max_images', v_max_images);
end;
$$;

create or replace function public.admin_moderate_product_review_v138(
  p_admin_id uuid,
  p_review_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_admin_id uuid;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_review public.product_reviews%rowtype;
  v_deleted_images integer := 0;
begin
  v_admin_id := private.require_product_review_admin_v138(p_admin_id);
  if v_decision not in ('published','rejected','hidden') then raise exception 'INVALID_REVIEW_DECISION'; end if;
  if char_length(coalesce(p_note, '')) > 1000 then raise exception 'MODERATION_NOTE_TOO_LONG'; end if;
  update public.product_reviews
  set moderation_status = v_decision, moderation_note = nullif(trim(coalesce(p_note, '')), ''),
      moderated_at = now(), moderated_by = v_admin_id, updated_at = now()
  where id = p_review_id returning * into v_review;
  if v_review.id is null then raise exception 'REVIEW_NOT_FOUND'; end if;

  if v_decision = 'rejected' then
    delete from public.product_review_images where review_id = p_review_id;
    get diagnostics v_deleted_images = row_count;
  else
    update public.product_review_images
    set moderation_status = v_decision, moderated_at = now(), moderated_by = v_admin_id
    where review_id = p_review_id;
  end if;
  return jsonb_build_object('id', v_review.id, 'status', v_review.moderation_status,
    'moderated_at', v_review.moderated_at, 'deleted_images', v_deleted_images);
end;
$$;

-- Reclaim database space from images attached to reviews already rejected.
delete from public.product_review_images i
using public.product_reviews r
where i.review_id = r.id and r.moderation_status = 'rejected';

revoke all on function public.customer_upload_review_image_v139(text,uuid,text,text) from public;
grant execute on function public.customer_upload_review_image_v139(text,uuid,text,text) to anon, authenticated;
revoke all on function public.admin_moderate_product_review_v138(uuid,uuid,text,text) from public;
grant execute on function public.admin_moderate_product_review_v138(uuid,uuid,text,text) to anon, authenticated;

commit;
