-- KINTO V133: published-only storefront review projection.
-- The underlying tables remain inaccessible to anon/authenticated roles.

begin;

create or replace function public.product_reviews_public_v133(
  p_product_id uuid,
  p_limit integer default 10,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_rows jsonb;
  v_count bigint;
  v_average numeric;
begin
  select count(*), round(avg(r.rating)::numeric, 2)
    into v_count, v_average
  from public.product_reviews r
  where r.product_id = p_product_id
    and r.moderation_status = 'published';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', q.id,
    'customer_name', q.customer_name,
    'rating', q.rating,
    'comment', q.comment,
    'verified_purchase', q.verified_purchase,
    'created_at', q.created_at,
    'images', q.images
  ) order by q.created_at desc), '[]'::jsonb)
  into v_rows
  from (
    select r.id,
      case
        when nullif(trim(coalesce(c.name, '')), '') is null then 'عميل KINTO'
        else left(trim(c.name), 1) || '***'
      end as customer_name,
      r.rating, r.comment, r.verified_purchase, r.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'path', i.storage_path,
          'width', i.width,
          'height', i.height,
          'sort_order', i.sort_order
        ) order by i.sort_order)
        from public.product_review_images i
        where i.review_id = r.id
          and i.moderation_status = 'published'
      ), '[]'::jsonb) as images
    from public.product_reviews r
    left join public.customers c on c.id = r.customer_id
    where r.product_id = p_product_id
      and r.moderation_status = 'published'
    order by r.created_at desc
    limit v_limit offset v_offset
  ) q;

  return jsonb_build_object(
    'product_id', p_product_id,
    'count', coalesce(v_count, 0),
    'average_rating', coalesce(v_average, 0),
    'items', v_rows
  );
end;
$$;

revoke all on function public.product_reviews_public_v133(uuid, integer, integer) from public;
grant execute on function public.product_reviews_public_v133(uuid, integer, integer) to anon, authenticated;

commit;
