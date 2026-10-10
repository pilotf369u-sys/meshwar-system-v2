-- V166: read-only lifetime cards, using the same delivered rows as P&L.
begin;
create or replace function public.vendor_dashboard_summary_v166(p_session_token text)
returns jsonb language sql security definer
set search_path=public,private,pg_temp as $$
 with identity as (select private.require_vendor_session(p_session_token) sid),
 rows as (
 select r.*,s.vendor_payment_status,s.vendor_settlement_archive_id,
 (r.financial->>'gross_amount')::numeric sales,
 (r.financial->>'commission_amount')::numeric commission,
 (r.financial->>'other_deductions')::numeric other,
 (r.financial->>'net_amount')::numeric net
 from identity i
 cross join lateral private.vendor_profit_rows_v165(i.sid,'',null,null) r
 join public.order_store_segments s on s.id=r.segment_id and s.store_id=i.sid
 ), checked as (
 select *,coalesce(sales is not null and commission is not null and other is not null
 and net is not null and abs(sales-commission-other-net)<=0.011,false) financial_ready
 from rows
 ), totals as (
 select currency,count(*) orders,
 count(*) filter(where not (financial_ready and cost_frozen and coalesce(total_cost_local>=0,false))) incomplete_orders,
 count(*) filter(where not financial_ready) invalid_financial_orders,
 coalesce(sum(sales) filter(where financial_ready),0) sales,
 coalesce(sum(commission) filter(where financial_ready),0) commission,
 coalesce(sum(net) filter(where financial_ready and (vendor_settlement_archive_id is not null or vendor_payment_status='paid')),0) paid,
 coalesce(sum(net) filter(where financial_ready and vendor_settlement_archive_id is null and vendor_payment_status is distinct from 'paid'),0) pending,
 coalesce(sum(net-total_cost_local-expense_total) filter(where financial_ready and cost_frozen and total_cost_local>=0),0) profit
 from checked group by currency
 )
 select jsonb_build_object('currencies',coalesce(jsonb_agg(to_jsonb(totals) order by currency),'[]'::jsonb)) from totals
$$;
revoke all on function public.vendor_dashboard_summary_v166(text) from public;
grant execute on function public.vendor_dashboard_summary_v166(text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
