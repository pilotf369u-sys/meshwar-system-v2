-- Read-only, store-scoped delivery label. Does not change snapshots or order state.
begin;
create or replace function public.vendor_shipping_label_v167(
  p_session_token text, p_segment_id uuid
) returns jsonb
language plpgsql security definer
set search_path = public, private, pg_temp
as $$
declare
  v_store uuid := private.require_vendor_session(p_session_token);
  s public.order_store_segments%rowtype;
  o jsonb;
  c jsonb := '{}'::jsonb;
  d jsonb;
  snap jsonb;
  recipient jsonb := '{}'::jsonb;
  key text;
  value text;
  branch text;
begin
  select * into s from public.order_store_segments
  where id = p_segment_id and store_id = v_store and payment_confirmed = true;
  if s.id is null then
    raise exception 'ORDER_SEGMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  select to_jsonb(t) into o from public.orders t where t.id = s.order_id;
  if o is null then raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002'; end if;
  d := private.v94_jsonb_object(o->'details');
  snap := private.v94_jsonb_object(s.customer_snapshot);
  select to_jsonb(t) into c from public.customers t where t.id::text = o->>'customer_id';
  c := coalesce(c, '{}'::jsonb);
  -- Never return the customer row (wallet, credentials, rewards, etc.).
  foreach key in array array['name','code','phone','secondary_phone','phone2','customer_secondary_phone','customer_country','customer_address','country','governorate','province','state','city','area','district','neighborhood','address','address_details','full_address','delivery_address','landmark','nearest_landmark'] loop
    value := coalesce(nullif(btrim(snap->>key),''),
      nullif(btrim(d#>>array['customer',key]),''),
      nullif(btrim(o->>key),''),nullif(btrim(d->>key),''),
      nullif(btrim(c->>key),''));
    if value is not null then recipient := recipient || jsonb_build_object(key,value); end if;
  end loop;
  -- Canonical aliases preserve the frozen delivery address when live data differs.
  recipient := recipient || jsonb_strip_nulls(jsonb_build_object(
    'name', coalesce(nullif(snap->>'name',''),nullif(snap->>'customer_name',''),nullif(o->>'customer_name',''),nullif(d->>'customer_name',''),recipient->>'name'),
    'code', coalesce(nullif(snap->>'code',''),nullif(snap->>'customer_code',''),nullif(o->>'customer_code',''),nullif(d->>'customer_code',''),recipient->>'code'),
    'phone', coalesce(nullif(snap->>'phone',''),nullif(snap->>'customer_phone',''),nullif(o->>'customer_phone',''),nullif(d->>'customer_phone',''),recipient->>'phone'),
    'province', coalesce(nullif(snap->>'province',''),nullif(snap->>'governorate',''),nullif(snap->>'state',''),nullif(o->>'governorate',''),nullif(d->>'governorate',''),recipient->>'governorate',recipient->>'province',recipient->>'state'),
    'address', coalesce(nullif(snap->>'delivery_address',''),nullif(snap->>'address',''),nullif(snap->>'address_details',''),nullif(o->>'delivery_address',''),nullif(d->>'customer_address',''),recipient->>'address',recipient->>'address_details',recipient->>'full_address')
  ));
  select coalesce(to_jsonb(t)->>'name',to_jsonb(t)->>'branch_name') into branch
  from public.branches t where t.id::text = o->>'branch_id';
  return jsonb_build_object(
    'store_name',s.store_name_snapshot,'branch_name',branch,'customer',recipient,
    'order',jsonb_build_object(
      'id',s.order_id,'order_code',o->'order_code','reference_order_no',o->'reference_order_no',
      'created_at',o->'created_at','status',o->'status','store_name',s.store_name_snapshot,
      'customer_snapshot',recipient,'items',s.items_snapshot,
      'parcels_count',coalesce(nullif(o->'parcels_count','null'::jsonb),nullif(d->'parcels_count','null'::jsonb),'1'::jsonb),
      'delivery_payment_type',o->'delivery_payment_type','shipping_company_name',o->'shipping_company_name',
      'branch_name',coalesce(branch,o->>'branch_name',d->>'branch_name'),
      'delivery_notes',coalesce(nullif(o->'delivery_notes','null'::jsonb),nullif(d->'delivery_notes','null'::jsonb),d->'shipping_notes')
    )
  );
end;
$$;
revoke all on function public.vendor_shipping_label_v167(text,uuid) from public;
grant execute on function public.vendor_shipping_label_v167(text,uuid) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
