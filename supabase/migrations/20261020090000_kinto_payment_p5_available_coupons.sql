begin;

-- Return only coupon tiers the signed-in customer can use for each store in
-- the server-priced cart. This is display guidance; quote/reserve still validate
-- eligibility and availability transactionally.
create or replace function private.kinto_payment_p5_coupon_options_v1(
 p_customer uuid,
 p_items jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp
as $coupon_options$
declare
 v_quote jsonb;
 v_currency text;
 v_coupon_unit bigint;
 v_store record;
 v_tier integer;
 v_coupon_count integer;
 v_tiers jsonb;
 v_result jsonb:='{}'::jsonb;
begin
 if p_customer is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 v_quote:=private.kinto_payment_p5_quote_v1(p_customer,p_items,'{}'::jsonb);
 v_currency:=upper(coalesce(v_quote->>'currency',''));
 select coupon_unit into v_coupon_unit from public.kinto_loyalty_settings where id=1;

 for v_store in
   select (x->>'store_id')::uuid as store_id,
          sum(coalesce((x->>'line_total_local')::numeric,0)) as product_total
     from jsonb_array_elements(coalesce(v_quote->'lines','[]'::jsonb)) x
    group by (x->>'store_id')::uuid
    order by (x->>'store_id')::uuid
 loop
   v_tiers:='[]'::jsonb;
   if v_currency='IQD' and coalesce(v_coupon_unit,0)>0 then
     select count(*) into v_coupon_count
       from public.kinto_loyalty_coupons q
      where q.customer_id=p_customer::text
        and q.currency=v_currency
        and q.status='active'
        and q.expires_at>now()
        and not exists(
          select 1 from private.kinto_payment_coupon_holds_p5 h
           where h.coupon_id=q.id
        )
        and (
          (q.campaign_id is null and q.store_id=v_store.store_id::text)
          or (q.campaign_id is not null and exists(
            select 1
              from public.kinto_campaign_stores cs
              join public.kinto_campaigns ca on ca.id=cs.campaign_id
             where cs.campaign_id=q.campaign_id
               and cs.store_id=v_store.store_id::text
               and ca.status<>'cancelled'
          ))
        )
        ;

     foreach v_tier in array array[1000,3000,5000] loop
       if v_tier%v_coupon_unit=0
          and v_tier<=floor(coalesce(v_store.product_total,0)*0.10)
          and v_coupon_count>=v_tier/v_coupon_unit then
         v_tiers:=v_tiers||to_jsonb(v_tier);
       end if;
     end loop;
   end if;
   v_result:=v_result||jsonb_build_object(v_store.store_id::text,v_tiers);
 end loop;
 return v_result;
end;
$coupon_options$;

revoke all on function private.kinto_payment_p5_coupon_options_v1(uuid,jsonb) from public,anon,authenticated;

create or replace function public.kinto_payment_p5_quote_v1(
 p_session_token text,
 p_items jsonb,
 p_coupon_points jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,extensions,pg_temp
as $public_quote$
declare
 cid uuid;
 q jsonb;
 v_options jsonb;
begin
 cid:=private.require_customer_review_session(p_session_token);
 if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
 q:=private.kinto_payment_p5_quote_v1(cid,p_items,p_coupon_points);
 v_options:=private.kinto_payment_p5_coupon_options_v1(cid,p_items);
 return q||jsonb_build_object(
   'customer_id',null,
   'available_coupon_points',v_options,
   'shipping_included',false,
   'shipping_note','الشحن غير مشمول ويُحدد لاحقاً'
 );
end;
$public_quote$;

revoke all on function public.kinto_payment_p5_quote_v1(text,jsonb,jsonb) from public;
grant execute on function public.kinto_payment_p5_quote_v1(text,jsonb,jsonb) to anon,authenticated;

notify pgrst,'reload schema';
commit;
