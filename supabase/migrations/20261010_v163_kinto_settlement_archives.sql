-- V163: immutable KINTO settlement-statement archive for V161 vendor finance.
begin;

create table if not exists public.vendor_settlement_archives_v163 (
  id uuid primary key default gen_random_uuid(),
  statement_no text not null unique,
  store_id uuid not null references public.local_stores(id),
  store_name_snapshot text not null,
  store_logo_url_snapshot text,
  platform_name text not null default 'KINTO',
  platform_logo_url_snapshot text,
  currency text not null default 'IQD',
  gross_amount numeric not null default 0,
  commission_amount numeric not null default 0,
  other_deductions numeric not null default 0,
  net_amount numeric not null default 0,
  order_count integer not null default 0,
  segment_ids jsonb not null default '[]'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.order_store_segments add column if not exists vendor_settlement_archive_id uuid references public.vendor_settlement_archives_v163(id);
create index if not exists idx_v163_archives_store_created on public.vendor_settlement_archives_v163(store_id,created_at desc);
create index if not exists idx_v163_segments_archive on public.order_store_segments(vendor_settlement_archive_id);

create or replace function public.admin_archive_vendor_settlement_v163(
 p_session_token text,p_store_id uuid,p_segment_ids uuid[],p_platform_logo_url text default null
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare v_store record; v_rows jsonb; v_count integer; v_gross numeric; v_commission numeric; v_other numeric; v_net numeric; v_id uuid:=gen_random_uuid(); v_no text;
begin
 perform private.require_admin_session_v147(p_session_token);
 if p_store_id is null or coalesce(array_length(p_segment_ids,1),0)=0 then raise exception 'V163_ARCHIVE_SELECTION_REQUIRED'; end if;
 select id,store_name,logo_url into v_store from public.local_stores where id=p_store_id;
 if not found then raise exception 'V163_STORE_NOT_FOUND'; end if;
 select count(*),coalesce(sum(coalesce((commission_snapshot->>'gross_amount')::numeric,subtotal_local,0)),0),
   coalesce(sum(coalesce((commission_snapshot->>'commission_amount')::numeric,0)),0),
   coalesce(sum(coalesce((commission_snapshot->>'other_deductions')::numeric,0)),0)
 into v_count,v_gross,v_commission,v_other
 from public.order_store_segments
 where id=any(p_segment_ids) and store_id=p_store_id and vendor_settlement_archive_id is null
   and vendor_payment_status='paid' and commission_snapshot->>'version'='v161' for update;
 if v_count<>array_length(p_segment_ids,1) then raise exception 'V163_ONLY_UNARCHIVED_PAID_V161_SEGMENTS_ALLOWED'; end if;
 v_net:=round(v_gross-v_commission-v_other,2);
 v_no:='KINTO-STL-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(v_id::text,'-',''),1,8));
 select coalesce(jsonb_agg(jsonb_build_object('segment_id',s.id,'order_id',s.order_id,'order_code',o.order_code,'order_date',o.created_at,'paid_at',s.commission_snapshot->>'vendor_paid_at','gross_amount',coalesce((s.commission_snapshot->>'gross_amount')::numeric,s.subtotal_local,0),'commission_rate',coalesce((s.commission_snapshot->>'commission_rate')::numeric,0),'commission_amount',coalesce((s.commission_snapshot->>'commission_amount')::numeric,0),'other_deductions',coalesce((s.commission_snapshot->>'other_deductions')::numeric,0),'net_amount',round(coalesce((s.commission_snapshot->>'gross_amount')::numeric,s.subtotal_local,0)-coalesce((s.commission_snapshot->>'commission_amount')::numeric,0)-coalesce((s.commission_snapshot->>'other_deductions')::numeric,0),2)) order by o.created_at),'[]'::jsonb)
 into v_rows from public.order_store_segments s join public.orders o on o.id=s.order_id where s.id=any(p_segment_ids);
 insert into public.vendor_settlement_archives_v163(id,statement_no,store_id,store_name_snapshot,store_logo_url_snapshot,platform_logo_url_snapshot,currency,gross_amount,commission_amount,other_deductions,net_amount,order_count,segment_ids,created_by)
 values(v_id,v_no,p_store_id,v_store.store_name,v_store.logo_url,nullif(trim(coalesce(p_platform_logo_url,'')),''),'IQD',v_gross,v_commission,v_other,v_net,v_count,v_rows,null);
 update public.order_store_segments set vendor_settlement_archive_id=v_id,updated_at=now() where id=any(p_segment_ids);
 return (select to_jsonb(a) from public.vendor_settlement_archives_v163 a where a.id=v_id);
end $$;

create or replace function public.admin_list_vendor_settlement_archives_v163(p_session_token text)
returns jsonb language sql security definer set search_path=public,private,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb)
 from public.vendor_settlement_archives_v163 a cross join (select private.require_admin_session_v147(p_session_token)) guard
$$;
create or replace function public.vendor_list_settlement_archives_v163(p_session_token text)
returns jsonb language sql security definer set search_path=public,private,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb)
 from public.vendor_settlement_archives_v163 a where a.store_id=private.require_vendor_session(p_session_token)
$$;
create or replace function public.admin_list_vendor_finance_v163(p_session_token text)
returns jsonb language sql security definer set search_path=public,private,pg_temp as $$
 with actor as (select private.require_admin_session_v147(p_session_token)), rows as (
 select s.id segment_id,s.store_id,s.store_name_snapshot,o.id order_id,o.order_code,o.created_at,s.subtotal_local,s.currency,s.vendor_payment_status,s.commission_snapshot,s.vendor_settlement_archive_id
 from public.order_store_segments s join public.orders o on o.id=s.order_id cross join actor
 where o.status='تم التسليم' and s.commission_snapshot->>'version'='v161' and s.vendor_settlement_archive_id is null)
 select coalesce(jsonb_agg(to_jsonb(rows) order by created_at desc),'[]'::jsonb) from rows
$$;
create or replace function public.vendor_list_order_segments_v163(p_session_token text,p_limit integer default 100,p_offset integer default 0)
returns jsonb language sql security definer set search_path=public,private,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('segment_id',s.id,'order_id',s.order_id,'order_code',o.order_code,'order_created_at',o.created_at,'items_preview',s.items_snapshot,'quantity_total',s.quantity_total,'subtotal_local',s.subtotal_local,'currency',s.currency,'store_status',s.store_status,'confirmed_at',s.confirmed_at,'vendor_payment_status',s.vendor_payment_status,'commission_snapshot',s.commission_snapshot,'vendor_settlement_archive_id',s.vendor_settlement_archive_id) order by o.created_at desc),'[]'::jsonb)
 from public.order_store_segments s join public.orders o on o.id=s.order_id
 where s.store_id=private.require_vendor_session(p_session_token) and s.payment_confirmed
 limit least(greatest(coalesce(p_limit,100),1),200) offset greatest(coalesce(p_offset,0),0)
$$;
revoke all on function public.admin_archive_vendor_settlement_v163(text,uuid,uuid[],text),public.admin_list_vendor_settlement_archives_v163(text),public.vendor_list_settlement_archives_v163(text),public.admin_list_vendor_finance_v163(text),public.vendor_list_order_segments_v163(text,integer,integer) from public;
grant execute on function public.admin_archive_vendor_settlement_v163(text,uuid,uuid[],text),public.admin_list_vendor_settlement_archives_v163(text),public.vendor_list_settlement_archives_v163(text),public.admin_list_vendor_finance_v163(text),public.vendor_list_order_segments_v163(text,integer,integer) to anon,authenticated;
notify pgrst,'reload schema';
commit;