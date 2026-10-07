-- V401 — campaign-wide KINTO coupon redemption
-- Extends redemption eligibility only for KINTO campaign coupons.
-- V310 vendor coupons remain strictly store-scoped. Shipping remains excluded and the 10% cap is unchanged.

create or replace function public.customer_apply_coupon_v310(
 p_session_token text,p_order_id text,p_points bigint
) returns jsonb
language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare
 cid text;o public.orders%rowtype;c text;sid text;ratio numeric;unit bigint;need integer;
 ids uuid[];cnt integer;cap bigint;vendor_points bigint:=0;kinto_points bigint:=0;fund text;
begin
 cid:=private.require_customer_review_session(p_session_token)::text;
 if coalesce(cid,'')='' then raise exception 'invalid customer session'; end if;
 if p_points not in(1000,3000,5000) then raise exception 'invalid coupon tier'; end if;

 select * into o from public.orders where id::text=p_order_id for update;
 if not found or o.customer_id::text<>cid then raise exception 'order not found'; end if;
 sid:=public.kinto_order_store_id_v310(o);
 if sid is null then raise exception 'store not found'; end if;
 if o.status not in('بانتظار موافقة العميل','قيد الطلب','بانتظار الدفع','تمت الموافقة - بانتظار الدفع','تمت الموافقة') then
   raise exception 'coupon not allowed at this order stage';
 end if;
 if coalesce(o.reward_discount_amount,0)>0 or coalesce(o.loyalty_points_redeemed,0)>0 then
   raise exception 'order already has reward discount';
 end if;

 c:=public.kinto_normalize_currency_v310(o.currency);
 if c<>'IQD' then raise exception 'KINTO_V310_COUPON_TIERS_IQD_ONLY'; end if;
 select max_order_ratio,coupon_unit into ratio,unit from public.kinto_loyalty_settings where id=1;
 cap:=floor(coalesce(o.total_price,0)*ratio);
 if p_points>cap then raise exception 'coupon exceeds 10 percent limit'; end if;
 need:=p_points/unit;

 -- Eligibility:
 -- 1) existing non-campaign coupon: exact same store only (V310 unchanged)
 -- 2) campaign coupon: target order store must participate in that same campaign
 select array_agg(id order by expires_at,issued_at),count(*) into ids,cnt
 from(
   select q.id,q.expires_at,q.issued_at
   from public.kinto_loyalty_coupons q
   where q.customer_id=cid
     and q.currency=c
     and q.status='active'
     and q.expires_at>now()
     and (
       (q.campaign_id is null and q.store_id=sid)
       or
       (q.campaign_id is not null and exists(
          select 1 from public.kinto_campaign_stores cs
          join public.kinto_campaigns ca on ca.id=cs.campaign_id
          where cs.campaign_id=q.campaign_id
            and cs.store_id=sid
            and ca.status<>'cancelled'
       ))
     )
   order by q.expires_at,q.issued_at
   for update of q skip locked
   limit need
 ) q;

 if coalesce(cnt,0)<>need then raise exception 'insufficient active eligible coupons'; end if;

 select
   coalesce(sum(points) filter(where funded_by='vendor'),0),
   coalesce(sum(points) filter(where funded_by='kinto'),0)
 into vendor_points,kinto_points
 from public.kinto_loyalty_coupons where id=any(ids);

 fund:=case
   when vendor_points>0 and kinto_points>0 then 'mixed'
   when kinto_points>0 then 'kinto'
   else 'vendor'
 end;

 update public.kinto_loyalty_coupons
 set status='used',used_order_id=o.id::text,used_at=now()
 where id=any(ids);

 update public.orders
 set loyalty_points_redeemed=p_points,
     reward_discount_amount=p_points,
     reward_discount_currency=c,
     reward_discount_snapshot=jsonb_build_object(
       'amount',p_points,'currency',c,'source','kinto_coupon_v401',
       'funded_by',fund,'vendor_points',vendor_points,'kinto_points',kinto_points,
       'store_id',sid,'points',p_points,'coupon_ids',to_jsonb(ids),
       'product_total',o.total_price,'shipping_discount',0
     )
 where id=o.id;

 insert into public.kinto_loyalty_ledger(
   customer_id,store_id,order_id,event_type,points,currency,
   eligible_product_total,note,funded_by,funding_snapshot
 )
 values(
   cid,sid,o.id::text,'redeem',-p_points,c,o.total_price,
   'customer_selected_eligible_coupon',fund,
   jsonb_build_object('vendor_points',vendor_points,'kinto_points',kinto_points,'coupon_ids',to_jsonb(ids))
 );

 return jsonb_build_object('ok',true,'points',p_points,'currency',c,'store_id',sid,'order_id',o.id);
end $$;

revoke all on function public.customer_apply_coupon_v310(text,text,bigint) from public;
grant execute on function public.customer_apply_coupon_v310(text,text,bigint) to anon,authenticated;

-- V401 customer read model: campaign coupons are advertised as redeemable for every
-- participating store while ordinary V310 coupons remain scoped to their source store.
create or replace function public.customer_loyalty_summary_v310(p_session_token text) returns jsonb
language plpgsql security definer
set search_path=public,private,extensions,pg_temp as $$
declare cid text;visible_days integer;ratio numeric;unit bigint;
begin
 cid:=private.require_customer_review_session(p_session_token)::text;
 if coalesce(cid,'')='' then raise exception 'invalid customer session'; end if;
 select expired_visible_days,max_order_ratio,coupon_unit into visible_days,ratio,unit
 from public.kinto_loyalty_settings where id=1;

 return jsonb_build_object(
 'wallets',coalesce((
   select jsonb_agg(jsonb_build_object(
     'store_id',w.store_id,'store_name',coalesce(s.store_name,w.store_id),
     'currency',w.currency,'progress_points',w.progress_points
   ) order by coalesce(s.store_name,w.store_id),w.currency)
   from public.kinto_loyalty_wallets w
   left join public.local_stores s on s.id::text=w.store_id
   where w.customer_id=cid
 ),'[]'::jsonb),

 'coupons',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',q.id,'store_id',q.store_id,'store_name',coalesce(s.store_name,q.store_id),
     'currency',q.currency,'points',q.points,
     'status',case when q.status='used' then 'used' when q.expires_at<=now() then 'expired' else 'active' end,
     'issued_at',q.issued_at,'expires_at',q.expires_at,'used_at',q.used_at,
     'used_order_id',q.used_order_id,'funded_by',q.funded_by,'campaign_id',q.campaign_id,
     'campaign_store_ids',case when q.campaign_id is null then '[]'::jsonb else coalesce((
       select jsonb_agg(cs.store_id order by cs.store_id)
       from public.kinto_campaign_stores cs where cs.campaign_id=q.campaign_id
     ),'[]'::jsonb) end
   ) order by q.issued_at desc)
   from public.kinto_loyalty_coupons q
   left join public.local_stores s on s.id::text=q.store_id
   where q.customer_id=cid
     and (q.status='used' or q.expires_at>now()-make_interval(days=>visible_days))
 ),'[]'::jsonb),

 'eligible_orders',coalesce((
   select jsonb_agg(jsonb_build_object(
     'id',o.id,'order_code',coalesce(o.order_code,o.reference_order_no,o.id::text),
     'store_id',public.kinto_order_store_id_v310(o),
     'currency',public.kinto_normalize_currency_v310(o.currency),
     'product_total',coalesce(o.total_price,0),
     'max_coupon',case when public.kinto_normalize_currency_v310(o.currency)='IQD'
       then floor(coalesce(o.total_price,0)*ratio/unit)*unit else 0 end,
     'redeemable_now',public.kinto_normalize_currency_v310(o.currency)='IQD',
     'status',o.status
   ) order by o.created_at desc)
   from public.orders o
   where o.customer_id::text=cid
     and public.kinto_order_store_id_v310(o) is not null
     and o.status in('بانتظار موافقة العميل','قيد الطلب','بانتظار الدفع','تمت الموافقة - بانتظار الدفع','تمت الموافقة')
     and coalesce(o.reward_discount_amount,0)=0
 ),'[]'::jsonb)
 );
end $$;

revoke all on function public.customer_loyalty_summary_v310(text) from public;
grant execute on function public.customer_loyalty_summary_v310(text) to anon,authenticated;

-- Restore campaign coupons on cancellation regardless of the store where they were redeemed.
-- Ordinary V310 coupons keep the original same-store restore rule.
create or replace function public.kinto_loyalty_order_v310() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare c text;sid text;r numeric;x numeric;whole bigint;carry numeric;enabled boolean;fund text;vendor_points numeric:=0;kinto_points numeric:=0;
begin
 sid:=public.kinto_order_store_id_v310(new); c:=public.kinto_normalize_currency_v310(new.currency);

 if new.status='تم التسليم' and coalesce(old.status,'')<>'تم التسليم' and sid is not null and coalesce(new.total_price,0)>0
 and not exists(select 1 from public.kinto_loyalty_ledger where order_id=new.id::text and store_id=sid and event_type='earn') then
   begin
     insert into public.kinto_store_loyalty_settings(store_id) values(sid) on conflict do nothing;
     select s.enabled,s.earn_rate into enabled,r from public.kinto_store_loyalty_settings s where s.store_id=sid;
     if enabled and coalesce(r,0)>0 and new.customer_id is not null then
       insert into public.kinto_loyalty_wallets(customer_id,store_id,currency) values(new.customer_id::text,sid,c) on conflict do nothing;
       select fractional_carry into carry from public.kinto_loyalty_wallets where customer_id=new.customer_id::text and store_id=sid and currency=c for update;
       x:=coalesce(new.total_price,0)*r+coalesce(carry,0); whole:=floor(x);carry:=x-whole;
       perform public.kinto_credit_points_v310(new.customer_id::text,sid,c,whole,carry,new.id::text);
       insert into public.kinto_loyalty_ledger(customer_id,store_id,order_id,event_type,points,currency,earn_rate_snapshot,eligible_product_total,note)
       values(new.customer_id::text,sid,new.id::text,'earn',whole,c,r,new.total_price,'delivered_store_order');
       new.loyalty_points_earned:=whole;
     end if;
   exception when others then
     raise warning 'KINTO_V310_EARN_SKIPPED order=% error=%',new.id,sqlerrm;
   end;
 end if;

 if coalesce(new.status,'') in('ملغي','ملغي من قبل العميل','رفض الطلب','مرفوض')
 and coalesce(old.status,'') not in('ملغي','ملغي من قبل العميل','رفض الطلب','مرفوض')
 and coalesce(new.loyalty_points_redeemed,0)>0 and sid is not null
 and not exists(select 1 from public.kinto_loyalty_ledger where order_id=new.id::text and store_id=sid and event_type='restore') then
   begin
     fund:=lower(trim(coalesce(new.reward_discount_snapshot->>'funded_by','')));
     if fund not in('vendor','kinto','mixed') then fund:=null; end if;
     if coalesce(new.reward_discount_snapshot->>'vendor_points','') ~ '^\\s*[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)\\s*$'
       then vendor_points:=(new.reward_discount_snapshot->>'vendor_points')::numeric; else vendor_points:=0; end if;
     if coalesce(new.reward_discount_snapshot->>'kinto_points','') ~ '^\\s*[+-]?([0-9]+(\\.[0-9]*)?|\\.[0-9]+)\\s*$'
       then kinto_points:=(new.reward_discount_snapshot->>'kinto_points')::numeric; else kinto_points:=0; end if;

     update public.kinto_loyalty_coupons
     set status='active',used_order_id=null,used_at=null
     where used_order_id=new.id::text and status='used'
       and (campaign_id is not null or store_id=sid);

     insert into public.kinto_loyalty_ledger(customer_id,store_id,order_id,event_type,points,currency,note,funded_by,funding_snapshot)
     values(new.customer_id::text,sid,new.id::text,'restore',new.loyalty_points_redeemed,coalesce(new.reward_discount_currency,c),
       'cancelled_order_original_expiry_restored',fund,
       jsonb_build_object('vendor_points',vendor_points,'kinto_points',kinto_points,
         'coupon_ids',coalesce(new.reward_discount_snapshot->'coupon_ids','[]'::jsonb),'restored_original_expiry',true));

     new.loyalty_points_redeemed:=0;
     new.reward_discount_amount:=0;
     new.reward_discount_currency:=null;
     new.reward_discount_snapshot:='{}'::jsonb;
   exception when others then
     raise warning 'KINTO_V310_RESTORE_SKIPPED order=% error=%',new.id,sqlerrm;
   end;
 end if;
 return new;
end $$;

-- Trigger definition remains exactly on status updates.
drop trigger if exists trg_kinto_loyalty_order_v310 on public.orders;
create trigger trg_kinto_loyalty_order_v310
before update of status on public.orders
for each row execute function public.kinto_loyalty_order_v310();

revoke all on function public.kinto_loyalty_order_v310() from public,anon,authenticated;
