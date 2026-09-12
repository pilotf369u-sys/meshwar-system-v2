-- KINTO V153: standardized rejection notices using the existing review record.
begin;
create or replace function public.customer_review_rejection_notices_v153(p_session_token text)
returns jsonb language plpgsql security definer stable set search_path=public,private,pg_temp as $$
declare v_customer uuid;v_items jsonb;
begin
 v_customer:=private.require_customer_review_session(p_session_token);
 select coalesce(jsonb_agg(jsonb_build_object('review_id',r.id,'product_name',r.product_name_snapshot,'moderated_at',r.moderated_at,
  'message','نعتذر، لم يتم نشر تقييمك لأن '||coalesce(nullif(trim(r.moderation_note),''),'المحتوى لا يستوفي إرشادات تقييمات KINTO.')||' يمكنك التواصل مع الدعم إذا احتجت إلى توضيح.') order by r.moderated_at desc),'[]'::jsonb)
 into v_items from public.product_reviews r where r.customer_id=v_customer and r.moderation_status='rejected' and r.moderated_at>=now()-interval '180 days';
 return jsonb_build_object('items',v_items);
end;$$;
revoke all on function public.customer_review_rejection_notices_v153(text) from public;
grant execute on function public.customer_review_rejection_notices_v153(text) to anon,authenticated;

create or replace function public.admin_moderate_product_review_v138(p_admin_id uuid,p_review_id uuid,p_decision text,p_note text default null)
returns jsonb language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare v_admin uuid;v_decision text:=lower(trim(coalesce(p_decision,'')));v_review public.product_reviews%rowtype;v_note text;v_deleted integer:=0;v_paths text[];
begin
 v_admin:=private.require_product_review_admin_v138(p_admin_id);
 if v_decision not in('published','rejected','hidden') then raise exception 'INVALID_REVIEW_DECISION';end if;
 v_note:=nullif(trim(coalesce(p_note,'')),'');
 if v_decision='rejected' and v_note is null then v_note:='المحتوى لا يستوفي إرشادات تقييمات KINTO.';end if;
 if char_length(coalesce(v_note,''))>1000 then raise exception 'MODERATION_NOTE_TOO_LONG';end if;
 update public.product_reviews set moderation_status=v_decision,moderation_note=v_note,moderated_at=now(),moderated_by=v_admin,updated_at=now() where id=p_review_id returning * into v_review;
 if v_review.id is null then raise exception 'REVIEW_NOT_FOUND';end if;
 if v_decision='rejected' then
  select coalesce(array_agg(storage_path) filter(where storage_path not like 'database://%'),array[]::text[]) into v_paths from public.product_review_images where review_id=p_review_id;
  insert into private.product_review_storage_deletions_v150(storage_path) select unnest(v_paths) on conflict(storage_path) do update set expires_at=now()+interval '1 day';
  delete from public.product_review_images where review_id=p_review_id;get diagnostics v_deleted=row_count;
 else update public.product_review_images set moderation_status=v_decision,moderated_at=now(),moderated_by=v_admin where review_id=p_review_id;
 end if;
 return jsonb_build_object('id',v_review.id,'status',v_review.moderation_status,'moderated_at',v_review.moderated_at,'deleted_images',v_deleted,'deleted_storage_paths',coalesce(to_jsonb(v_paths),'[]'::jsonb),'bucket','product-review-images');
end;$$;
commit;
