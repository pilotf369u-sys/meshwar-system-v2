-- KINTO V155: isolated customer notification receipts and review lifecycle notices.
begin;

create table if not exists public.customer_notification_reads_v155 (
  customer_id uuid not null references public.customers(id) on update cascade on delete cascade,
  notification_key text not null,
  read_at timestamptz not null default now(),
  primary key (customer_id, notification_key),
  constraint customer_notification_reads_v155_key_length
    check (char_length(notification_key) between 3 and 500)
);

create index if not exists idx_customer_notification_reads_v155_recent
  on public.customer_notification_reads_v155(customer_id, read_at desc);

alter table public.customer_notification_reads_v155 enable row level security;
revoke all on public.customer_notification_reads_v155 from public, anon, authenticated;

create or replace function public.customer_review_moderation_notices_v155(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer uuid;
  v_items jsonb;
begin
  v_customer := private.require_customer_review_session(p_session_token);

  select coalesce(jsonb_agg(jsonb_build_object(
    'review_id', r.id,
    'product_name', r.product_name_snapshot,
    'store_name', coalesce(
      nullif(to_jsonb(s)->>'name', ''),
      nullif(to_jsonb(s)->>'store_name', ''),
      nullif(to_jsonb(s)->>'title', ''),
      'متجر KINTO'
    ),
    'status', r.moderation_status,
    'moderated_at', r.moderated_at,
    'message', case
      when r.moderation_status = 'published' then
        'شكراً لك! تم نشر تقييمك بنجاح. مساهمتك الصادقة تساعد عملاء KINTO على اتخاذ قرار أفضل، ونقدّر وقتك وثقتك بنا.'
      else
        'نعتذر، لم يتم نشر تقييمك لأن ' ||
        coalesce(nullif(trim(r.moderation_note), ''), 'المحتوى لا يستوفي إرشادات تقييمات KINTO.') ||
        ' يمكنك التواصل مع الدعم إذا احتجت إلى توضيح.'
    end
  ) order by r.moderated_at desc), '[]'::jsonb)
  into v_items
  from public.product_reviews r
  left join public.local_stores s on s.id = r.store_id
  where r.customer_id = v_customer
    and r.moderation_status in ('published', 'rejected')
    and r.moderated_at >= now() - interval '180 days';

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.customer_notification_read_state_v155(
  p_session_token text,
  p_notification_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer uuid;
  v_keys text[];
  v_unread integer;
begin
  v_customer := private.require_customer_review_session(p_session_token);
  select coalesce(array_agg(distinct k), array[]::text[])
  into v_keys
  from unnest(coalesce(p_notification_keys, array[]::text[])) k
  where char_length(k) between 3 and 500;

  if cardinality(v_keys) > 100 then raise exception 'TOO_MANY_NOTIFICATION_KEYS'; end if;

  select count(*)::integer into v_unread
  from unnest(v_keys) k
  where not exists (
    select 1 from public.customer_notification_reads_v155 r
    where r.customer_id = v_customer and r.notification_key = k
  );

  return jsonb_build_object('unread_count', v_unread, 'total_count', cardinality(v_keys));
end;
$$;

create or replace function public.customer_mark_notifications_read_v155(
  p_session_token text,
  p_notification_keys text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer uuid;
  v_keys text[];
  v_marked integer := 0;
begin
  v_customer := private.require_customer_review_session(p_session_token);
  select coalesce(array_agg(distinct k), array[]::text[])
  into v_keys
  from unnest(coalesce(p_notification_keys, array[]::text[])) k
  where char_length(k) between 3 and 500;

  if cardinality(v_keys) > 100 then raise exception 'TOO_MANY_NOTIFICATION_KEYS'; end if;

  insert into public.customer_notification_reads_v155(customer_id, notification_key, read_at)
  select v_customer, k, now() from unnest(v_keys) k
  on conflict (customer_id, notification_key) do update set read_at = excluded.read_at;
  get diagnostics v_marked = row_count;

  delete from public.customer_notification_reads_v155 r
  where r.customer_id = v_customer
    and r.notification_key in (
      select notification_key
      from public.customer_notification_reads_v155
      where customer_id = v_customer
      order by read_at desc
      offset 500
    );

  return jsonb_build_object('ok', true, 'marked_count', v_marked);
end;
$$;

revoke all on function public.customer_review_moderation_notices_v155(text) from public;
revoke all on function public.customer_notification_read_state_v155(text, text[]) from public;
revoke all on function public.customer_mark_notifications_read_v155(text, text[]) from public;
grant execute on function public.customer_review_moderation_notices_v155(text) to anon, authenticated;
grant execute on function public.customer_notification_read_state_v155(text, text[]) to anon, authenticated;
grant execute on function public.customer_mark_notifications_read_v155(text, text[]) to anon, authenticated;

commit;
