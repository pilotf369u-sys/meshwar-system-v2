-- V164: isolated profit test for KN-000100. No historical data is deleted.
begin;
create table if not exists private.vendor_profit_costs_v164 (
 segment_id uuid primary key references public.order_store_segments(id),
 store_id uuid not null references public.local_stores(id),
 lines jsonb not null,
 total_cost_local numeric not null check(total_cost_local>=0),
 captured_at timestamptz not null default now()
);
create table if not exists private.vendor_profit_expenses_v164 (
 id uuid primary key default gen_random_uuid(),
 segment_id uuid not null references public.order_store_segments(id),
 store_id uuid not null references public.local_stores(id),
 amount numeric not null check(amount>0),
 category text not null,
 note text,
 created_at timestamptz not null default now()
);
revoke all on private.vendor_profit_costs_v164,private.vendor_profit_expenses_v164 from public,anon,authenticated;
alter table private.vendor_profit_costs_v164 enable row level security;
alter table private.vendor_profit_expenses_v164 enable row level security;

create or replace function public.vendor_profit_report_v164(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare sid uuid:=private.require_vendor_session(p_session_token); seg record; item jsonb; line jsonb; frozen record;
 financial jsonb; archived text; lines jsonb:='[]'; expenses jsonb; expense_total numeric;
 cost numeric; fx numeric; qty numeric; idx integer:=0; cost_total numeric:=0; complete boolean:=true;
begin
 select s.*,o.order_code,o.created_at order_created_at into seg
 from public.order_store_segments s join public.orders o on o.id=s.order_id
 where s.store_id=sid and o.order_code='KN-000100'
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
   if jsonb_typeof(seg.items_snapshot)<>'array' or jsonb_array_length(seg.items_snapshot)=0 then complete:=false; end if;
   for item in select value from jsonb_array_elements(seg.items_snapshot) loop
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

create or replace function public.vendor_profit_capture_cost_v164(p_session_token text,p_expected_lines jsonb)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare sid uuid:=private.require_vendor_session(p_session_token); report jsonb; o jsonb; total numeric; segid uuid;
begin
 -- Serialize capture and expense writes per store.
 perform 1 from public.local_stores where id=sid for update;
 report:=public.vendor_profit_report_v164(p_session_token);o:=report->'order';
 if o is null or o='null'::jsonb then raise exception 'PROFIT_ORDER_NOT_FOUND';end if;
 segid:=(o->>'segment_id')::uuid;
 if (o->>'cost_frozen')::boolean then return report;end if;
 if p_expected_lines is null or p_expected_lines<>o->'cost_lines' then raise exception 'PROFIT_COST_PREVIEW_CHANGED';end if;
 if not coalesce((o->>'cost_ready')::boolean,false) then raise exception 'PROFIT_COST_OR_ORDER_FX_MISSING';end if;
 select sum((x->>'cost_local')::numeric) into total from jsonb_array_elements(o->'cost_lines') x;
 if total is null then raise exception 'PROFIT_COST_MISSING';end if;
 insert into private.vendor_profit_costs_v164(segment_id,store_id,lines,total_cost_local)
 values(segid,sid,o->'cost_lines',total);
 return public.vendor_profit_report_v164(p_session_token);
end $$;

create or replace function public.vendor_profit_add_expense_v164(p_session_token text,p_amount numeric,p_category text,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare sid uuid:=private.require_vendor_session(p_session_token); report jsonb; o jsonb;
begin
 perform 1 from public.local_stores where id=sid for update;
 if p_amount is null or p_amount<=0 or p_amount='NaN'::numeric or p_amount>1000000000
 or p_amount<>round(p_amount,2) then raise exception 'PROFIT_EXPENSE_INVALID';end if;
 if length(trim(coalesce(p_category,''))) not between 1 and 100 or length(coalesce(p_note,''))>1000 then raise exception 'PROFIT_EXPENSE_TEXT_INVALID';end if;
 report:=public.vendor_profit_report_v164(p_session_token);o:=report->'order';
 if o is null or o='null'::jsonb then raise exception 'PROFIT_ORDER_NOT_FOUND';end if;
 insert into private.vendor_profit_expenses_v164(segment_id,store_id,amount,category,note)
 values((o->>'segment_id')::uuid,sid,p_amount,trim(p_category),nullif(trim(p_note),''));
 return public.vendor_profit_report_v164(p_session_token);
end $$;
revoke all on function public.vendor_profit_report_v164(text),public.vendor_profit_capture_cost_v164(text,jsonb),public.vendor_profit_add_expense_v164(text,numeric,text,text) from public;
grant execute on function public.vendor_profit_report_v164(text),public.vendor_profit_capture_cost_v164(text,jsonb),public.vendor_profit_add_expense_v164(text,numeric,text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
