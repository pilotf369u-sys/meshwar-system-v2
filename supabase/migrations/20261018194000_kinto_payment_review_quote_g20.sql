-- G20-A: customer-visible, server-priced checkout review only.
-- This migration creates no reservation, payment intent, or order. Existing
-- checkout/V97/V161 and all paid-order/inventory triggers remain unchanged.
begin;

create table if not exists public.kinto_payment_quotes_g20 (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  cart_fingerprint text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  amount numeric(20,4) not null check (amount > 0),
  quote_snapshot jsonb not null check (jsonb_typeof(quote_snapshot)='object'),
  status text not null default 'preview' check (status in ('preview','reserved','consumed','expired','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists kinto_payment_quotes_g20_customer_created_idx
  on public.kinto_payment_quotes_g20(customer_id,created_at desc);
alter table public.kinto_payment_quotes_g20 enable row level security;
revoke all on public.kinto_payment_quotes_g20 from public,anon,authenticated;

create or replace function private.kinto_payment_options_valid_g20(p_options jsonb,p_selected jsonb)
returns boolean language plpgsql immutable
set search_path=pg_catalog,public as $options$
declare d record; raw_values jsonb; stock_values jsonb; values_list text[]; chosen text; raw_text text;
begin
  if jsonb_typeof(coalesce(p_options,'{}'::jsonb)) is distinct from 'object'
     or jsonb_typeof(coalesce(p_selected,'{}'::jsonb)) is distinct from 'object' then return false; end if;
  for d in select * from (values ('color','colors'),('size','sizes'),('volume','volumes')) v(singular,plural) loop
    raw_values:=p_options->d.plural;
    stock_values:=coalesce(p_options->'variant_stock'->d.singular,p_options->'variant_stock'->d.plural);
    values_list:=array[]::text[];
    if jsonb_typeof(raw_values)='array' then
      select coalesce(array_agg(distinct btrim(value)),array[]::text[]) into values_list
      from jsonb_array_elements_text(raw_values) e(value) where btrim(value)<>'';
    elsif jsonb_typeof(raw_values)='string' then
      raw_text:=raw_values#>>'{}';
      values_list:=array(select distinct btrim(x) from regexp_split_to_table(raw_text,'[,،\r\n]+') x where btrim(x)<>'');
    end if;
    if coalesce(jsonb_typeof(stock_values),'')='object' then
      values_list:=array(select distinct x from unnest(values_list||array(select jsonb_object_keys(stock_values))) x where x<>'');
    end if;
    chosen:=nullif(btrim(coalesce(p_selected->>d.singular,'')),'');
    if coalesce(array_length(values_list,1),0)>0 and (chosen is null or not chosen=any(values_list)) then return false; end if;
    if chosen is not null and (coalesce(array_length(values_list,1),0)=0 or not chosen=any(values_list)) then return false; end if;
  end loop;
  return true;
end;
$options$;
revoke all on function private.kinto_payment_options_valid_g20(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.kinto_payment_quote_g20(
  p_session_token text,
  p_items jsonb,
  p_coupon_selection jsonb default '{}'::jsonb
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private,extensions,pg_temp
as $quote$
declare
  v_customer text;
  v_item_count integer;
  v_currency_count integer;
  v_currency text;
  v_lines jsonb;
  v_stores jsonb;
  v_coupon_ids jsonb:='{}'::jsonb;
  v_snapshot jsonb;
  v_fingerprint text;
  v_quote public.kinto_payment_quotes_g20%rowtype;
  v_coupon record;
  v_variant record;
  v_matrix record;
  v_product record;
  v_store_subtotal numeric;
  v_max_coupon numeric;
  v_ratio numeric;
  v_coupon_unit bigint;
  v_needed integer;
  v_coupon_count integer;
  v_selected_ids uuid[];
  v_amount numeric;
  v_now timestamptz:=clock_timestamp();
begin
  v_customer:=private.require_customer_review_session(p_session_token)::text;
  if coalesce(v_customer,'')='' then raise exception 'PAYMENT_CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
  if jsonb_typeof(p_items) is distinct from 'array'
     or jsonb_array_length(p_items)<1 or jsonb_array_length(p_items)>100
     or jsonb_typeof(coalesce(p_coupon_selection,'{}'::jsonb)) is distinct from 'object' then
    raise exception 'PAYMENT_QUOTE_INVALID_INPUT' using errcode='22023';
  end if;
  if exists(
    select 1 from jsonb_array_elements(p_items) x(item)
    where jsonb_typeof(x.item) is distinct from 'object'
       or private.v94_uuid(x.item->>'store_id') is null
       or private.v94_uuid(x.item->>'product_id') is null
       or coalesce(x.item->>'quantity','') !~ '^[0-9]+$'
       or (x.item->>'quantity')::integer not between 1 and 1000
       or jsonb_typeof(coalesce(x.item->'selected_options','{}'::jsonb)) is distinct from 'object'
  ) then raise exception 'PAYMENT_QUOTE_ITEM_INVALID' using errcode='22023'; end if;
  v_item_count:=jsonb_array_length(p_items);
  if exists(
    select 1 from jsonb_array_elements(p_items) x(item)
    left join public.local_products p on p.id=private.v94_uuid(x.item->>'product_id')
      and p.store_id=private.v94_uuid(x.item->>'store_id')
    left join public.local_stores s on s.id=p.store_id
    where p.id is null or lower(coalesce(s.status,''))<>'active'
       or coalesce(p.is_out_of_stock,false)
       or coalesce(p.discount_price,p.base_price) is null
       or coalesce(p.discount_price,p.base_price)<0
       or coalesce(s.commission_rate,10)<0 or coalesce(s.commission_rate,10)>=100
       or coalesce(s.exchange_rate,0)<=0
       or not private.kinto_payment_options_valid_g20(p.options,coalesce(x.item->'selected_options','{}'::jsonb))
  ) then raise exception 'PAYMENT_QUOTE_PRODUCT_OR_VARIANT_UNAVAILABLE' using errcode='P0001'; end if;

  -- Lock existing product rows in the same UUID order as the paid-stock engine.
  -- This only protects this preview calculation; no stock is deducted or reserved.
  for v_product in
    select p.id,p.stock_quantity from public.local_products p
    where p.id in (select private.v94_uuid(x.item->>'product_id') from jsonb_array_elements(p_items) x(item))
    order by p.id for share
  loop
    if v_product.stock_quantity is not null and v_product.stock_quantity < (
      select sum((x.item->>'quantity')::integer) from jsonb_array_elements(p_items) x(item)
      where private.v94_uuid(x.item->>'product_id')=v_product.id
    ) then raise exception 'PAYMENT_QUOTE_INSUFFICIENT_PRODUCT_STOCK' using errcode='P0001'; end if;
  end loop;

  -- Quote-time check for every configured per-option stock bucket. Paid stock
  -- still changes only through the existing order transition/V47 lifecycle.
  for v_variant in
    select p.id as product_id,d.singular,d.choice,vs.stock_map,
      sum((x.item->>'quantity')::integer)::integer as requested
    from jsonb_array_elements(p_items) x(item)
    join public.local_products p on p.id=private.v94_uuid(x.item->>'product_id')
    cross join lateral (values
      ('color'::text,nullif(btrim(coalesce(x.item->'selected_options'->>'color','')),'')),
      ('size'::text,nullif(btrim(coalesce(x.item->'selected_options'->>'size','')),'')),
      ('volume'::text,nullif(btrim(coalesce(x.item->'selected_options'->>'volume','')),''))
    ) d(singular,choice)
    cross join lateral (select coalesce(p.options->'variant_stock'->d.singular,
      p.options->'variant_stock'->(d.singular||'s')) as stock_map) vs
    where d.choice is not null and jsonb_typeof(vs.stock_map)='object' and vs.stock_map ? d.choice
    group by p.id,d.singular,d.choice,vs.stock_map
  loop
    if coalesce(v_variant.stock_map->>v_variant.choice,'') !~ '^[0-9]+$'
       or (v_variant.stock_map->>v_variant.choice)::integer < v_variant.requested then
      raise exception 'PAYMENT_QUOTE_INSUFFICIENT_VARIANT_STOCK' using errcode='P0001';
    end if;
  end loop;

  -- Combination stock follows the same normalized option key used by V47.
  for v_matrix in
    with selections as (
      select p.id as product_id,public.meshwar_matrix_stock_key(jsonb_build_object(
        'color',coalesce(x.item->'selected_options'->>'color',''),
        'size',coalesce(x.item->'selected_options'->>'size',''),
        'volume',coalesce(x.item->'selected_options'->>'volume',''))) as matrix_key,
        p.options->'matrix_stock' as matrix_stock,
        sum((x.item->>'quantity')::integer)::integer as requested
      from jsonb_array_elements(p_items) x(item)
      join public.local_products p on p.id=private.v94_uuid(x.item->>'product_id')
      group by p.id,p.options,public.meshwar_matrix_stock_key(jsonb_build_object(
        'color',coalesce(x.item->'selected_options'->>'color',''),
        'size',coalesce(x.item->'selected_options'->>'size',''),
        'volume',coalesce(x.item->'selected_options'->>'volume','')))
    ) select * from selections
  loop
    if v_matrix.matrix_key is not null and coalesce(v_matrix.matrix_stock,'{}'::jsonb) ? v_matrix.matrix_key then
      if coalesce(v_matrix.matrix_stock->>v_matrix.matrix_key,'') !~ '^[0-9]+$'
         or (v_matrix.matrix_stock->>v_matrix.matrix_key)::integer < v_matrix.requested then
        raise exception 'PAYMENT_QUOTE_INSUFFICIENT_MATRIX_STOCK' using errcode='P0001';
      end if;
    end if;
  end loop;

  with priced as (
    select x.ordinality,s.id as store_id,s.store_name,
      upper(coalesce(nullif(s.exchange_target_currency,''),nullif(s.default_currency,''),'IQD')) as currency,
      p.id as product_id,p.product_name,p.image_url,
      jsonb_build_object('color',coalesce(x.item->'selected_options'->>'color',''),
        'size',coalesce(x.item->'selected_options'->>'size',''),
        'volume',coalesce(x.item->'selected_options'->>'volume','')) as selected_options,
      (x.item->>'quantity')::integer as quantity,
      ceil(ceil(coalesce(p.discount_price,p.base_price)::numeric/(1-coalesce(s.commission_rate,10)::numeric/100))*s.exchange_rate::numeric/1000)*1000 as unit_price,
      coalesce(p.discount_price,p.base_price)::numeric as vendor_price,
      s.commission_rate::numeric as commission_rate,s.exchange_rate::numeric as exchange_rate
    from jsonb_array_elements(p_items) with ordinality x(item,ordinality)
    join public.local_products p on p.id=private.v94_uuid(x.item->>'product_id')
      and p.store_id=private.v94_uuid(x.item->>'store_id')
    join public.local_stores s on s.id=p.store_id
  )
  select jsonb_agg(jsonb_build_object('store_id',store_id,'store_name',store_name,
      'product_id',product_id,'product_name',product_name,'product_image',image_url,
      'selected_options',selected_options,'quantity',quantity,'unit_price_minor',unit_price,
      'line_total_minor',unit_price*quantity,'currency',currency,
      'pricing_snapshot',jsonb_build_object('pricing_version','iqd_ceil_1000_v1',
        'vendor_price_usd',vendor_price,'commission_rate',commission_rate,
        'exchange_rate',exchange_rate,'captured_at',v_now)) order by ordinality),
      count(distinct currency),min(currency)
  into v_lines,v_currency_count,v_currency from priced;
  if v_currency_count<>1 then raise exception 'PAYMENT_QUOTE_MIXED_CURRENCY_UNSUPPORTED' using errcode='22023'; end if;
  if v_currency !~ '^[A-Z]{3}$' then raise exception 'PAYMENT_QUOTE_CURRENCY_INVALID' using errcode='22023'; end if;

  select max_order_ratio,coupon_unit into v_ratio,v_coupon_unit from public.kinto_loyalty_settings where id=1;
  if v_ratio is null or v_coupon_unit is null then raise exception 'PAYMENT_QUOTE_LOYALTY_SETTINGS_MISSING'; end if;
  for v_coupon in select key,value from jsonb_each_text(coalesce(p_coupon_selection,'{}'::jsonb)) loop
    if private.v94_uuid(v_coupon.key) is null or v_coupon.value !~ '^[0-9]+$'
       or v_coupon.value::bigint not in (1000,3000,5000) then
      raise exception 'PAYMENT_QUOTE_COUPON_SELECTION_INVALID' using errcode='22023';
    end if;
    select sum((item->>'line_total_minor')::numeric),min(item->>'currency')
      into v_store_subtotal,v_currency
    from jsonb_array_elements(v_lines) item where item->>'store_id'=v_coupon.key;
    if v_store_subtotal is null or v_currency<>'IQD' then raise exception 'PAYMENT_QUOTE_COUPON_STORE_INVALID'; end if;
    v_max_coupon:=floor(v_store_subtotal*v_ratio/v_coupon_unit)*v_coupon_unit;
    if v_coupon.value::numeric>v_max_coupon then raise exception 'PAYMENT_QUOTE_COUPON_EXCEEDS_STORE_LIMIT'; end if;
    v_needed:=(v_coupon.value::bigint/v_coupon_unit)::integer;
    select array_agg(q.id order by q.expires_at,q.issued_at),count(*) into v_selected_ids,v_coupon_count
    from (
      select c.id,c.expires_at,c.issued_at
      from public.kinto_loyalty_coupons c
      where c.customer_id=v_customer and c.currency='IQD' and c.status='active' and c.expires_at>v_now
        and ((c.campaign_id is null and c.store_id=v_coupon.key)
          or (c.campaign_id is not null and exists(
            select 1 from public.kinto_campaign_stores cs
            join public.kinto_campaigns ca on ca.id=cs.campaign_id
            where cs.campaign_id=c.campaign_id and cs.store_id=v_coupon.key and ca.status<>'cancelled'
          )))
      order by c.expires_at,c.issued_at limit v_needed
    ) q;
    if coalesce(v_coupon_count,0)<>v_needed then raise exception 'PAYMENT_QUOTE_COUPON_NOT_AVAILABLE'; end if;
    v_coupon_ids:=jsonb_set(v_coupon_ids,array[v_coupon.key],to_jsonb(v_selected_ids),true);
  end loop;

  select jsonb_agg(jsonb_build_object(
      'store_id',s.store_id,'store_name',s.store_name,'currency',s.currency,
      'subtotal_minor',s.subtotal,'discount_minor',coalesce((p_coupon_selection->>s.store_id)::numeric,0),
      'payable_minor',s.subtotal-coalesce((p_coupon_selection->>s.store_id)::numeric,0),
      'max_coupon_minor',case when s.currency='IQD' then floor(s.subtotal*v_ratio/v_coupon_unit)*v_coupon_unit else 0 end,
      'items',s.items) order by s.first_ordinal),
      sum(s.subtotal-coalesce((p_coupon_selection->>s.store_id)::numeric,0))
    into v_stores,v_amount
  from (
    select item->>'store_id' as store_id,max(item->>'store_name') as store_name,
      min(item->>'currency') as currency,sum((item->>'line_total_minor')::numeric) as subtotal,
      min((item->>'product_id')) as first_product,min(ord) as first_ordinal,
      jsonb_agg(item order by ord) as items
    from jsonb_array_elements(v_lines) with ordinality q(item,ord)
    group by item->>'store_id'
  ) s;
  if v_amount is null or v_amount<=0 then raise exception 'PAYMENT_QUOTE_AMOUNT_INVALID'; end if;
  if exists(select 1 from jsonb_each_text(coalesce(p_coupon_selection,'{}'::jsonb)) c
      where not exists(select 1 from jsonb_array_elements(v_stores) s where s->>'store_id'=c.key)) then
    raise exception 'PAYMENT_QUOTE_COUPON_STORE_NOT_IN_CART';
  end if;

  v_fingerprint:=md5(jsonb_build_object('customer_id',v_customer,'lines',v_lines,
    'coupons',coalesce(p_coupon_selection,'{}'::jsonb))::text);
  v_snapshot:=jsonb_build_object('quote_version','g20-review-1','stores',v_stores,
    'lines',v_lines,'coupon_selection',coalesce(p_coupon_selection,'{}'::jsonb),
    'coupon_ids',v_coupon_ids,'shipping_included',false,'currency',v_currency,
    'amount',v_amount,'created_at',v_now);
  insert into public.kinto_payment_quotes_g20(customer_id,cart_fingerprint,currency,amount,quote_snapshot,expires_at)
    values(v_customer,v_fingerprint,v_currency,v_amount,v_snapshot,v_now+interval '10 minutes')
    returning * into v_quote;

  return jsonb_build_object('quote_id',v_quote.id,'status',v_quote.status,
    'expires_at',v_quote.expires_at,'currency',v_currency,
    'subtotal_minor',(select sum((item->>'line_total_minor')::numeric) from jsonb_array_elements(v_lines) item),
    'discount_minor',(select sum((s->>'discount_minor')::numeric) from jsonb_array_elements(v_stores) s),
    'payable_minor',v_amount,'stores',v_stores,'lines',v_lines,'shipping_included',false,
    'electronic_available',false,'quote_fingerprint',v_fingerprint);
end;
$quote$;
revoke all on function public.kinto_payment_quote_g20(text,jsonb,jsonb) from public;
grant execute on function public.kinto_payment_quote_g20(text,jsonb,jsonb) to anon,authenticated;
comment on function public.kinto_payment_quote_g20(text,jsonb,jsonb) is
'G20-A review-only quote. Server prices from V97 formula; verifies options, total/variant/matrix stock and store-scoped V310/V401 coupons. Does not reserve stock, consume coupons, create an intent/order, or enable payment.';

notify pgrst,'reload schema';
commit;
