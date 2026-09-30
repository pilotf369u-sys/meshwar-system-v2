-- V389 — restore the last proven customer reward read model after the used-order lookup regression.
-- Read-only rollback to the V384 payload. Reward balances, coupons, issuance, redemption and orders are unchanged.
create or replace function public.customer_loyalty_summary_v310(p_session_token text) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare cid text;visible_days integer;ratio numeric;unit bigint;
begin
 cid:=private.require_customer_review_session(p_session_token)::text; if coalesce(cid,'')='' then raise exception 'invalid customer session'; end if;
 select expired_visible_days,max_order_ratio,coupon_unit into visible_days,ratio,unit from public.kinto_loyalty_settings where id=1;
 return jsonb_build_object(
 'wallets',coalesce((select jsonb_agg(jsonb_build_object('store_id',w.store_id,'store_name',coalesce(s.store_name,w.store_id),'currency',w.currency,'progress_points',w.progress_points) order by coalesce(s.store_name,w.store_id),w.currency)
   from public.kinto_loyalty_wallets w left join public.local_stores s on s.id::text=w.store_id where w.customer_id=cid),'[]'::jsonb),
 'coupons',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'store_id',q.store_id,'store_name',coalesce(s.store_name,q.store_id),'currency',q.currency,'points',q.points,
   'status',case when q.status='used' then 'used' when q.expires_at<=now() then 'expired' else 'active' end,'issued_at',q.issued_at,'expires_at',q.expires_at,'used_at',q.used_at,'used_order_id',q.used_order_id,'funded_by',q.funded_by) order by q.issued_at desc)
   from public.kinto_loyalty_coupons q left join public.local_stores s on s.id::text=q.store_id
   where q.customer_id=cid and (q.status='used' or q.expires_at>now()-make_interval(days=>visible_days))),'[]'::jsonb),
 'eligible_orders',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'order_code',coalesce(o.order_code,o.reference_order_no,o.id::text),'store_id',public.kinto_order_store_id_v310(o),
   'currency',public.kinto_normalize_currency_v310(o.currency),'product_total',coalesce(o.total_price,0),
   'max_coupon',case when public.kinto_normalize_currency_v310(o.currency)='IQD' then floor(coalesce(o.total_price,0)*ratio/unit)*unit else 0 end,
   'redeemable_now',public.kinto_normalize_currency_v310(o.currency)='IQD','status',o.status) order by o.created_at desc)
   from public.orders o where o.customer_id::text=cid and public.kinto_order_store_id_v310(o) is not null
   and o.status in('بانتظار موافقة العميل','قيد الطلب','بانتظار الدفع','تمت الموافقة - بانتظار الدفع','تمت الموافقة')
   and coalesce(o.reward_discount_amount,0)=0),'[]'::jsonb));
end $$;
revoke all on function public.customer_loyalty_summary_v310(text) from public;
grant execute on function public.customer_loyalty_summary_v310(text) to anon,authenticated;
