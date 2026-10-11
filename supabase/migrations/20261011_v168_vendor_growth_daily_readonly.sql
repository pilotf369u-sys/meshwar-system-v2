-- V168: vendor-only daily trend for real delivered V161 order data.
-- No writes to orders, finance, inventory or customer information.
begin;
create or replace function public.vendor_growth_daily_v168(
 p_session_token text, p_from date, p_to date
) returns jsonb language plpgsql volatile security definer
set search_path=public,private,pg_temp as $$
declare sid uuid; result jsonb;
begin
 sid:=private.require_vendor_session(p_session_token);
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365
 then raise exception 'VENDOR_GROWTH_DATE_RANGE_INVALID'; end if;
 with raw as (
  select (r.created_at at time zone 'Europe/Istanbul')::date as day,
    r.currency,
    (r.financial->>'gross_amount')::numeric as sales,
    (r.financial->>'commission_amount')::numeric as commission,
    (r.financial->>'other_deductions')::numeric as deductions,
    (r.financial->>'net_amount')::numeric as net,
    r.cost_frozen,r.total_cost_local,r.expense_total
  from private.vendor_profit_rows_v165(sid,'',p_from,p_to) r
 ), checked as (
  select *,coalesce(sales is not null and commission is not null
    and deductions is not null and net is not null
    and abs(sales-commission-deductions-net)<=0.011,false) valid
  from raw
 ), daily as (
  select day,currency,count(*) as delivered_orders,
    count(*) filter(where not valid) as invalid_financial_orders,
    coalesce(sum(sales) filter(where valid),0) as sales,
    coalesce(sum(commission) filter(where valid),0) as commission,
    coalesce(sum(deductions) filter(where valid),0) as deductions,
    coalesce(sum(net) filter(where valid),0) as net,
    coalesce(sum(net-total_cost_local-expense_total)
      filter(where valid and cost_frozen and total_cost_local>=0),0) as profit
  from checked group by day,currency
 )
 select jsonb_build_object('from',p_from,'to',p_to,
  'basis','delivered_v161_orders_by_creation_date',
  'days',coalesce(jsonb_agg(to_jsonb(daily) order by day,currency),'[]'::jsonb))
 into result from daily;
 return result;
end $$;
revoke all on function public.vendor_growth_daily_v168(text,date,date) from public,anon,authenticated;
grant execute on function public.vendor_growth_daily_v168(text,date,date) to anon,authenticated;
notify pgrst,'reload schema';
commit;
