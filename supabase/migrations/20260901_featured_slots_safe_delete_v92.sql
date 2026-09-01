-- KINTO V92 — Safe featured campaign delete RPC.
-- Scope: merchant_featured_slots only. No Auth/orders/shipping table mutation.

begin;

create or replace function public.admin_delete_merchant_featured_slot_v2(
  p_admin_id uuid,
  p_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare
  v_deleted uuid;
begin
  if p_admin_id is null or not public.meshwar_is_admin(p_admin_id) then
    raise exception 'not authorized';
  end if;

  if p_id is null then
    raise exception 'campaign id is required';
  end if;

  delete from public.merchant_featured_slots
  where id=p_id
  returning id into v_deleted;

  if v_deleted is null then
    raise exception 'campaign not found';
  end if;

  return true;
end;
$$;

revoke all on function public.admin_delete_merchant_featured_slot_v2(uuid,uuid) from public;
grant execute on function public.admin_delete_merchant_featured_slot_v2(uuid,uuid) to anon, authenticated;

notify pgrst, 'reload schema';
commit;
