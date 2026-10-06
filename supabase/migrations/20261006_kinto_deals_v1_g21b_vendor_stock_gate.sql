-- G21B: prevent merchant campaign drafts from selecting unavailable products/variants.
-- Campaign composer only. Reuses V93 stock helpers; no stock/order mutation.
begin;

create or replace function private.kinto_deals_v1_assert_product_available_g21b(
 p_store_id uuid,p_product_id uuid,p_selected_options jsonb,p_quantity integer default 1)
returns void language plpgsql stable security definer
set search_path=public,private,pg_temp as $g21b$
declare p public.local_products%rowtype; probe jsonb; opts jsonb;
begin
 if p_quantity is null or p_quantity<1 then raise exception 'DEALS_INVALID_STOCK_QUANTITY' using errcode='22023'; end if;
 select * into p from public.local_products where id=p_product_id and store_id=p_store_id;
 if not found then raise exception 'DEALS_PRODUCT_OWNERSHIP_REQUIRED' using errcode='23514'; end if;
 if coalesce(p.is_out_of_stock,false) or (p.stock_quantity is not null and p.stock_quantity<p_quantity) then
  raise exception 'DEALS_PRODUCT_OUT_OF_STOCK' using errcode='P0001'; end if;
 probe:=jsonb_build_object(
  'color',coalesce(p_selected_options->>'color',''),
  'size',coalesce(p_selected_options->>'size',''),
  'volume',coalesce(p_selected_options->>'volume',''));
 begin
  opts:=public.meshwar_adjust_variant_stock(coalesce(p.options,'{}'::jsonb),probe,p_quantity,-1);
  opts:=public.meshwar_adjust_matrix_stock(opts,probe,p_quantity,-1);
 exception when others then
  raise exception 'DEALS_PRODUCT_VARIANT_OUT_OF_STOCK' using errcode='P0001';
 end;
end;
$g21b$;
revoke all on function private.kinto_deals_v1_assert_product_available_g21b(uuid,uuid,jsonb,integer) from public,anon,authenticated;

-- Picker returns only products with at least one unit of aggregate stock.
create or replace function public.kinto_deals_v1_vendor_products_g4(
 p_session_token text,p_search text default '',p_limit integer default 30)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_store uuid; v_query text; v_rows jsonb;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_limit is null or p_limit not between 1 and 50 then raise exception 'DEALS_INVALID_PRODUCT_LIMIT' using errcode='22023'; end if;
 v_query:=left(btrim(coalesce(p_search,'')),70);
 select coalesce(jsonb_agg(to_jsonb(q) order by q.product_name,q.id),'[]'::jsonb)
 into v_rows from (
  select p.id,p.product_name,p.image_url,p.barcode,p.currency,p.base_price,p.discount_price,p.is_out_of_stock,p.stock_quantity
  from public.local_products p
  where p.store_id=v_store
   and not coalesce(p.is_out_of_stock,false)
   and (p.stock_quantity is null or p.stock_quantity>0)
   and (v_query='' or position(lower(v_query) in lower(coalesce(p.product_name,'')))>0
    or position(lower(v_query) in lower(coalesce(p.barcode,'')))>0)
  order by p.product_name,p.id limit p_limit
 ) q;
 return jsonb_build_object('store_id',v_store,'items',v_rows,'read_only',true);
end;
$deals$;
revoke all on function public.kinto_deals_v1_vendor_products_g4(text,text,integer) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_products_g4(text,text,integer) to anon,authenticated;

-- Option projection now exposes only option values that survive the canonical V93 stock probe.
create or replace function public.kinto_deals_v1_vendor_product_options_g20(
 p_session_token text,p_product_ids uuid[])
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $g20$
declare v_store uuid; v_rows jsonb;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_product_ids is null or cardinality(p_product_ids) not between 1 and 50 then raise exception 'DEALS_PRODUCT_LIST_REQUIRED' using errcode='22023'; end if;
 if (select count(*) from public.local_products p where p.store_id=v_store and p.id=any(p_product_ids))<>cardinality(p_product_ids) then
  raise exception 'DEALS_PRODUCT_OWNERSHIP_REQUIRED' using errcode='23514'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'options',jsonb_build_object(
  'colors',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(p.options->'colors','[]'::jsonb)) v
    where private.kinto_deals_v1_option_value_available_g21b(v_store,p.id,'color',v)),'[]'::jsonb),
  'sizes',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(p.options->'sizes','[]'::jsonb)) v
    where private.kinto_deals_v1_option_value_available_g21b(v_store,p.id,'size',v)),'[]'::jsonb),
  'volumes',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(p.options->'volumes','[]'::jsonb)) v
    where private.kinto_deals_v1_option_value_available_g21b(v_store,p.id,'volume',v)),'[]'::jsonb)
 )) order by p.id),'[]'::jsonb) into v_rows
 from public.local_products p where p.store_id=v_store and p.id=any(p_product_ids);
 return v_rows;
end;
$g20$;

create or replace function private.kinto_deals_v1_option_value_available_g21b(
 p_store_id uuid,p_product_id uuid,p_key text,p_value text)
returns boolean language plpgsql stable security definer
set search_path=public,private,pg_temp as $g21b$
begin
 perform private.kinto_deals_v1_assert_product_available_g21b(
  p_store_id,p_product_id,jsonb_build_object(p_key,p_value),1);
 return true;
exception when others then return false;
end;
$g21b$;
revoke all on function private.kinto_deals_v1_option_value_available_g21b(uuid,uuid,text,text) from public,anon,authenticated;

-- Replace after helper creation so option filtering resolves at execution.
create or replace function public.kinto_deals_v1_vendor_product_options_g20(
 p_session_token text,p_product_ids uuid[])
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $g20$
declare v_store uuid; v_rows jsonb;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_product_ids is null or cardinality(p_product_ids) not between 1 and 50 then raise exception 'DEALS_PRODUCT_LIST_REQUIRED' using errcode='22023'; end if;
 if (select count(*) from public.local_products p where p.store_id=v_store and p.id=any(p_product_ids))<>cardinality(p_product_ids) then
  raise exception 'DEALS_PRODUCT_OWNERSHIP_REQUIRED' using errcode='23514'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'options',jsonb_build_object(
  'colors',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(p.options->'colors','[]'::jsonb)) v where private.kinto_deals_v1_option_value_available_g21b(v_store,p.id,'color',v)),'[]'::jsonb),
  'sizes',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(p.options->'sizes','[]'::jsonb)) v where private.kinto_deals_v1_option_value_available_g21b(v_store,p.id,'size',v)),'[]'::jsonb),
  'volumes',coalesce((select jsonb_agg(v) from jsonb_array_elements_text(coalesce(p.options->'volumes','[]'::jsonb)) v where private.kinto_deals_v1_option_value_available_g21b(v_store,p.id,'volume',v)),'[]'::jsonb)
 )) order by p.id),'[]'::jsonb) into v_rows
 from public.local_products p where p.store_id=v_store and p.id=any(p_product_ids);
 return v_rows;
end;
$g20$;
revoke all on function public.kinto_deals_v1_vendor_product_options_g20(text,uuid[]) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_product_options_g20(text,uuid[]) to anon,authenticated;

-- Server gate: even stale UI cannot save zero-stock frozen options.
create or replace function public.kinto_deals_v1_vendor_set_product_options_g20(
 p_session_token text,p_campaign_id uuid,p_product_options jsonb)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $g20$
declare v_store uuid; v_count integer; e record;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if jsonb_typeof(p_product_options) is distinct from 'object' then raise exception 'DEALS_PRODUCT_OPTIONS_OBJECT_REQUIRED' using errcode='22023'; end if;
 if not exists(select 1 from public.kinto_deals_v1_campaigns c where c.id=p_campaign_id and c.store_id=v_store and c.status='draft'
  and not exists(select 1 from public.kinto_deals_v1_submissions s where s.campaign_id=c.id)) then raise exception 'DEALS_DRAFT_NOT_EDITABLE' using errcode='40001'; end if;
 if exists(select 1 from jsonb_each(p_product_options) e where jsonb_typeof(e.value)<>'object' or length(e.value::text)>3000
  or not exists(select 1 from public.kinto_deals_v1_products cp where cp.campaign_id=p_campaign_id and cp.product_id::text=e.key))
 then raise exception 'DEALS_INVALID_PRODUCT_OPTIONS' using errcode='22023'; end if;
 for e in select cp.product_id,coalesce(p_product_options->cp.product_id::text,'{}'::jsonb) selected_options
  from public.kinto_deals_v1_products cp where cp.campaign_id=p_campaign_id
 loop
  perform private.kinto_deals_v1_assert_product_available_g21b(v_store,e.product_id,e.selected_options,1);
 end loop;
 update public.kinto_deals_v1_products cp set selected_options=coalesce(p_product_options->cp.product_id::text,'{}'::jsonb)
 where cp.campaign_id=p_campaign_id;
 get diagnostics v_count=row_count;
 return jsonb_build_object('ok',true,'campaign_id',p_campaign_id,'product_count',v_count);
end;
$g20$;
revoke all on function public.kinto_deals_v1_vendor_set_product_options_g20(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_set_product_options_g20(text,uuid,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
commit;
