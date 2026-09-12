-- KINTO V152: admin review store identity, individual image deletion.
begin;
create or replace function public.admin_list_product_reviews_v138(p_admin_id uuid,p_status text default 'pending',p_page integer default 1,p_page_size integer default 20)
returns jsonb language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare v_status text:=lower(trim(coalesce(p_status,'pending')));v_page integer:=greatest(1,coalesce(p_page,1));v_size integer:=least(50,greatest(1,coalesce(p_page_size,20)));v_total bigint;v_items jsonb;
begin
 perform private.require_product_review_admin_v138(p_admin_id);
 if v_status not in('pending','published','rejected','hidden','all') then raise exception 'INVALID_REVIEW_STATUS';end if;
 select count(*) into v_total from public.product_reviews r where v_status='all' or r.moderation_status=v_status;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into v_items from(
  select r.id,r.customer_id,r.order_id,r.store_id,r.product_id,r.product_name_snapshot product_name,r.product_image_snapshot product_image,
   r.rating,r.comment,r.verified_purchase,r.moderation_status,r.moderation_note,r.created_at,r.moderated_at,
   coalesce(c.name,c.code,r.customer_id::text) customer_name,
   coalesce(nullif(to_jsonb(s)->>'name',''),nullif(to_jsonb(s)->>'store_name',''),nullif(to_jsonb(s)->>'title',''),'متجر KINTO') store_name,
   coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'storage_path',i.storage_path,'mime_type',i.mime_type,'status',i.moderation_status,'sort_order',i.sort_order) order by i.sort_order) from public.product_review_images i where i.review_id=r.id),'[]'::jsonb) images
  from public.product_reviews r left join public.customers c on c.id=r.customer_id left join public.local_stores s on s.id=r.store_id
  where v_status='all' or r.moderation_status=v_status order by r.created_at desc limit v_size offset((v_page-1)*v_size)
 )q;
 return jsonb_build_object('items',v_items,'total',v_total,'page',v_page,'page_size',v_size);
end;$$;
create or replace function public.admin_delete_product_review_image_v152(p_admin_id uuid,p_image_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare v_path text;v_review uuid;
begin
 perform private.require_product_review_admin_v138(p_admin_id);
 select storage_path,review_id into v_path,v_review from public.product_review_images where id=p_image_id for update;
 if v_review is null then raise exception 'REVIEW_IMAGE_NOT_FOUND';end if;
 if v_path not like 'database://%' then insert into private.product_review_storage_deletions_v150(storage_path) values(v_path) on conflict(storage_path) do update set expires_at=now()+interval '1 day';end if;
 delete from public.product_review_images where id=p_image_id;
 return jsonb_build_object('ok',true,'review_id',v_review,'storage_path',case when v_path like 'database://%' then null else v_path end,'bucket','product-review-images');
end;$$;
revoke all on function public.admin_delete_product_review_image_v152(uuid,uuid) from public;
grant execute on function public.admin_delete_product_review_image_v152(uuid,uuid) to anon,authenticated;
commit;
