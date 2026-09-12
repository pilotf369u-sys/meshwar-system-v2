-- KINTO V154: read-only customer review display context.
begin;
create or replace function public.customer_review_display_context_v154(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_customer uuid;v_items jsonb;
begin
 v_customer:=private.require_customer_review_session(p_session_token);
 select coalesce(jsonb_agg(jsonb_build_object(
  'review_id',r.id,
  'store_name',coalesce(nullif(to_jsonb(s)->>'name',''),nullif(to_jsonb(s)->>'store_name',''),nullif(to_jsonb(s)->>'title',''),'متجر KINTO'),
  'order_display',coalesce(nullif(to_jsonb(o)->>'order_code',''),nullif(to_jsonb(o)->>'reference_order_no',''),nullif(to_jsonb(o)->>'siparis_no',''),left(r.order_id::text,8)),
  'rejection_reason',case when r.moderation_status='rejected' then coalesce(nullif(trim(r.moderation_note),''),'المحتوى لا يستوفي إرشادات تقييمات KINTO.') end
 ) order by r.created_at desc),'[]'::jsonb) into v_items
 from public.product_reviews r
 left join public.local_stores s on s.id=r.store_id
 left join public.orders o on o.id=r.order_id
 where r.customer_id=v_customer;
 return jsonb_build_object('items',v_items);
end;$$;
revoke all on function public.customer_review_display_context_v154(text) from public;
grant execute on function public.customer_review_display_context_v154(text) to anon,authenticated;
commit;
