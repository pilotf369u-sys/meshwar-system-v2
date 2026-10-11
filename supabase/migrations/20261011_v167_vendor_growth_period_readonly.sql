-- KINTO vendor growth V167: read-only per-store aggregates, no visitor tracking.
-- Uses the existing V165 delivered-order financial source; does not alter orders or settlements.
begin;
create or replace function public.vendor_growth_period_v167(
  p_session_token text,
  p_from date,
  p_to date
) returns jsonb
language plpgsql stable security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store_id uuid;
  v_result jsonb;
begin
  v_store_id := private.require_vendor_session(p_session_token);
  if p_from is null or p_to is null or p_to < p_from
     or p_to - p_from > 365 then
    raise exception 'VENDOR_GROWTH_DATE_RANGE_INVALID';
  end if;

  with source_rows as (
    select r.currency, r.financial, r.cost_frozen, r.total_cost_local,
           r.expense_total, r.product_count
    from private.vendor_profit_rows_v165(v_store_id, '', p_from, p_to) r
  ), amounts as (
    select currency, cost_frozen, total_cost_local, expense_total, product_count,
      (financial->>'gross_amount')::numeric as sales,
      (financial->>'commission_amount')::numeric as commission,
      (financial->>'other_deductions')::numeric as deductions,
      (financial->>'net_amount')::numeric as net
    from source_rows
  ), verified as (
    select *,
      coalesce(sales is not null and commission is not null
        and deductions is not null and net is not null
        and abs(sales - commission - deductions - net) <= 0.011, false) as valid_financial
    from amounts
  ), grouped as (
    select currency,
      count(*) as delivered_orders,
      count(*) filter(where not valid_financial) as invalid_financial_orders,
      count(*) filter(where valid_financial and cost_frozen
        and coalesce(total_cost_local >= 0,false)) as profit_ready_orders,
      coalesce(sum(sales) filter(where valid_financial),0) as sales,
      coalesce(sum(commission) filter(where valid_financial),0) as commission,
      coalesce(sum(net) filter(where valid_financial),0) as net,
      coalesce(sum(net-total_cost_local-expense_total)
        filter(where valid_financial and cost_frozen and total_cost_local >= 0),0) as profit
    from verified
    group by currency
  )
  select jsonb_build_object(
    'from',p_from,'to',p_to,
    'basis','delivered_v161_orders_only',
    'visits_available',false,
    'currencies',coalesce(jsonb_agg(to_jsonb(grouped) order by currency),'[]'::jsonb)
  ) into v_result from grouped;
  return v_result;
end;
$$;
revoke all on function public.vendor_growth_period_v167(text,date,date) from public, anon, authenticated;
grant execute on function public.vendor_growth_period_v167(text,date,date) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
