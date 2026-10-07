-- KINTO V150: secure browser-to-Storage review images without Edge Functions.
-- Additive/compatible: legacy database:// images keep working; new images use Storage.

begin;

update storage.buckets
set public = true,
    file_size_limit = 51200,
    allowed_mime_types = array['image/jpeg','image/png','image/webp']
where id = 'product-review-images';

alter table private.product_review_media_policy_v149
  drop constraint if exists product_review_media_policy_v149_target_dimension_check;
alter table private.product_review_media_policy_v149
  add constraint product_review_media_policy_v149_target_dimension_check
  check (target_dimension between 240 and 2560);
update private.product_review_media_policy_v149
set max_images = 1, max_image_bytes = 51200, target_dimension = 320, updated_at = now()
where singleton;

create table if not exists private.product_review_upload_tickets_v150 (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  byte_size integer not null check (byte_size between 12 and 51200),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists private.product_review_storage_deletions_v150 (
  storage_path text primary key,
  expires_at timestamptz not null default (now() + interval '1 day'),
  created_at timestamptz not null default now()
);

revoke all on private.product_review_upload_tickets_v150 from public, anon, authenticated;
revoke all on private.product_review_storage_deletions_v150 from public, anon, authenticated;

create or replace function private.review_storage_upload_allowed_v150(
  p_bucket text, p_name text, p_metadata jsonb
)
returns boolean
language sql
security definer
stable
set search_path = public, private, storage, pg_temp
as $$
  select p_bucket = 'product-review-images'
    and exists (
      select 1 from private.product_review_upload_tickets_v150 t
      where t.storage_path = p_name
        and t.used_at is null
        and t.expires_at > now()
        and t.mime_type = lower(coalesce(p_metadata ->> 'mimetype',''))
        and coalesce((p_metadata ->> 'size')::integer,0) = t.byte_size
        and t.byte_size <= 51200
    );
$$;

create or replace function private.review_storage_delete_allowed_v150(
  p_bucket text, p_name text
)
returns boolean
language sql
security definer
stable
set search_path = public, private, storage, pg_temp
as $$
  select p_bucket = 'product-review-images' and (
    exists (
      select 1 from private.product_review_upload_tickets_v150 t
      where t.storage_path = p_name and t.used_at is null and t.expires_at > now()
    )
    or exists (
      select 1 from private.product_review_storage_deletions_v150 d
      where d.storage_path = p_name and d.expires_at > now()
    )
  );
$$;

revoke all on function private.review_storage_upload_allowed_v150(text,text,jsonb) from public;
grant execute on function private.review_storage_upload_allowed_v150(text,text,jsonb) to anon, authenticated;
revoke all on function private.review_storage_delete_allowed_v150(text,text) from public;
grant execute on function private.review_storage_delete_allowed_v150(text,text) to anon, authenticated;

drop policy if exists "review image ticket upload v150" on storage.objects;
create policy "review image ticket upload v150"
on storage.objects for insert to anon, authenticated
with check (private.review_storage_upload_allowed_v150(bucket_id, name, metadata));

drop policy if exists "review image ticket cleanup v150" on storage.objects;
create policy "review image ticket cleanup v150"
on storage.objects for delete to anon, authenticated
using (private.review_storage_delete_allowed_v150(bucket_id, name));

create or replace function public.customer_create_review_image_upload_v150(
  p_session_token text, p_review_id uuid, p_mime_type text, p_byte_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, storage, pg_temp
as $$
declare
  v_customer_id uuid;
  v_review public.product_reviews%rowtype;
  v_ticket private.product_review_upload_tickets_v150%rowtype;
  v_ext text;
  v_max_images smallint;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);
  if p_mime_type not in ('image/jpeg','image/png','image/webp') then raise exception 'IMAGE_TYPE_NOT_ALLOWED'; end if;
  if coalesce(p_byte_size,0) not between 12 and 51200 then raise exception 'IMAGE_SIZE_NOT_ALLOWED'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_review_id::text,150));
  select * into v_review from public.product_reviews
  where id=p_review_id and customer_id=v_customer_id for update;
  if v_review.id is null then raise exception 'REVIEW_NOT_FOUND'; end if;
  if v_review.moderation_status not in ('pending','rejected') then raise exception 'REVIEW_IMAGES_LOCKED'; end if;
  select coalesce(max_images,1) into v_max_images
  from private.product_review_media_policy_v149 where singleton;
  if (select count(*) from public.product_review_images where review_id=p_review_id)
     + (select count(*) from private.product_review_upload_tickets_v150 where review_id=p_review_id and used_at is null and expires_at>now())
     >= v_max_images then raise exception 'REVIEW_IMAGE_LIMIT_REACHED'; end if;
  delete from private.product_review_upload_tickets_v150 where expires_at<=now();
  v_ext := case p_mime_type when 'image/webp' then 'webp' when 'image/png' then 'png' else 'jpg' end;
  insert into private.product_review_upload_tickets_v150(
    review_id,customer_id,storage_path,mime_type,byte_size
  ) values (
    p_review_id,v_customer_id,
    'reviews/'||p_review_id::text||'/'||gen_random_uuid()::text||'.'||v_ext,
    p_mime_type,p_byte_size
  ) returning * into v_ticket;
  return jsonb_build_object('ok',true,'ticket_id',v_ticket.id,'bucket','product-review-images',
    'storage_path',v_ticket.storage_path,'expires_at',v_ticket.expires_at);
end;
$$;

create or replace function public.customer_finalize_review_image_upload_v150(
  p_session_token text, p_ticket_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, storage, pg_temp
as $$
declare
  v_customer_id uuid;
  v_ticket private.product_review_upload_tickets_v150%rowtype;
  v_image_id uuid := gen_random_uuid();
  v_sort smallint;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);
  select * into v_ticket from private.product_review_upload_tickets_v150
  where id=p_ticket_id and customer_id=v_customer_id and used_at is null and expires_at>now() for update;
  if v_ticket.id is null then raise exception 'REVIEW_UPLOAD_TICKET_INVALID'; end if;
  if not exists (
    select 1 from storage.objects o where o.bucket_id='product-review-images'
      and o.name=v_ticket.storage_path
      and lower(coalesce(o.metadata->>'mimetype',''))=v_ticket.mime_type
      and coalesce((o.metadata->>'size')::integer,0)=v_ticket.byte_size
  ) then raise exception 'REVIEW_STORAGE_OBJECT_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_ticket.review_id::text,150));
  select slot::smallint into v_sort from generate_series(0,4) slot
  where not exists(select 1 from public.product_review_images i where i.review_id=v_ticket.review_id and i.sort_order=slot)
  order by slot limit 1;
  if v_sort is null then raise exception 'REVIEW_IMAGE_LIMIT_REACHED'; end if;
  insert into public.product_review_images(id,review_id,storage_path,mime_type,byte_size,sort_order,moderation_status)
  values(v_image_id,v_ticket.review_id,v_ticket.storage_path,v_ticket.mime_type,v_ticket.byte_size,v_sort,'pending');
  update private.product_review_upload_tickets_v150 set used_at=now() where id=v_ticket.id;
  return jsonb_build_object('ok',true,'id',v_image_id,'storage_path',v_ticket.storage_path,
    'byte_size',v_ticket.byte_size,'sort_order',v_sort,'status','pending');
end;
$$;

revoke all on function public.customer_create_review_image_upload_v150(text,uuid,text,integer) from public;
grant execute on function public.customer_create_review_image_upload_v150(text,uuid,text,integer) to anon, authenticated;
revoke all on function public.customer_finalize_review_image_upload_v150(text,uuid) from public;
grant execute on function public.customer_finalize_review_image_upload_v150(text,uuid) to anon, authenticated;

create or replace function public.admin_get_review_image_v139(p_admin_id uuid,p_image_id uuid)
returns jsonb language plpgsql security definer stable
set search_path=public,private,extensions,pg_temp as $$
declare v_result jsonb;
begin
  perform private.require_product_review_admin_v138(p_admin_id);
  select jsonb_build_object('id',i.id,'mime_type',i.mime_type,'storage_path',
    case when i.storage_path like 'database://%' then null else i.storage_path end,
    'bucket','product-review-images','base64',
    case when p.image_bytes is null then null else encode(p.image_bytes,'base64') end,
    'status',i.moderation_status)
  into v_result from public.product_review_images i
  left join public.product_review_image_payloads p on p.image_id=i.id where i.id=p_image_id;
  if v_result is null then raise exception 'REVIEW_IMAGE_NOT_FOUND'; end if;
  return v_result;
end;$$;

create or replace function public.product_reviews_public_v141(
  p_product_id uuid,p_visitor_token text default null,p_limit integer default 8,p_offset integer default 0
) returns jsonb language plpgsql security definer stable
set search_path=public,extensions,pg_temp as $$
declare
  v_limit integer:=least(greatest(coalesce(p_limit,8),1),20);
  v_offset integer:=greatest(coalesce(p_offset,0),0);
  v_hash bytea:=case when char_length(coalesce(p_visitor_token,'')) between 20 and 200 then digest(p_visitor_token,'sha256') end;
  v_count bigint;v_average numeric;v_items jsonb;
begin
  select count(*),round(avg(r.rating)::numeric,1) into v_count,v_average
  from public.product_reviews r where r.product_id=p_product_id and r.moderation_status='published';
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into v_items from(
    select r.id,case when nullif(trim(coalesce(c.name,'')),'') is null then 'عميل KINTO' else left(trim(c.name),1)||'***' end customer_name,
      r.rating,r.comment,r.verified_purchase,r.created_at,
      (select count(*)::integer from public.product_review_helpful_votes h where h.review_id=r.id) helpful_count,
      exists(select 1 from public.product_review_helpful_votes h where h.review_id=r.id and h.visitor_hash=v_hash) liked,
      coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'mime_type',i.mime_type,
        'storage_path',case when i.storage_path like 'database://%' then null else i.storage_path end,
        'data_url',case when p.image_bytes is null then null else 'data:'||i.mime_type||';base64,'||encode(p.image_bytes,'base64') end,
        'sort_order',i.sort_order) order by i.sort_order)
        from public.product_review_images i left join public.product_review_image_payloads p on p.image_id=i.id
        where i.review_id=r.id and i.moderation_status='published'),'[]'::jsonb) images
    from public.product_reviews r left join public.customers c on c.id=r.customer_id
    where r.product_id=p_product_id and r.moderation_status='published'
    order by r.created_at desc limit v_limit offset v_offset
  )q;
  return jsonb_build_object('product_id',p_product_id,'count',coalesce(v_count,0),'average_rating',coalesce(v_average,0),'items',v_items,'limit',v_limit,'offset',v_offset);
end;$$;

create or replace function public.admin_moderate_product_review_v138(
  p_admin_id uuid,p_review_id uuid,p_decision text,p_note text default null
) returns jsonb language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare
  v_admin_id uuid;v_decision text:=lower(trim(coalesce(p_decision,'')));
  v_review public.product_reviews%rowtype;v_deleted integer:=0;v_paths text[];
begin
  v_admin_id:=private.require_product_review_admin_v138(p_admin_id);
  if v_decision not in('published','rejected','hidden') then raise exception 'INVALID_REVIEW_DECISION';end if;
  if char_length(coalesce(p_note,''))>1000 then raise exception 'MODERATION_NOTE_TOO_LONG';end if;
  update public.product_reviews set moderation_status=v_decision,moderation_note=nullif(trim(coalesce(p_note,'')),''),
    moderated_at=now(),moderated_by=v_admin_id,updated_at=now() where id=p_review_id returning * into v_review;
  if v_review.id is null then raise exception 'REVIEW_NOT_FOUND';end if;
  if v_decision='rejected' then
    select coalesce(array_agg(storage_path) filter(where storage_path not like 'database://%'),array[]::text[])
      into v_paths from public.product_review_images where review_id=p_review_id;
    insert into private.product_review_storage_deletions_v150(storage_path)
      select unnest(v_paths) on conflict(storage_path) do update set expires_at=now()+interval '1 day';
    delete from public.product_review_images where review_id=p_review_id;
    get diagnostics v_deleted=row_count;
  else
    update public.product_review_images set moderation_status=v_decision,moderated_at=now(),moderated_by=v_admin_id where review_id=p_review_id;
  end if;
  return jsonb_build_object('id',v_review.id,'status',v_review.moderation_status,'moderated_at',v_review.moderated_at,
    'deleted_images',v_deleted,'deleted_storage_paths',coalesce(to_jsonb(v_paths),'[]'::jsonb),'bucket','product-review-images');
end;$$;

commit;
