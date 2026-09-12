-- KINTO V139: secure review-image upload through RPC; no Edge Function required.
-- Additive-only and isolated from orders, tracking, employees, and invoices.

begin;

create table if not exists public.product_review_image_payloads (
  image_id uuid primary key references public.product_review_images(id) on update cascade on delete cascade,
  image_bytes bytea not null,
  content_sha256 bytea not null,
  created_at timestamptz not null default now(),
  constraint product_review_image_payloads_size check (octet_length(image_bytes) between 1 and 5242880)
);

alter table public.product_review_image_payloads enable row level security;
revoke all on public.product_review_image_payloads from public, anon, authenticated;

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
begin
  v_customer_id := private.require_customer_review_session(p_session_token);
  if p_mime_type not in ('image/jpeg','image/png','image/webp') then raise exception 'IMAGE_TYPE_NOT_ALLOWED'; end if;
  if p_base64 is null or length(p_base64) > 7000000 then raise exception 'IMAGE_SIZE_NOT_ALLOWED'; end if;

  begin
    v_bytes := decode(p_base64, 'base64');
  exception when others then
    raise exception 'IMAGE_BASE64_INVALID';
  end;
  if octet_length(v_bytes) < 12 or octet_length(v_bytes) > 5242880 then raise exception 'IMAGE_SIZE_NOT_ALLOWED'; end if;
  if not (
    (p_mime_type = 'image/jpeg' and substring(v_bytes from 1 for 3) = decode('ffd8ff','hex')) or
    (p_mime_type = 'image/png' and substring(v_bytes from 1 for 8) = decode('89504e470d0a1a0a','hex')) or
    (p_mime_type = 'image/webp' and substring(v_bytes from 1 for 4) = convert_to('RIFF','UTF8') and substring(v_bytes from 9 for 4) = convert_to('WEBP','UTF8'))
  ) then raise exception 'IMAGE_SIGNATURE_INVALID'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_review_id::text, 139));
  select * into v_review from public.product_reviews
  where id = p_review_id and customer_id = v_customer_id for update;
  if v_review.id is null then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_review.moderation_status not in ('pending','rejected') then raise exception 'REVIEW_IMAGES_LOCKED'; end if;

  select slot::smallint into v_sort_order
  from generate_series(0,4) slot
  where not exists (
    select 1 from public.product_review_images i
    where i.review_id = p_review_id and i.sort_order = slot
  ) order by slot limit 1;
  if v_sort_order is null then raise exception 'REVIEW_IMAGE_LIMIT_REACHED'; end if;

  insert into public.product_review_images(
    id, review_id, storage_path, mime_type, byte_size, sort_order, moderation_status
  ) values (
    v_image_id, p_review_id, 'database://' || p_review_id::text || '/' || v_image_id::text,
    p_mime_type, octet_length(v_bytes), v_sort_order, 'pending'
  );
  insert into public.product_review_image_payloads(image_id, image_bytes, content_sha256)
  values (v_image_id, v_bytes, digest(v_bytes, 'sha256'));

  return jsonb_build_object('ok', true, 'id', v_image_id, 'sort_order', v_sort_order, 'status', 'pending');
end;
$$;

revoke all on function public.customer_upload_review_image_v139(text,uuid,text,text) from public;
grant execute on function public.customer_upload_review_image_v139(text,uuid,text,text) to anon, authenticated;

create or replace function public.admin_get_review_image_v139(p_admin_id uuid, p_image_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, private, extensions, pg_temp
as $$
declare v_result jsonb;
begin
  perform private.require_product_review_admin_v138(p_admin_id);
  select jsonb_build_object(
    'id', i.id, 'mime_type', i.mime_type,
    'base64', encode(p.image_bytes, 'base64'), 'status', i.moderation_status
  ) into v_result
  from public.product_review_images i
  join public.product_review_image_payloads p on p.image_id = i.id
  where i.id = p_image_id;
  if v_result is null then raise exception 'REVIEW_IMAGE_NOT_FOUND'; end if;
  return v_result;
end;
$$;

revoke all on function public.admin_get_review_image_v139(uuid,uuid) from public;
grant execute on function public.admin_get_review_image_v139(uuid,uuid) to anon, authenticated;

commit;
