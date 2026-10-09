-- V162: secure canonical finance reads/writes for V161 orders only.
begin;
create or replace function public.vendor_list_order_segments_v161(p_session_token text,p_limit integer default 100,p_offset integer default 0)
returns jsonb language sql security definer set search_path=public,private,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'segment_id',s.id,'order_id',s.order_id,'order_code',o.order_code,'order_created_at',o.created_at,
 'items_preview',s.items_snapshot,'quantity_total',s.quantity_total,'subtotal_local',s.subtotal_local,
 'currency',s.currency,'store_status',s.store_status,'confirmed_at',s.confirmed_at,
 'vendor_payment_status',s.vendor_payment_status,'commission_snapshot',s.commission_snapshot
 ) order by o.created_at desc),'[]'::jsonb)
 from public.order_store_segments s join public.orders o on o.id=s.order_id
 where s.store_id=private.require_vendor_session(p_session_token) and s.payment_confirmed
 limit least(greatest(coalesce(p_limit,100),1),200) offset greatest(coalesce(p_offset,0),0)
$$;
create or replace function public.admin_list_vendor_finance_v161(p_session_token text)
returns jsonb language sql security definer set search_path=public,private,pg_temp as $$
 with actor as (select private.require_admin_session_v147(p_session_token)),
 rows as (
 select s.id segment_id,s.store_id,s.store_name_snapshot,o.id order_id,o.order_code,o.created_at,
 s.subtotal_local,s.currency,s.vendor_payment_status,s.commission_snapshot
 from public.order_store_segments s join public.orders o on o.id=s.order_id
 cross join actor where o.status='تم التسليم' and s.commission_snapshot->>'version'='v161'
 )
 select coalesce(jsonb_agg(to_jsonb(rows) order by created_at desc),'[]'::jsonb) from rows
$$;
create or replace function public.admin_save_vendor_finance_v161(p_session_token text,p_segment_id uuid,p_other numeric,p_payment_status text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare snap jsonb; gross numeric; rate numeric; status text:=case when lower(trim(coalesce(p_payment_status,''))) in ('paid','مدفوع','settled') then 'paid' else 'pending' end;
begin
 perform private.require_admin_session_v147(p_session_token);
 if coalesce(p_other,-1)<0 then raise exception 'V161_OTHER_INVALID'; end if;
 select commission_snapshot into snap from public.order_store_segments where id=p_segment_id for update;
 if coalesce(snap->>'version','')<>'v161' then raise exception 'V161_SEGMENT_NOT_FOUND'; end if;
 gross:=coalesce((snap->>'gross_amount')::numeric,0); rate:=coalesce((snap->>'commission_rate')::numeric,0);
 snap:=snap||jsonb_build_object('other_deductions',p_other,'vendor_payment_status',status,'net_amount',round(gross-(gross*rate/100)-p_other,2),'vendor_paid_at',case when status='paid' then now() else null end);
 update public.order_store_segments set commission_snapshot=snap,vendor_payment_status=status,updated_at=now() where id=p_segment_id;
 return snap;
end $$;
revoke all on function public.vendor_list_order_segments_v161(text,integer,integer),public.admin_list_vendor_finance_v161(text),public.admin_save_vendor_finance_v161(text,uuid,numeric,text) from public;
grant execute on function public.vendor_list_order_segments_v161(text,integer,integer),public.admin_list_vendor_finance_v161(text),public.admin_save_vendor_finance_v161(text,uuid,numeric,text) to anon,authenticated;
notify pgrst,'reload schema'; commit;