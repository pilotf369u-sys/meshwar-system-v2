-- KINTO V151: submit verified reviews from immutable order snapshots.
-- Fixes discontinued/deleted catalog products; rating and comment are required.
-- Reads orders/segments only. Does not mutate orders, products, invoices or shipping.

begin;

create or replace function public.customer_submit_product_review_v132(
  p_session_token text,
  p_order_id uuid,
  p_product_id uuid,
  p_rating smallint,
  p_comment text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_customer_id uuid;
  v_verified jsonb;
  v_item jsonb;
  v_product public.local_products%rowtype;
  v_review public.product_reviews%rowtype;
  v_reference text;
  v_segment_id uuid;
  v_store_id uuid;
  v_snapshot_store text;
  v_comment text := trim(coalesce(p_comment, ''));
begin
  v_customer_id := private.require_customer_review_session(p_session_token);

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_REVIEW_RATING';
  end if;
  if v_comment = '' then
    raise exception 'REVIEW_COMMENT_REQUIRED';
  end if;
  if char_length(v_comment) > 2000 then
    raise exception 'REVIEW_COMMENT_TOO_LONG';
  end if;

  -- The delivered-order snapshot is the source of truth for review eligibility.
  v_verified := private.review_delivered_product(
    p_order_id,
    v_customer_id,
    p_product_id
  );
  v_item := v_verified -> 'item';
  v_reference := coalesce(
    nullif(v_item ->> 'product_reference', ''),
    p_product_id::text
  );

  begin
    v_segment_id := nullif(v_verified ->> 'segment_id', '')::uuid;
  exception when invalid_text_representation then
    v_segment_id := null;
  end;

  -- Keep the live product when present, but do not reject a verified historical
  -- purchase merely because its catalog row was removed or replaced.
  select p.*
  into v_product
  from public.local_products p
  where p.id = p_product_id
  limit 1;

  if v_product.id is not null then
    v_store_id := v_product.store_id;
  end if;

  if v_store_id is null and v_segment_id is not null then
    select s.store_id
    into v_store_id
    from public.order_store_segments s
    where s.id = v_segment_id
      and s.order_id = p_order_id
    limit 1;
  end if;

  if v_store_id is null then
    v_snapshot_store := nullif(v_item ->> 'store_id', '');
    if v_snapshot_store ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      select s.id
      into v_store_id
      from public.local_stores s
      where s.id = v_snapshot_store::uuid
      limit 1;
    end if;
  end if;

  if v_store_id is null then
    raise exception 'REVIEW_STORE_NOT_FOUND';
  end if;

  insert into public.product_reviews(
    customer_id,
    order_id,
    order_store_segment_id,
    store_id,
    product_id,
    product_reference,
    product_name_snapshot,
    product_image_snapshot,
    rating,
    comment,
    verified_purchase,
    moderation_status
  )
  values (
    v_customer_id,
    p_order_id,
    v_segment_id,
    v_store_id,
    v_product.id,
    v_reference,
    coalesce(
      nullif(v_item ->> 'product_name', ''),
      v_product.product_name,
      'المنتج'
    ),
    coalesce(
      nullif(v_item ->> 'product_image', ''),
      v_product.image_url
    ),
    p_rating,
    v_comment,
    true,
    'pending'
  )
  on conflict (customer_id, order_id, product_reference)
  do update set
    rating = excluded.rating,
    comment = excluded.comment,
    product_name_snapshot = excluded.product_name_snapshot,
    product_image_snapshot = excluded.product_image_snapshot,
    moderation_status = 'pending',
    moderation_note = null,
    moderated_at = null,
    moderated_by = null,
    updated_at = now()
  returning *
  into v_review;

  return jsonb_build_object(
    'id', v_review.id,
    'rating', v_review.rating,
    'status', v_review.moderation_status,
    'verified_purchase', v_review.verified_purchase,
    'updated_at', v_review.updated_at
  );
end;
$$;

revoke all
on function public.customer_submit_product_review_v132(
  text, uuid, uuid, smallint, text
)
from public;

grant execute
on function public.customer_submit_product_review_v132(
  text, uuid, uuid, smallint, text
)
to anon, authenticated;

commit;
