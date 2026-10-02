-- G4B: verified vendor draft save ONLY. No submission, publication, checkout, stock or invoice hooks.
begin;
create or replace function public.kinto_deals_v1_vendor_save_draft_g4(
 p_session_token text,p_campaign_id uuid,p_expected_updated_at timestamptz,p_draft jsonb)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare
 v_store uuid; v_c public.kinto_deals_v1_campaigns%rowtype;
 v_id uuid; v_kind text; v_title text; v_description text;
 v_start timestamptz; v_end timestamptz; v_threshold integer;
 v_gift uuid; v_gift_options jsonb; v_terms jsonb; v_ids uuid[];
 v_uses integer; v_units integer; v_total integer; v_now timestamptz;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_draft is null or jsonb_typeof(p_draft)<>'object' then
  raise exception 'DEALS_INVALID_DRAFT' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_draft) k
  where k not in ('title','description','kind','starts_at','ends_at','threshold_units',
   'gift_product_id','gift_selected_options','max_uses_per_customer',
   'max_units_per_customer','max_total_redemptions','terms_snapshot','product_ids')) then
  raise exception 'DEALS_UNKNOWN_DRAFT_FIELD' using errcode='22023'; end if;
 v_kind:=p_draft->>'kind';v_title:=btrim(coalesce(p_draft->>'title',''));
 v_description:=btrim(coalesce(p_draft->>'description',''));
 if v_kind is null or v_kind not in ('choose_n','buy_n','limited_purchase')
  or char_length(v_title) not between 2 and 160 or char_length(v_description)>2000 then
  raise exception 'DEALS_INVALID_TITLE_OR_KIND' using errcode='22023'; end if;
 begin
  v_start:=(p_draft->>'starts_at')::timestamptz;
  v_end:=(p_draft->>'ends_at')::timestamptz;
  v_threshold:=(p_draft->>'threshold_units')::integer;
  v_gift:=(p_draft->>'gift_product_id')::uuid;
  v_uses:=coalesce((p_draft->>'max_uses_per_customer')::integer,1);
  v_units:=(p_draft->>'max_units_per_customer')::integer;
  v_total:=(p_draft->>'max_total_redemptions')::integer;
 exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
  raise exception 'DEALS_INVALID_DRAFT_FIELD_TYPE' using errcode='22023';
 end;
 if v_start is null or v_end is null or v_end<=v_start
  or v_end<=clock_timestamp() or v_end>v_start+interval '366 days'
  or v_uses not between 1 and 100
  or (v_units is not null and v_units not between 1 and 1000)
  or (v_total is not null and v_total not between 1 and 1000000) then
  raise exception 'DEALS_INVALID_PERIOD_OR_LIMITS' using errcode='22023'; end if;
 if (v_kind='limited_purchase' and (v_threshold is not null or v_gift is not null or v_units is null))
  or (v_kind in ('choose_n','buy_n') and (v_threshold is null or v_threshold not between 1 and 100)) then
  raise exception 'DEALS_INVALID_KIND_RULES' using errcode='22023'; end if;
 v_gift_options:=coalesce(p_draft->'gift_selected_options','{}'::jsonb);
 v_terms:=coalesce(p_draft->'terms_snapshot','{}'::jsonb);
 if jsonb_typeof(v_gift_options)<>'object' or jsonb_typeof(v_terms)<>'object'
  or length(v_terms::text)>12000 or length(v_gift_options::text)>3000 then
  raise exception 'DEALS_INVALID_OPTIONS_OR_TERMS' using errcode='22023'; end if;
 if jsonb_typeof(p_draft->'product_ids') is distinct from 'array'
  or jsonb_array_length(p_draft->'product_ids') not between 1 and 50 then
  raise exception 'DEALS_PRODUCT_LIST_REQUIRED' using errcode='22023'; end if;
 if exists(select 1 from jsonb_array_elements(p_draft->'product_ids') x where jsonb_typeof(x)<>'string') then
  raise exception 'DEALS_PRODUCT_ID_TYPE' using errcode='22023'; end if;
 begin
  select array_agg(x.value::uuid) into v_ids from jsonb_array_elements_text(p_draft->'product_ids') x(value);
 exception when invalid_text_representation then
  raise exception 'DEALS_INVALID_PRODUCT_UUID' using errcode='22023';
 end;
 if (select count(distinct id) from unnest(v_ids) id)<>cardinality(v_ids)
  or (select count(*) from public.local_products p where p.id=any(v_ids) and p.store_id=v_store)<>cardinality(v_ids)
  or (v_gift is not null and not exists(select 1 from public.local_products p where p.id=v_gift and p.store_id=v_store))
  or (v_gift is not null and v_gift=any(v_ids)) then
  raise exception 'DEALS_PRODUCT_OR_GIFT_OWNERSHIP' using errcode='23514'; end if;
 if v_kind='choose_n' and v_threshold>cardinality(v_ids) then
  raise exception 'DEALS_CHOOSE_N_EXCEEDS_PRODUCTS' using errcode='22023'; end if;
 v_now:=clock_timestamp();
 if p_campaign_id is null then
  if p_expected_updated_at is not null then raise exception 'DEALS_NEW_DRAFT_VERSION_MUST_BE_NULL' using errcode='40001'; end if;
  insert into public.kinto_deals_v1_campaigns
   (store_id,title,description,kind,status,starts_at,ends_at,threshold_units,gift_product_id,
    gift_selected_options,max_uses_per_customer,max_units_per_customer,max_total_redemptions,terms_snapshot)
  values(v_store,v_title,v_description,v_kind,'draft',v_start,v_end,v_threshold,v_gift,
   v_gift_options,v_uses,v_units,v_total,v_terms) returning id,updated_at into v_id,v_now;
 else
  select * into v_c from public.kinto_deals_v1_campaigns
   where id=p_campaign_id and store_id=v_store for update;
  if not found then raise exception 'DEALS_DRAFT_NOT_FOUND' using errcode='P0002'; end if;
  if v_c.status<>'draft' or exists(select 1 from public.kinto_deals_v1_submissions where campaign_id=v_c.id) then
   raise exception 'DEALS_REVIEWED_OR_SUBMITTED_DRAFT_LOCKED' using errcode='40001'; end if;
  if v_c.updated_at is distinct from p_expected_updated_at then
   raise exception 'DEALS_DRAFT_VERSION_CONFLICT' using errcode='40001'; end if;
  update public.kinto_deals_v1_campaigns set title=v_title,description=v_description,
   kind=v_kind,starts_at=v_start,ends_at=v_end,threshold_units=v_threshold,
   gift_product_id=v_gift,gift_selected_options=v_gift_options,
   max_uses_per_customer=v_uses,max_units_per_customer=v_units,
   max_total_redemptions=v_total,terms_snapshot=v_terms,
   updated_at=greatest(clock_timestamp(),v_c.updated_at+interval '1 microsecond')
  where id=v_c.id returning id,updated_at into v_id,v_now;
  delete from public.kinto_deals_v1_products where campaign_id=v_id;
 end if;
 insert into public.kinto_deals_v1_products(campaign_id,product_id)
 select v_id,id from unnest(v_ids) id;
 return jsonb_build_object('ok',true,'campaign_id',v_id,'status','draft',
  'updated_at',v_now,'product_count',cardinality(v_ids),'submitted',false,'published',false);
end;
$deals$;
revoke all on function public.kinto_deals_v1_vendor_save_draft_g4(text,uuid,timestamptz,jsonb)
 from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_save_draft_g4(text,uuid,timestamptz,jsonb)
 to anon,authenticated;
commit;
