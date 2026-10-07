-- KINTO V138: isolated admin moderation RPCs for product reviews.
-- No orders, tracking, employee, or invoice rows are changed.

begin;

create or replace function private.require_product_review_admin_v138(p_admin_id uuid)
returns uuid
language plpgsql
security definer
stable
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_admin jsonb;
begin
  select to_jsonb(e) into v_admin from public.employees e where e.id = p_admin_id limit 1;
  if v_admin is null
     or lower(trim(coalesce(v_admin ->> 'role', ''))) not in ('admin','أدمن','ادمن')
     or coalesce((v_admin ->> 'is_active')::boolean, true) is false
     or coalesce((v_admin ->> 'disabled')::boolean, false) is true then
    raise exception 'ADMIN_REVIEW_ACCESS_DENIED';
  end if;
  return p_admin_id;
end;
$$;

revoke all on function private.require_product_review_admin_v138(uuid) from public, anon, authenticated;

create or replace function public.admin_list_product_reviews_v138(
  p_admin_id uuid,
  p_status text default 'pending',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_status text := lower(trim(coalesce(p_status, 'pending')));
  v_page integer := greatest(1, coalesce(p_page, 1));
  v_size integer := least(50, greatest(1, coalesce(p_page_size, 20)));
  v_total bigint;
  v_items jsonb;
begin
  perform private.require_product_review_admin_v138(p_admin_id);
  if v_status not in ('pending','published','rejected','hidden','all') then
    raise exception 'INVALID_REVIEW_STATUS';
  end if;

  select count(*) into v_total
  from public.product_reviews r
  where v_status = 'all' or r.moderation_status = v_status;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select r.id, r.customer_id, r.order_id, r.store_id, r.product_id,
      r.product_name_snapshot as product_name, r.product_image_snapshot as product_image,
      r.rating, r.comment, r.verified_purchase, r.moderation_status,
      r.moderation_note, r.created_at, r.moderated_at,
      coalesce(c.name, c.code, r.customer_id::text) as customer_name,
      coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'storage_path', i.storage_path, 'mime_type', i.mime_type,
        'status', i.moderation_status, 'sort_order', i.sort_order
      ) order by i.sort_order) from public.product_review_images i where i.review_id = r.id), '[]'::jsonb) as images
    from public.product_reviews r
    left join public.customers c on c.id = r.customer_id
    where v_status = 'all' or r.moderation_status = v_status
    order by r.created_at desc
    limit v_size offset ((v_page - 1) * v_size)
  ) q;

  return jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page, 'page_size', v_size);
end;
$$;

revoke all on function public.admin_list_product_reviews_v138(uuid,text,integer,integer) from public;
grant execute on function public.admin_list_product_reviews_v138(uuid,text,integer,integer) to anon, authenticated;

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
begin
  v_admin_id := private.require_product_review_admin_v138(p_admin_id);
  if v_decision not in ('published','rejected','hidden') then raise exception 'INVALID_REVIEW_DECISION'; end if;
  if char_length(coalesce(p_note, '')) > 1000 then raise exception 'MODERATION_NOTE_TOO_LONG'; end if;

  update public.product_reviews
  set moderation_status = v_decision,
      moderation_note = nullif(trim(coalesce(p_note, '')), ''),
      moderated_at = now(), moderated_by = v_admin_id, updated_at = now()
  where id = p_review_id
  returning * into v_review;
  if v_review.id is null then raise exception 'REVIEW_NOT_FOUND'; end if;

  update public.product_review_images
  set moderation_status = v_decision, moderated_at = now(), moderated_by = v_admin_id
  where review_id = p_review_id;

  return jsonb_build_object('id', v_review.id, 'status', v_review.moderation_status, 'moderated_at', v_review.moderated_at);
end;
$$;

revoke all on function public.admin_moderate_product_review_v138(uuid,uuid,text,text) from public;
grant execute on function public.admin_moderate_product_review_v138(uuid,uuid,text,text) to anon, authenticated;

commit;
