-- KINTO V132: isolated customer review session and verified-purchase contract.
-- Existing order data is read only. No order trigger or order mutation is introduced.

begin;

create extension if not exists pgcrypto;
create schema if not exists private;

create or replace function private.review_jsonb_object(p_value jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_result jsonb;
begin
  if p_value is null then return '{}'::jsonb; end if;
  if jsonb_typeof(p_value) = 'object' then return p_value; end if;
  if jsonb_typeof(p_value) = 'string' then
    begin
      v_result := (p_value #>> '{}')::jsonb;
      if jsonb_typeof(v_result) = 'object' then return v_result; end if;
    exception when others then
      return '{}'::jsonb;
    end;
  end if;
  return '{}'::jsonb;
end;
$$;

revoke all on function private.review_jsonb_object(jsonb) from public, anon, authenticated;

create or replace function private.require_customer_review_session(p_session_token text)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer_id uuid;
begin
  if trim(coalesce(p_session_token, '')) = '' then
    raise exception 'REVIEW_SESSION_REQUIRED';
  end if;

  select s.customer_id into v_customer_id
  from public.customer_review_sessions s
  where s.token_hash = digest(p_session_token, 'sha256')
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;

  if v_customer_id is null then
    raise exception 'REVIEW_SESSION_INVALID';
  end if;

  update public.customer_review_sessions
  set last_seen_at = now()
  where token_hash = digest(p_session_token, 'sha256');

  return v_customer_id;
end;
$$;

revoke all on function private.require_customer_review_session(text) from public, anon, authenticated;

create or replace function public.customer_review_login_v132(p_identity text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer public.customers%rowtype;
  v_customer_json jsonb;
  v_stored_password text;
  v_password_ok boolean := false;
  v_token text;
  v_expires_at timestamptz := now() + interval '30 days';
  v_identity_normalized text;
  v_identity_hash bytea;
  v_failed_attempts integer;
begin
  if trim(coalesce(p_identity, '')) = '' or coalesce(p_password, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'REVIEW_LOGIN_FIELDS_REQUIRED');
  end if;

  v_identity_normalized := lower(trim(p_identity));
  v_identity_hash := digest(v_identity_normalized, 'sha256');

  -- Serialize attempts for the same identity so parallel requests cannot bypass
  -- the five-attempt limit. Only the new review subsystem is locked.
  perform pg_advisory_xact_lock(hashtextextended(encode(v_identity_hash, 'hex'), 132));

  delete from public.customer_review_login_attempts
  where attempted_at < now() - interval '24 hours';

  select count(*)::integer into v_failed_attempts
  from public.customer_review_login_attempts a
  where a.identity_hash = v_identity_hash
    and a.attempted_at >= now() - interval '15 minutes';

  if v_failed_attempts >= 5 then
    return jsonb_build_object(
      'ok', false,
      'error', 'REVIEW_LOGIN_RATE_LIMITED',
      'retry_after_seconds', 900
    );
  end if;

  select c.* into v_customer
  from public.customers c
  where lower(trim(coalesce(to_jsonb(c) ->> 'code', ''))) = lower(trim(p_identity))
     or trim(coalesce(to_jsonb(c) ->> 'phone', '')) = trim(p_identity)
     or lower(trim(coalesce(to_jsonb(c) ->> 'email', ''))) = lower(trim(p_identity))
  limit 1;

  if v_customer.id is null then
    insert into public.customer_review_login_attempts(identity_hash)
    values (v_identity_hash);
    return jsonb_build_object('ok', false, 'error', 'REVIEW_LOGIN_INVALID');
  end if;

  v_customer_json := to_jsonb(v_customer);
  v_stored_password := coalesce(v_customer_json ->> 'password', '');

  if v_stored_password = p_password then
    v_password_ok := true;
  elsif v_stored_password ~ '^\$2[aby]\$' then
    begin
      v_password_ok := crypt(p_password, v_stored_password) = v_stored_password;
    exception when others then
      v_password_ok := false;
    end;
  end if;

  if not v_password_ok then
    insert into public.customer_review_login_attempts(identity_hash)
    values (v_identity_hash);
    return jsonb_build_object('ok', false, 'error', 'REVIEW_LOGIN_INVALID');
  end if;

  delete from public.customer_review_login_attempts
  where identity_hash = v_identity_hash;

  delete from public.customer_review_sessions
  where customer_id = v_customer.id
    and (expires_at <= now() or revoked_at is not null);

  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.customer_review_sessions(customer_id, token_hash, expires_at)
  values (v_customer.id, digest(v_token, 'sha256'), v_expires_at);

  return jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'expires_at', v_expires_at,
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'code', v_customer_json ->> 'code',
      'name', v_customer_json ->> 'name'
    )
  );
end;
$$;

revoke all on function public.customer_review_login_v132(text, text) from public;
grant execute on function public.customer_review_login_v132(text, text) to anon, authenticated;

create or replace function public.customer_review_logout_v132(p_session_token text)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  update public.customer_review_sessions
  set revoked_at = now()
  where token_hash = digest(coalesce(p_session_token, ''), 'sha256')
    and revoked_at is null;
  return found;
end;
$$;

revoke all on function public.customer_review_logout_v132(text) from public;
grant execute on function public.customer_review_logout_v132(text) to anon, authenticated;

create or replace function private.review_delivered_product(
  p_order_id uuid,
  p_customer_id uuid,
  p_product_id uuid
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, private, pg_temp
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

  return jsonb_build_object(
    'item', v_item,
    'segment_id', v_segment_id
  );
end;
$$;

revoke all on function private.review_delivered_product(uuid, uuid, uuid) from public, anon, authenticated;

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
set search_path = public, private, pg_temp
as $$
declare
  v_customer_id uuid;
  v_verified jsonb;
  v_item jsonb;
  v_product public.local_products%rowtype;
  v_review public.product_reviews%rowtype;
  v_reference text;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);

  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'INVALID_REVIEW_RATING';
  end if;
  if p_comment is not null and char_length(trim(p_comment)) > 2000 then
    raise exception 'REVIEW_COMMENT_TOO_LONG';
  end if;

  select p.* into v_product
  from public.local_products p
  where p.id = p_product_id
  limit 1;
  if v_product.id is null then raise exception 'PRODUCT_NOT_FOUND'; end if;

  v_verified := private.review_delivered_product(p_order_id, v_customer_id, p_product_id);
  v_item := v_verified -> 'item';
  v_reference := coalesce(nullif(v_item ->> 'product_reference', ''), p_product_id::text);

  insert into public.product_reviews(
    customer_id, order_id, order_store_segment_id, store_id, product_id,
    product_reference, product_name_snapshot, product_image_snapshot,
    rating, comment, verified_purchase, moderation_status
  ) values (
    v_customer_id, p_order_id, nullif(v_verified ->> 'segment_id', '')::uuid,
    v_product.store_id, v_product.id, v_reference,
    coalesce(nullif(v_item ->> 'product_name', ''), v_product.product_name, 'المنتج'),
    coalesce(nullif(v_item ->> 'product_image', ''), v_product.image_url),
    p_rating, nullif(trim(coalesce(p_comment, '')), ''), true, 'pending'
  )
  on conflict (customer_id, order_id, product_reference) do update set
    rating = excluded.rating,
    comment = excluded.comment,
    product_name_snapshot = excluded.product_name_snapshot,
    product_image_snapshot = excluded.product_image_snapshot,
    moderation_status = 'pending',
    moderation_note = null,
    moderated_at = null,
    moderated_by = null,
    updated_at = now()
  returning * into v_review;

  return jsonb_build_object(
    'id', v_review.id,
    'rating', v_review.rating,
    'status', v_review.moderation_status,
    'verified_purchase', v_review.verified_purchase,
    'updated_at', v_review.updated_at
  );
end;
$$;

revoke all on function public.customer_submit_product_review_v132(text, uuid, uuid, smallint, text) from public;
grant execute on function public.customer_submit_product_review_v132(text, uuid, uuid, smallint, text) to anon, authenticated;

create or replace function public.customer_review_ready_products_v132(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
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

create or replace function public.customer_list_product_reviews_v132(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer_id uuid;
  v_rows jsonb;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'order_id', r.order_id,
    'store_id', r.store_id,
    'product_id', r.product_id,
    'product_name', r.product_name_snapshot,
    'product_image', r.product_image_snapshot,
    'rating', r.rating,
    'comment', r.comment,
    'status', r.moderation_status,
    'moderation_note', r.moderation_note,
    'verified_purchase', r.verified_purchase,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  ) order by r.created_at desc), '[]'::jsonb)
  into v_rows
  from public.product_reviews r
  where r.customer_id = v_customer_id;
  return jsonb_build_object('items', v_rows);
end;
$$;

revoke all on function public.customer_list_product_reviews_v132(text) from public;
grant execute on function public.customer_list_product_reviews_v132(text) to anon, authenticated;

commit;
