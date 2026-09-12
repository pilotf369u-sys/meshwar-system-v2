-- KINTO V140: published-only storefront review summaries and details.
-- Additive-only; no writes to orders, tracking, employees, or invoices.

begin;

create or replace function public.product_review_summaries_v140(p_product_ids uuid[])
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_id', q.product_id,
    'average_rating', q.average_rating,
    'review_count', q.review_count
  ) order by q.product_id), '[]'::jsonb)
  from (
    select r.product_id,
      round(avg(r.rating)::numeric, 1) as average_rating,
      count(*)::integer as review_count
    from public.product_reviews r
    where r.product_id = any(coalesce(p_product_ids, array[]::uuid[]))
      and r.moderation_status = 'published'
    group by r.product_id
    limit 100
  ) q;
$$;

revoke all on function public.product_review_summaries_v140(uuid[]) from public;
grant execute on function public.product_review_summaries_v140(uuid[]) to anon, authenticated;

create or replace function public.product_reviews_public_v140(
  p_product_id uuid,
  p_limit integer default 8,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 20);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_count bigint;
  v_average numeric;
  v_items jsonb;
begin
  select count(*), round(avg(r.rating)::numeric, 1)
  into v_count, v_average
  from public.product_reviews r
  where r.product_id = p_product_id
    and r.moderation_status = 'published';

  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select r.id,
      case when nullif(trim(coalesce(c.name, '')), '') is null then 'عميل KINTO'
        else left(trim(c.name), 1) || '***' end as customer_name,
      r.rating, r.comment, r.verified_purchase, r.created_at,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', i.id,
          'mime_type', i.mime_type,
          'data_url', 'data:' || i.mime_type || ';base64,' || encode(p.image_bytes, 'base64'),
          'sort_order', i.sort_order
        ) order by i.sort_order)
        from public.product_review_images i
        join public.product_review_image_payloads p on p.image_id = i.id
        where i.review_id = r.id and i.moderation_status = 'published'
      ), '[]'::jsonb) as images
    from public.product_reviews r
    left join public.customers c on c.id = r.customer_id
    where r.product_id = p_product_id and r.moderation_status = 'published'
    order by r.created_at desc
    limit v_limit offset v_offset
  ) q;

  return jsonb_build_object(
    'product_id', p_product_id,
    'count', coalesce(v_count, 0),
    'average_rating', coalesce(v_average, 0),
    'items', v_items,
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

revoke all on function public.product_reviews_public_v140(uuid,integer,integer) from public;
grant execute on function public.product_reviews_public_v140(uuid,integer,integer) to anon, authenticated;

commit;
