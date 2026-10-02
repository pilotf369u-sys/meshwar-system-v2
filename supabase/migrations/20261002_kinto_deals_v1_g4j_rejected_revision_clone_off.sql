-- G4J: vendor rejected campaign -> new editable draft, preserving old review/audit.
begin;
create or replace function public.kinto_deals_v1_vendor_revise_rejected_g4(
 p_session_token text,p_rejected_campaign_id uuid)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_store uuid;v_old public.kinto_deals_v1_campaigns%rowtype;
 v_last public.kinto_deals_v1_submissions%rowtype;v_new uuid;v_updated timestamptz;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000';end if;
 select * into v_old from public.kinto_deals_v1_campaigns
 where id=p_rejected_campaign_id and store_id=v_store for update;
 if not found or v_old.status<>'rejected' then
  raise exception 'DEALS_REJECTED_CAMPAIGN_NOT_FOUND' using errcode='P0002';end if;
 select * into v_last from public.kinto_deals_v1_submissions
 where campaign_id=v_old.id order by submitted_at desc,id desc limit 1;
 if not found or v_last.review_state<>'rejected' or nullif(btrim(v_last.rejection_reason),'') is null
 or not exists(select 1 from public.kinto_deals_v1_review_events e
  where e.submission_id=v_last.id and e.decision='rejected' and e.store_id=v_store) then
  raise exception 'DEALS_REJECTION_DECISION_REQUIRED' using errcode='40001';end if;
 insert into public.kinto_deals_v1_campaigns
 (store_id,title,description,kind,status,starts_at,ends_at,threshold_units,
  gift_product_id,gift_selected_options,max_uses_per_customer,max_units_per_customer,
  max_total_redemptions,terms_snapshot)
 values(v_store,v_old.title,v_old.description,v_old.kind,'draft',v_old.starts_at,v_old.ends_at,
  v_old.threshold_units,v_old.gift_product_id,v_old.gift_selected_options,
  v_old.max_uses_per_customer,v_old.max_units_per_customer,v_old.max_total_redemptions,
  v_old.terms_snapshot || jsonb_build_object('revision_origin_campaign_id',v_old.id,
   'revision_origin_submission_id',v_last.id))
 returning id,updated_at into v_new,v_updated;
 insert into public.kinto_deals_v1_products(campaign_id,product_id)
 select v_new,cp.product_id from public.kinto_deals_v1_products cp where cp.campaign_id=v_old.id;
 return jsonb_build_object('ok',true,'campaign_id',v_new,'updated_at',v_updated,
  'status','draft','source_campaign_id',v_old.id,'source_submission_id',v_last.id,
  'rejection_reason',v_last.rejection_reason,'published',false,'submitted',false);
end;
$deals$;
revoke all on function public.kinto_deals_v1_vendor_revise_rejected_g4(text,uuid)
 from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_revise_rejected_g4(text,uuid)
 to anon,authenticated;
commit;
