-- G4F: verified vendor submission of an existing, never-submitted draft.
-- Does not approve, activate, publish, notify, redeem, touch checkout, stock or invoices.
begin;
create or replace function public.kinto_deals_v1_vendor_submit_g4(
 p_session_token text,p_campaign_id uuid,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_store uuid;v_c public.kinto_deals_v1_campaigns%rowtype;
 v_submission uuid;v_count integer;v_now timestamptz;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000';end if;
 if p_campaign_id is null or p_expected_updated_at is null then
  raise exception 'DEALS_SUBMIT_REQUIRES_DRAFT_VERSION' using errcode='22023';end if;
 select * into v_c from public.kinto_deals_v1_campaigns
 where id=p_campaign_id and store_id=v_store for update;
 if not found then raise exception 'DEALS_DRAFT_NOT_FOUND' using errcode='P0002';end if;
 if v_c.status<>'draft' or exists(select 1 from public.kinto_deals_v1_submissions s where s.campaign_id=v_c.id) then
  raise exception 'DEALS_ALREADY_SUBMITTED_OR_LOCKED' using errcode='40001';end if;
 if v_c.updated_at is distinct from p_expected_updated_at then
  raise exception 'DEALS_DRAFT_VERSION_CONFLICT' using errcode='40001';end if;
 v_now:=clock_timestamp();
 if v_c.ends_at<=v_now or v_c.ends_at<=v_c.starts_at then
  raise exception 'DEALS_CAMPAIGN_PERIOD_ENDED' using errcode='22023';end if;
 select count(*) into v_count from public.kinto_deals_v1_products cp
 join public.local_products p on p.id=cp.product_id and p.store_id=v_store
 where cp.campaign_id=v_c.id;
 if v_count not between 1 and 50 or v_count<>(select count(*) from public.kinto_deals_v1_products where campaign_id=v_c.id)
 or (v_c.kind='choose_n' and (v_c.threshold_units is null or v_c.threshold_units>v_count))
 or (v_c.kind='buy_n' and (v_c.threshold_units is null or v_c.threshold_units not between 1 and 100))
 or (v_c.kind='limited_purchase' and (v_c.threshold_units is not null or v_c.gift_product_id is not null or v_c.max_units_per_customer is null))
 or (v_c.gift_product_id is not null and (not exists(select 1 from public.local_products p where p.id=v_c.gift_product_id and p.store_id=v_store)
 or exists(select 1 from public.kinto_deals_v1_products cp where cp.campaign_id=v_c.id and cp.product_id=v_c.gift_product_id))) then
  raise exception 'DEALS_DRAFT_PRODUCTS_OR_RULES_INVALID' using errcode='23514';end if;
 insert into public.kinto_deals_v1_submissions
 (campaign_id,store_id,title_snapshot,summary_snapshot,submitted_at,review_state,revision)
 values(v_c.id,v_store,v_c.title,
  jsonb_build_object('description',v_c.description,'kind',v_c.kind,
   'starts_at',v_c.starts_at,'ends_at',v_c.ends_at,'threshold_units',v_c.threshold_units,
   'gift_product_id',v_c.gift_product_id,'gift_selected_options',v_c.gift_selected_options,
   'max_uses_per_customer',v_c.max_uses_per_customer,'max_units_per_customer',v_c.max_units_per_customer,
   'max_total_redemptions',v_c.max_total_redemptions,'terms_snapshot',v_c.terms_snapshot,
   'product_ids',(select coalesce(jsonb_agg(cp.product_id order by cp.created_at,cp.product_id),'[]'::jsonb)
    from public.kinto_deals_v1_products cp where cp.campaign_id=v_c.id)),
  v_now,'pending',1) returning id into v_submission;
 update public.kinto_deals_v1_campaigns
 set status='submitted',submitted_at=v_now,updated_at=greatest(v_now,v_c.updated_at+interval '1 microsecond')
 where id=v_c.id;
 return jsonb_build_object('ok',true,'campaign_id',v_c.id,'submission_id',v_submission,
  'revision',1,'review_state','pending','published',false,'approved',false,
  'merchant_push_sent',false,'customer_broadcast_sent',false);
end;
$deals$;
revoke all on function public.kinto_deals_v1_vendor_submit_g4(text,uuid,timestamptz)
 from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_submit_g4(text,uuid,timestamptz)
 to anon,authenticated;
commit;
