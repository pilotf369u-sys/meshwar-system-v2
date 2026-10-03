-- G5I: lifecycle of a previously reserved DEALS redemption, additive and flag OFF.
-- AFTER status update sees the canonical V93 BEFORE UPDATE stock lifecycle result.
-- Does not change stock, invoices, ordinary order status or the existing cancellation path.
begin;
create or replace function private.kinto_deals_v1_redemption_lifecycle_g5i()
returns trigger language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare
 v_d jsonb;
 v_paid boolean;
 v_cancel boolean;
begin
 if new.status is not distinct from old.status then return new;end if;
 -- Fast no-op for every ordinary order: no reservation, no action.
 if not exists(select 1 from public.kinto_deals_v1_redemptions r
   where r.order_id=new.id and r.state='pending') then return new;end if;
 v_d:=coalesce(nullif(new.details,'')::jsonb,'{}'::jsonb);
 if v_d->>'source'<>'local_cart_bundle'
  or v_d->>'checkout_contract'<>'independent_vendor_orders' then
  raise exception 'DEALS_LIFECYCLE_ORDER_CONTRACT_INVALID' using errcode='P0001';end if;
 v_paid:=new.status='تم التسديد'
  and v_d->>'bundle_stock_lifecycle_state'='deducted';
 v_cancel:=new.status in ('ملغي','ملغي من قبل العميل','رفض الطلب','مرفوض')
  and old.status<>'تم التسديد'
  and coalesce(v_d->>'bundle_stock_lifecycle_state','')<>'deducted';
 if v_paid then
  update public.kinto_deals_v1_redemptions r
   set state='confirmed',updated_at=now(),
    frozen_snapshot=r.frozen_snapshot||jsonb_build_object(
     'confirmed_at',now(),'confirmation_order_status',new.status,
     'stock_lifecycle_state','deducted')
   where r.order_id=new.id and r.state='pending';
 elsif v_cancel then
  update public.kinto_deals_v1_redemptions r
   set state='released',updated_at=now(),
    frozen_snapshot=r.frozen_snapshot||jsonb_build_object(
     'released_at',now(),'release_order_status',new.status,
     'release_reason','canonical_pre_payment_cancellation')
   where r.order_id=new.id and r.state='pending';
 end if;
 -- After payment, a later status change NEVER releases or reverses a redemption.
 return new;
end;
$deals$;
revoke all on function private.kinto_deals_v1_redemption_lifecycle_g5i()
 from public,anon,authenticated;
drop trigger if exists trg_kinto_deals_v1_redemption_lifecycle_g5i on public.orders;
create trigger trg_kinto_deals_v1_redemption_lifecycle_g5i
 after update of status on public.orders for each row
 when (old.status is distinct from new.status)
 execute function private.kinto_deals_v1_redemption_lifecycle_g5i();
commit;
