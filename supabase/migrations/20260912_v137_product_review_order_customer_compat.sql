-- KINTO V137: review eligibility compatibility for legacy orders.customer_id text.
-- Only the isolated review functions are replaced. No order row or table is changed.

begin;

create or replace function private.review_delivered_product(
  p_order_id uuid,
  p_customer_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_order jsonb;
  v_details jsonb;
  v_item jsonb;
  v_segment_id uuid;
begin
  select to_jsonb(o) into v_order
  from public.orders o
  where o.id = p_order_id
    and trim(o.customer_id::text) = p_customer_id::text
    and trim(coalesce(o.status, '')) = 'تم التسليم'
  limit 1;

  if v_order is null then
    raise exception 'DELIVERED_ORDER_NOT_FOUND';
  end if;

  v_details := private.review_jsonb_object(v_order -> 'details');

  if coalesce(v_details ->> 'product_id', '') = p_product_id::text then
    v_item := jsonb_build_object(
      'product_id', p_product_id::text,
      'product_name', coalesce(nullif(v_details ->> 'product_name', ''), 'المنتج'),
      'product_image', coalesce(nullif(v_details ->> 'product_image', ''), v_order ->> 'image_url'),
      'store_id', v_details ->> 'store_id',
      'product_reference', p_product_id::text
    );
  else
    select x.item into v_item
    from jsonb_array_elements(
      case when jsonb_typeof(v_details -> 'items') = 'array'
        then v_details -> 'items' else '[]'::jsonb end
    ) as x(item)
    where coalesce(x.item ->> 'product_id', '') = p_product_id::text
    limit 1;
  end if;

  if v_item is null then
    select x.item, s.id into v_item, v_segment_id
    from public.order_store_segments s
    cross join lateral jsonb_array_elements(coalesce(s.items_snapshot, '[]'::jsonb)) as x(item)
    where s.order_id = p_order_id
      and coalesce(x.item ->> 'product_id', '') = p_product_id::text
    limit 1;
  end if;

  if v_item is null then
    raise exception 'PRODUCT_NOT_FOUND_IN_DELIVERED_ORDER';
  end if;

  return jsonb_build_object('item', v_item, 'segment_id', v_segment_id);
end;
$$;

revoke all on function private.review_delivered_product(uuid, uuid, uuid)
  from public, anon, authenticated;

create or replace function public.customer_review_ready_products_v132(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_customer_id uuid;
  v_items jsonb;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);

  with delivered_orders as (
    select o.id as order_id, o.created_at, to_jsonb(o) as order_json,
      private.review_jsonb_object(to_jsonb(o) -> 'details') as details
    from public.orders o
    where trim(o.customer_id::text) = v_customer_id::text
      and trim(coalesce(o.status, '')) = 'تم التسليم'
  ), extracted as (
    select d.order_id, d.created_at,
      d.details ->> 'store_id' as store_id,
      d.details ->> 'product_id' as product_id,
      coalesce(nullif(d.details ->> 'product_name', ''), 'المنتج') as product_name,
      coalesce(nullif(d.details ->> 'product_image', ''), d.order_json ->> 'image_url') as product_image
    from delivered_orders d
    where coalesce(d.details ->> 'product_id', '') <> ''
    union all
    select d.order_id, d.created_at,
      x.item ->> 'store_id', x.item ->> 'product_id',
      coalesce(nullif(x.item ->> 'product_name', ''), 'المنتج'),
      x.item ->> 'product_image'
    from delivered_orders d
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(d.details -> 'items') = 'array'
        then d.details -> 'items' else '[]'::jsonb end
    ) x(item)
    where coalesce(x.item ->> 'product_id', '') <> ''
    union all
    select d.order_id, d.created_at, s.store_id::text,
      x.item ->> 'product_id',
      coalesce(nullif(x.item ->> 'product_name', ''), 'المنتج'),
      x.item ->> 'product_image'
    from delivered_orders d
    join public.order_store_segments s on s.order_id = d.order_id
    cross join lateral jsonb_array_elements(coalesce(s.items_snapshot, '[]'::jsonb)) x(item)
    where coalesce(x.item ->> 'product_id', '') <> ''
  ), unique_items as (
    select distinct on (e.order_id, e.product_id) e.*
    from extracted e
    order by e.order_id, e.product_id, e.created_at desc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'order_id', u.order_id,
    'store_id', u.store_id,
    'product_id', u.product_id,
    'product_name', u.product_name,
    'product_image', u.product_image,
    'delivered_at', u.created_at,
    'review_id', r.id,
    'review_status', r.moderation_status,
    'ready_for_review', r.id is null
  ) order by u.created_at desc), '[]'::jsonb)
  into v_items
  from unique_items u
  left join public.product_reviews r
    on r.customer_id = v_customer_id
   and r.order_id = u.order_id
   and r.product_reference = u.product_id;

  return jsonb_build_object(
    'items', v_items,
    'ready_count', (
      select count(*)
      from jsonb_array_elements(v_items) z(item)
      where coalesce((z.item ->> 'ready_for_review')::boolean, false)
    )
  );
end;
$$;

revoke all on function public.customer_review_ready_products_v132(text) from public;
grant execute on function public.customer_review_ready_products_v132(text) to anon, authenticated;

commit;
