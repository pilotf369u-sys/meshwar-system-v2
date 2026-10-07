-- G21C: fix merchant multi-option availability + draft save record shadowing.
-- Campaign composer only; no stock/order mutation.
begin;

create or replace function private.kinto_deals_v1_option_value_available_g21b(
 p_store_id uuid,p_product_id uuid,p_key text,p_value text)
returns boolean language plpgsql stable security definer
set search_path=public,private,pg_temp as $g21c$
declare p public.local_products%rowtype; variants jsonb; candidate text;
begin
 select * into p from public.local_products where id=p_product_id and store_id=p_store_id;
 if not found or coalesce(p.is_out_of_stock,false) or (p.stock_quantity is not null and p.stock_quantity<1) then return false; end if;

 -- A single dropdown value is available when at least one concrete combination
 -- containing it survives the same V93 variant + matrix stock probes.
 for candidate in
  select coalesce(v,'')
  from jsonb_array_elements_text(case p_key
   when 'color' then coalesce(p.options->'sizes','[""]'::jsonb)
   when 'size' then coalesce(p.options->'colors','[""]'::jsonb)
   else coalesce(p.options->'colors','[""]'::jsonb) end) v
 loop
  begin
   variants:=public.meshwar_adjust_variant_stock(coalesce(p.options,'{}'::jsonb),
    jsonb_build_object(
     'color',case when p_key='color' then p_value when p_key in ('size','volume') then candidate else '' end,
     'size',case when p_key='size' then p_value else '' end,
     'volume',case when p_key='volume' then p_value else '' end),1,-1);
   variants:=public.meshwar_adjust_matrix_stock(variants,
    jsonb_build_object(
     'color',case when p_key='color' then p_value when p_key in ('size','volume') then candidate else '' end,
     'size',case when p_key='size' then p_value else '' end,
     'volume',case when p_key='volume' then p_value else '' end),1,-1);
   return true;
  exception when others then null;
  end;
 end loop;
 return false;
end;
$g21c$;

-- Critical fix: do not reuse "e" as both PL/pgSQL record and SQL alias.
-- The old shadowing produced: record "e" is not assigned yet.
create or replace function public.kinto_deals_v1_vendor_set_product_options_g20(
 p_session_token text,p_campaign_id uuid,p_product_options jsonb)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $g20$
declare v_store uuid; v_count integer; v_item record;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if jsonb_typeof(p_product_options) is distinct from 'object' then raise exception 'DEALS_PRODUCT_OPTIONS_OBJECT_REQUIRED' using errcode='22023'; end if;
 if not exists(select 1 from public.kinto_deals_v1_campaigns c where c.id=p_campaign_id and c.store_id=v_store and c.status='draft'
  and not exists(select 1 from public.kinto_deals_v1_submissions s where s.campaign_id=c.id)) then raise exception 'DEALS_DRAFT_NOT_EDITABLE' using errcode='40001'; end if;
 if exists(
  select 1 from jsonb_each(p_product_options) j
  where jsonb_typeof(j.value)<>'object' or length(j.value::text)>3000
   or not exists(select 1 from public.kinto_deals_v1_products cp where cp.campaign_id=p_campaign_id and cp.product_id::text=j.key)
 ) then raise exception 'DEALS_INVALID_PRODUCT_OPTIONS' using errcode='22023'; end if;
 for v_item in
  select cp.product_id,coalesce(p_product_options->cp.product_id::text,'{}'::jsonb) selected_options
  from public.kinto_deals_v1_products cp where cp.campaign_id=p_campaign_id
 loop
  perform private.kinto_deals_v1_assert_product_available_g21b(v_store,v_item.product_id,v_item.selected_options,1);
 end loop;
 update public.kinto_deals_v1_products cp
 set selected_options=coalesce(p_product_options->cp.product_id::text,'{}'::jsonb)
 where cp.campaign_id=p_campaign_id;
 get diagnostics v_count=row_count;
 return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'product_count',v_count);
end;
$g20$;
revoke all on function public.kinto_deals_v1_vendor_set_product_options_g20(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_set_product_options_g20(text,uuid,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
commit;
