-- V165: paginated P&L; immutable unit costs for future V161 checkouts.
begin;
create or replace function private.vendor_profit_detail_v165(sid uuid,p_segment_id uuid)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare seg record; item jsonb; line jsonb; frozen record;
 financial jsonb; archived text; lines jsonb:='[]'; expenses jsonb; expense_total numeric;
 cost numeric; fx numeric; qty numeric; idx integer:=0; cost_total numeric:=0; complete boolean:=true;
begin
 select s.*,o.order_code,o.created_at order_created_at into seg
 from public.order_store_segments s join public.orders o on o.id=s.order_id
 where s.store_id=sid and s.id=p_segment_id
 and s.commission_snapshot->>'version'='v161'
 and s.payment_confirmed and s.store_status='تم التسليم';
 if not found then return jsonb_build_object('order',null,'expenses','[]'::jsonb); end if;
 financial:=seg.commission_snapshot;
 if seg.vendor_settlement_archive_id is not null then
   select a.statement_no,x.value into archived,line
   from public.vendor_settlement_archives_v163 a
   cross join lateral jsonb_array_elements(a.segment_ids) x(value)
   where a.id=seg.vendor_settlement_archive_id and a.store_id=sid and x.value->>'segment_id'=seg.id::text;
   if not found then raise exception 'PROFIT_ARCHIVE_LINE_MISSING'; end if;
   financial:=line||jsonb_build_object('currency',seg.currency);
 end if;
 select * into frozen from private.vendor_profit_costs_v164 where segment_id=seg.id and store_id=sid;
 if found then
   lines:=frozen.lines;cost_total:=frozen.total_cost_local;
 else
   if coalesce(jsonb_typeof(seg.items_snapshot),'null')<>'array' or jsonb_array_length(seg.items_snapshot)=0 then complete:=false; end if;
   for item in select value from jsonb_array_elements(case when jsonb_typeof(seg.items_snapshot)='array' then seg.items_snapshot else '[]'::jsonb end) loop
     idx:=idx+1;cost:=null;fx:=null;qty:=null;
     select p.cost_price into cost from public.local_products p
     where p.id=private.v94_uuid(item->>'product_id') and p.store_id=sid;
     fx:=nullif(item->'pricing_snapshot'->>'exchange_rate','')::numeric;
     qty:=nullif(item->>'quantity','')::numeric;
     if cost is null or cost<0 or fx is null or fx<=0 or qty is null or qty<=0 then complete:=false;end if;
     lines:=lines||jsonb_build_array(jsonb_build_object('item_no',idx,'product_id',item->>'product_id',
       'product_name',item->>'product_name','quantity',qty,'unit_cost_usd',cost,
       'exchange_rate',fx,'cost_local',case when cost>=0 and fx>0 and qty>0 then round(cost*fx*qty,2) else null end));
   end loop;
 end if;
 select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at desc),'[]'::jsonb),coalesce(sum(e.amount),0)
 into expenses,expense_total from private.vendor_profit_expenses_v164 e where e.store_id=sid and e.segment_id=seg.id;
 return jsonb_build_object('order',jsonb_build_object('segment_id',seg.id,'order_code',seg.order_code,
 'created_at',seg.order_created_at,'currency',seg.currency,'financial',financial,
 'archive_id',seg.vendor_settlement_archive_id,'statement_no',archived,
 'cost_lines',lines,'cost_frozen',frozen.segment_id is not null,'cost_ready',complete,
 'total_cost_local',case when frozen.segment_id is not null then cost_total else null end,
 'cost_captured_at',frozen.captured_at),'expenses',expenses,'expense_total',expense_total);
end $$;


create or replace function public.vendor_profit_detail_v165(p_session_token text,p_segment_id uuid)
returns jsonb language sql security definer set search_path=public,private,pg_temp as $$
 select private.vendor_profit_detail_v165(private.require_vendor_session(p_session_token),p_segment_id)
$$;
create or replace function public.vendor_profit_capture_cost_v165(p_session_token text,p_segment_id uuid,p_expected_lines jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare sid uuid:=private.require_vendor_session(p_session_token); report jsonb; o jsonb; total numeric; segid uuid;
begin
 -- Serialize capture and expense writes per store.
 perform 1 from public.local_stores where id=sid for update;
 report:=private.vendor_profit_detail_v165(sid,p_segment_id);o:=report->'order';
 if o is null or o='null'::jsonb then raise exception 'PROFIT_ORDER_NOT_FOUND';end if;
 segid:=(o->>'segment_id')::uuid;
 if (o->>'cost_frozen')::boolean then return report;end if;
 if p_expected_lines is null or p_expected_lines<>o->'cost_lines' then raise exception 'PROFIT_COST_PREVIEW_CHANGED';end if;
 if not coalesce((o->>'cost_ready')::boolean,false) then raise exception 'PROFIT_COST_OR_ORDER_FX_MISSING';end if;
 select sum((x->>'cost_local')::numeric) into total from jsonb_array_elements(o->'cost_lines') x;
 if total is null then raise exception 'PROFIT_COST_MISSING';end if;
 insert into private.vendor_profit_costs_v164(segment_id,store_id,lines,total_cost_local)
 values(segid,sid,o->'cost_lines',total);
 return private.vendor_profit_detail_v165(sid,p_segment_id);
end $$;

create or replace function public.vendor_profit_add_expense_v165(p_session_token text,p_segment_id uuid,p_amount numeric,p_category text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare sid uuid:=private.require_vendor_session(p_session_token); report jsonb; o jsonb;
begin
 perform 1 from public.local_stores where id=sid for update;
 if p_amount is null or p_amount<=0 or p_amount='NaN'::numeric or p_amount>1000000000
 or p_amount<>round(p_amount,2) then raise exception 'PROFIT_EXPENSE_INVALID';end if;
 if length(trim(coalesce(p_category,''))) not between 1 and 100 or length(coalesce(p_note,''))>1000 then raise exception 'PROFIT_EXPENSE_TEXT_INVALID';end if;
 report:=private.vendor_profit_detail_v165(sid,p_segment_id);o:=report->'order';
 if o is null or o='null'::jsonb then raise exception 'PROFIT_ORDER_NOT_FOUND';end if;
 insert into private.vendor_profit_expenses_v164(segment_id,store_id,amount,category,note)
 values((o->>'segment_id')::uuid,sid,p_amount,trim(p_category),nullif(trim(p_note),''));
 return private.vendor_profit_detail_v165(sid,p_segment_id);
end $$;

create or replace function private.vendor_profit_rows_v165(sid uuid,p_query text,p_from date,p_to date)
returns table(segment_id uuid,order_code text,created_at timestamptz,currency text,financial jsonb,cost_frozen boolean,total_cost_local numeric,expense_total numeric,product_count integer)
language sql stable security definer set search_path=public,private,pg_temp as $$
 select s.id,o.order_code,o.created_at,s.currency,
 case when s.vendor_settlement_archive_id is null then s.commission_snapshot else al.value end,
 c.segment_id is not null,c.total_cost_local,coalesce(e.total,0),
 case when jsonb_typeof(s.items_snapshot)='array' then jsonb_array_length(s.items_snapshot) else 0 end
 from public.order_store_segments s join public.orders o on o.id=s.order_id
 left join private.vendor_profit_costs_v164 c on c.segment_id=s.id and c.store_id=sid
 left join lateral (
  select x.value from public.vendor_settlement_archives_v163 a
  cross join lateral jsonb_array_elements(a.segment_ids) x(value)
  where a.id=s.vendor_settlement_archive_id and a.store_id=sid
  and x.value->>'segment_id'=s.id::text limit 1
 ) al on true
 left join lateral (
  select sum(amount) total from private.vendor_profit_expenses_v164
  where store_id=sid and segment_id=s.id
 ) e on true
 where s.store_id=sid and s.payment_confirmed and s.store_status='تم التسليم'
 and s.commission_snapshot->>'version'='v161'
 and (coalesce(trim(p_query),'')='' or position(lower(trim(p_query)) in lower(o.order_code))>0)
 and (p_from is null or o.created_at >= p_from::timestamp at time zone 'Europe/Istanbul')
 and (p_to is null or o.created_at < (p_to+1)::timestamp at time zone 'Europe/Istanbul')
$$;
create or replace function public.vendor_profit_list_v165(p_session_token text,p_page integer default 1,p_query text default '',p_from date default null,p_to date default null)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare sid uuid:=private.require_vendor_session(p_session_token); n integer; pg integer; rows jsonb; summary jsonb;
begin
 if p_from is not null and p_to is not null and p_from>p_to then raise exception 'PROFIT_DATE_RANGE_INVALID';end if;
 if length(coalesce(p_query,''))>100 then raise exception 'PROFIT_SEARCH_INVALID';end if;
 select count(*) into n from private.vendor_profit_rows_v165(sid,p_query,p_from,p_to);
 pg:=least(greatest(coalesce(p_page,1),1),greatest(1,ceil(n/5.0)::integer));
 select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.segment_id desc),'[]'::jsonb) into rows
 from (select * from private.vendor_profit_rows_v165(sid,p_query,p_from,p_to)
 order by created_at desc,segment_id desc limit 5 offset (pg-1)*5) r;
 with a as (
 select *, (financial->>'gross_amount')::numeric sales,(financial->>'commission_amount')::numeric commission,
 (financial->>'other_deductions')::numeric other,(financial->>'net_amount')::numeric net
 from private.vendor_profit_rows_v165(sid,p_query,p_from,p_to)
 ), b as (
 select *,cost_frozen and total_cost_local>=0 and sales is not null and commission is not null
 and other is not null and net is not null and abs(sales-commission-other-net)<=0.011 complete from a
 ), c as (
 select currency,count(*) orders,count(*) filter(where complete) complete_orders,
 count(*) filter(where not coalesce(complete,false)) incomplete_orders,
 sum(sales) sales,sum(commission) commission,sum(other) other,sum(net) net,
 sum(total_cost_local) filter(where complete) cost,
 sum(expense_total) expenses,
 sum(net-total_cost_local-expense_total) filter(where complete) profit
 from b group by currency
 ) select coalesce(jsonb_agg(to_jsonb(c) order by currency),'[]'::jsonb) into summary from c;
 return jsonb_build_object('rows',rows,'summary',summary,'total',n,'page',pg,'page_size',5,'pages',greatest(1,ceil(n/5.0)::integer));
end $$;

-- Record product unit cost at creation, after V161 stamps finance.
-- Do not block checkout for missing costs or modify price, quantity, or state.
create or replace function private.v165_stamp_unit_cost()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare d jsonb; item jsonb; items jsonb:='[]'; cost numeric; sid uuid;
begin
 if current_setting('app.v161_finance_checkout',true) is distinct from 'on' then return new;end if;
 d:=new.details::jsonb;
 if coalesce(d->>'vendor_finance_version','')<>'v161' or jsonb_typeof(d->'items')<>'array' then return new;end if;
 sid:=private.v94_uuid(d->>'store_id');
 for item in select value from jsonb_array_elements(d->'items') loop
  cost:=null;
  select cost_price into cost from public.local_products where id=private.v94_uuid(item->>'product_id') and store_id=sid;
  if cost<0 or cost::text in ('NaN','Infinity','-Infinity') then cost:=null;end if;
  item:=jsonb_set(item,'{pricing_snapshot}',
   coalesce(item->'pricing_snapshot','{}'::jsonb)||jsonb_build_object('unit_cost_usd',cost,'cost_snapshot_version','v165'),true);
  items:=items||jsonb_build_array(item);
 end loop;
 new.details:=jsonb_set(d,'{items}',items)::text;
 return new;
end $$;
drop trigger if exists trg_v165_stamp_unit_cost on public.orders;
create trigger trg_v165_stamp_unit_cost before insert on public.orders
for each row execute function private.v165_stamp_unit_cost();

-- Aggregate the saved unit costs using final delivered quantities.
create or replace function private.v165_freeze_delivered_cost()
returns trigger language plpgsql security definer set search_path=public,private,pg_temp as $$
declare item jsonb; lines jsonb:='[]'; cost numeric; fx numeric; qty numeric; total numeric:=0; idx integer:=0;
begin
 if not coalesce(new.payment_confirmed,false) or new.store_status<>'تم التسليم'
 or coalesce(new.commission_snapshot->>'version','')<>'v161'
 or coalesce(jsonb_typeof(new.items_snapshot),'null')<>'array' or jsonb_array_length(new.items_snapshot)=0
 or exists(select 1 from private.vendor_profit_costs_v164 where segment_id=new.id) then return new;end if;
 for item in select value from jsonb_array_elements(new.items_snapshot) loop
  if coalesce(item->'pricing_snapshot'->>'cost_snapshot_version','')<>'v165' then return new;end if;
  cost:=nullif(item->'pricing_snapshot'->>'unit_cost_usd','')::numeric;
  fx:=nullif(item->'pricing_snapshot'->>'exchange_rate','')::numeric;qty:=nullif(item->>'quantity','')::numeric;
  if cost is null or cost<0 or fx is null or fx<=0 or qty is null or qty<=0
  or cost::text in ('NaN','Infinity','-Infinity') or fx::text in ('NaN','Infinity','-Infinity')
  or qty::text in ('NaN','Infinity','-Infinity') then return new;end if;
  idx:=idx+1;total:=total+round(cost*fx*qty,2);
  lines:=lines||jsonb_build_array(jsonb_build_object('item_no',idx,'product_id',item->>'product_id',
   'product_name',item->>'product_name','quantity',qty,'unit_cost_usd',cost,'exchange_rate',fx,'cost_local',round(cost*fx*qty,2)));
 end loop;
 insert into private.vendor_profit_costs_v164(segment_id,store_id,lines,total_cost_local)
 values(new.id,new.store_id,lines,total) on conflict(segment_id) do nothing;
 return new;
end $$;
drop trigger if exists trg_v165_freeze_delivered_cost on public.order_store_segments;
create trigger trg_v165_freeze_delivered_cost after insert or update of items_snapshot,store_status,payment_confirmed,commission_snapshot
on public.order_store_segments for each row execute function private.v165_freeze_delivered_cost();

revoke all on function private.vendor_profit_detail_v165(uuid,uuid),private.vendor_profit_rows_v165(uuid,text,date,date),
private.v165_stamp_unit_cost(),private.v165_freeze_delivered_cost() from public,anon,authenticated;
revoke all on function public.vendor_profit_list_v165(text,integer,text,date,date),public.vendor_profit_detail_v165(text,uuid),
public.vendor_profit_capture_cost_v165(text,uuid,jsonb),public.vendor_profit_add_expense_v165(text,uuid,numeric,text,text) from public;
grant execute on function public.vendor_profit_list_v165(text,integer,text,date,date),public.vendor_profit_detail_v165(text,uuid),
public.vendor_profit_capture_cost_v165(text,uuid,jsonb),public.vendor_profit_add_expense_v165(text,uuid,numeric,text,text) to anon,authenticated;
create index if not exists idx_profit_expenses_v165 on private.vendor_profit_expenses_v164(store_id,segment_id);
notify pgrst,'reload schema';
commit;
