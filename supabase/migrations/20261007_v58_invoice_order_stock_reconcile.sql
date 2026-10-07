-- V58: reconcile existing independent local orders before customer approval.
-- No inventory writes, reservations, new statuses, or changes to V47 deduction.
begin;

create or replace function private.invoice_stock_projection_v58(p_order public.orders)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $v58$
declare
  d jsonb := coalesce(nullif(p_order.details::text,'')::jsonb,'{}'::jsonb);
  cache jsonb := '{}'::jsonb;
  p record; x jsonb; s jsonb; opts jsonb; selected jsonb; group_entry record;
  pid text; key text; chosen text; matrix_key text; normalized jsonb;
  requested integer; available integer; cap integer; total integer;
  old_line numeric; new_line numeric; loss numeric := 0; qty integer := 0;
  active_items jsonb := '[]'::jsonb; display_items jsonb := '[]'::jsonb;
  stores jsonb := '[]'::jsonb; loss_by_store jsonb := '{}'::jsonb;
  sid text; goods numeric; line_count integer := 0; line_index integer := 0; original_requested integer; v_changed boolean := false;
begin
  if d->>'source' is distinct from 'local_cart_bundle'
     or d->>'checkout_contract' is distinct from 'independent_vendor_orders' then
    raise exception 'V58_INDEPENDENT_LOCAL_ORDER_REQUIRED';
  end if;
  if jsonb_typeof(d->'items') is distinct from 'array' then
    raise exception 'V58_ITEMS_REQUIRED';
  end if;
  -- Match V47 lock order. This transaction only reads inventory.
  for p in
    select lp.id, lp.store_id, lp.stock_quantity, lp.options
    from public.local_products lp
    where lp.id in (select (item->>'product_id')::uuid
                   from jsonb_array_elements(d->'items') item)
    order by lp.id for update
  loop
    cache := jsonb_set(cache,array[p.id::text],jsonb_build_object(
      'stock',p.stock_quantity,'options',coalesce(p.options,'{}'::jsonb),
      'store_id',p.store_id),true);
  end loop;
  -- Retain zero rows solely in invoice history, never in active deduction items.
  select coalesce(jsonb_agg(v),'[]'::jsonb) into display_items
  from jsonb_array_elements(coalesce(d->'stock_adjustment_v58'->'display_items','[]'::jsonb)) v
  where coalesce((v->>'quantity')::integer,0)=0;
  for x in select value from jsonb_array_elements(d->'items') loop
    line_index := line_index + 1;
    pid := x->>'product_id';
    if pid is null or coalesce(x->>'quantity','') !~ '^[0-9]+$'
       or (x->>'quantity')::numeric < 1 or (x->>'quantity')::numeric > 1000000 then
      raise exception 'V58_INVALID_ITEM';
    end if;
    requested := (x->>'quantity')::integer;
    original_requested := coalesce((x->>'stock_requested_quantity_v58')::integer,requested);
    x := x || jsonb_build_object('stock_line_id_v58',coalesce((x->>'stock_line_id_v58')::integer,line_index),
         'stock_requested_quantity_v58',original_requested);
    available := requested;
    selected := coalesce(x->'selected_options','{}'::jsonb);
    if jsonb_typeof(selected) <> 'object' then raise exception 'V58_INVALID_OPTIONS'; end if;
    if not (cache ? pid) then
      available := 0;
    else
      if cache->pid->>'store_id' is distinct from coalesce(x->>'store_id',d->>'store_id') then
        raise exception 'V58_PRODUCT_STORE_MISMATCH';
      end if;
      total := (cache->pid->>'stock')::integer;
      opts := cache->pid->'options';
      -- Preserve V47 unmanaged-total semantics.
      if total is not null then
        available := least(available,greatest(0,total));
        for group_entry in select e.key,e.value from jsonb_each(coalesce(opts->'variant_stock','{}'::jsonb)) e loop
          if jsonb_typeof(group_entry.value) <> 'object' then raise exception 'V58_INVALID_STOCK_GROUP'; end if;
          key := case group_entry.key when 'colors' then 'color' when 'sizes' then 'size'
                 when 'volumes' then 'volume' else group_entry.key end;
          chosen := coalesce(nullif(selected->>key,''),nullif(selected->>group_entry.key,''),
                      nullif(x->>key,''),nullif(x->>('selected_'||key),''));
          if chosen is not null and group_entry.value ? chosen then
            cap := (group_entry.value->>chosen)::integer;
            available := least(available,greatest(0,coalesce(cap,0)));
          end if;
        end loop;
        normalized := '{}'::jsonb;
        foreach key in array array['color','size','volume'] loop
          chosen := coalesce(nullif(selected->>key,''),nullif(x->>key,''),nullif(x->>('selected_'||key),''),'');
          normalized := jsonb_set(normalized,array[key],to_jsonb(chosen),true);
        end loop;
        matrix_key := public.meshwar_matrix_stock_key(normalized);
        if matrix_key is not null and coalesce(opts->'matrix_stock','{}'::jsonb) ? matrix_key then
          cap := (opts->'matrix_stock'->>matrix_key)::integer;
          available := least(available,greatest(0,coalesce(cap,0)));
        end if;
        if available > 0 then
          opts := public.kinto_apply_option_stock_v47(opts,x,available);
          cache := jsonb_set(cache,array[pid,'options'],opts,false);
        end if;
        cache := jsonb_set(cache,array[pid,'stock'],to_jsonb(total-available),false);
      end if;
    end if;
    -- Keep submitted pricing snapshots; never accept browser prices.
    old_line := coalesce((x->>'line_total_local')::numeric,
                        (x->>'unit_price_local')::numeric*requested);
    if old_line is null or old_line < 0 then raise exception 'V58_INVALID_PRICE'; end if;
    new_line := round(old_line*available/requested,2);
    v_changed := v_changed or available < requested;
    loss := loss + old_line-new_line;
    sid := coalesce(x->>'store_id',d->>'store_id');
    loss_by_store := jsonb_set(loss_by_store,array[sid],to_jsonb(
      coalesce((loss_by_store->>sid)::numeric,0)+old_line-new_line),true);
    x := x || jsonb_build_object('quantity',available,'line_total_local',new_line);
    if available < original_requested then
      x := x || jsonb_build_object('_invoiceRequestedV57',original_requested,'_invoiceAvailableV57',available);
    end if;
    display_items := display_items || jsonb_build_array(x);
    if available > 0 then
      active_items := active_items || jsonb_build_array(x - '_invoiceRequestedV57' - '_invoiceAvailableV57');
      qty := qty + available;
      line_count := line_count + 1;
    end if;
  end loop;
  select coalesce(jsonb_agg(v order by (v->>'stock_line_id_v58')::integer),'[]'::jsonb) into display_items
  from jsonb_array_elements(display_items) v;
  goods := greatest(0,round(coalesce(p_order.total_price,0)-loss,2));
  if not v_changed then
    return jsonb_build_object('changed',false,'details',d,'total_price',p_order.total_price);
  end if;
  for s in select value from jsonb_array_elements(coalesce(d->'stores','[]'::jsonb)) loop
    sid := s->>'store_id';
    s := s || jsonb_build_object('subtotal_local',greatest(0,
      coalesce((s->>'subtotal_local')::numeric,0)-coalesce((loss_by_store->>sid)::numeric,0)),
      'quantity',coalesce((select sum((v->>'quantity')::integer) from jsonb_array_elements(active_items) v
                          where v->>'store_id'=sid),0),
      'item_count',(select count(*) from jsonb_array_elements(active_items) v where v->>'store_id'=sid));
    stores := stores || jsonb_build_array(s);
  end loop;
  d := d || jsonb_build_object('items',active_items,'stores',stores,'quantity',qty,
       'requested_quantity',qty,'item_count',line_count,'customer_total_local',goods,
       'stock_adjustment_v58',jsonb_build_object('version','v58','display_items',display_items,
          'previous_total',p_order.total_price,'current_total',goods));
  if d ? 'store_subtotal' then d := jsonb_set(d,'{store_subtotal}',to_jsonb(goods),true); end if;
  return jsonb_build_object('changed',true,'details',d,'total_price',goods);
end;
$v58$;
revoke all on function private.invoice_stock_projection_v58(public.orders) from public,anon,authenticated;

-- Preserve the installed guard; open only a transaction-scoped, canonical correction.
create or replace function public.meshwar_independent_vendor_order_guard()
returns trigger language plpgsql set search_path = public, pg_temp as $function$
declare
  v_old jsonb := coalesce(nullif(old.details::text,'')::jsonb,'{}'::jsonb);
  v_new jsonb := coalesce(nullif(new.details::text,'')::jsonb,v_old);
  v_key text;
  v_immutable constant text[] := array[
    'source','checkout_contract','checkout_group_id','vendor_order_id',
    'items','stores','store_id','store_name','quantity','requested_quantity','item_count',
    'customer_scope_id','customer_scope_type','submitted_at','customer_total_local',
    'store_subtotal','currency','shipping_snapshot'
  ];
  v_paid boolean;
  correction jsonb;
begin
  if current_setting('kinto.invoice_adjustment_v58',true)=old.id::text
     and old.status = any(array['بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل'])
     and new.status=old.status
     and coalesce(v_old->>'bundle_stock_lifecycle_state','') <> 'deducted' then
    correction := private.invoice_stock_projection_v58(old);
    if correction->>'changed'='true'
       and v_new=correction->'details'
       and new.total_price=(correction->>'total_price')::numeric then
      return new;
    end if;
    raise exception 'V58_CORRECTION_MISMATCH';
  end if;
  foreach v_key in array v_immutable loop
    if v_old ? v_key then v_new := jsonb_set(v_new,array[v_key],v_old->v_key,true); end if;
  end loop;
  if new.status='تمت الموافقة - بانتظار الدفع' and old.status is distinct from new.status
     and current_setting('kinto.invoice_approval_v58',true) is distinct from old.id::text then
    raise exception 'V58_REVIEW_INVOICE_REQUIRED';
  end if;
  -- Prevent stale staff forms from reintroducing old quantities/amounts after correction.
  if v_old ? 'stock_adjustment_v58' then
    v_new := jsonb_set(v_new,'{stock_adjustment_v58}',v_old->'stock_adjustment_v58',true);
    new.total_price := old.total_price;
  else
    v_new := v_new - 'stock_adjustment_v58';
  end if;
  v_paid := coalesce(v_old->>'bundle_stock_lifecycle_state','')='deducted' or old.status='تم التسديد';
  if coalesce(v_old->>'bundle_stock_lifecycle_state','')='deducted' then
    v_new := jsonb_set(v_new,'{bundle_stock_lifecycle_state}','"deducted"'::jsonb,true);
    foreach v_key in array array['bundle_stock_deducted_at','bundle_variant_stock_deducted']::text[] loop
      if v_old ? v_key then v_new := jsonb_set(v_new,array[v_key],v_old->v_key,true); end if;
    end loop;
  end if;
  if v_paid and new.status is distinct from old.status and new.status=any(array[
    'مرفوض','رفض التسليم','رفض الطلب','ملغي من قبل العميل','ملغي','ملغى']::text[]) then
    raise exception 'V94 paid independent vendor order cannot be cancelled or rejected' using errcode='P0001';
  end if;
  new.details := v_new::text;
  return new;
end;
$function$;

-- Include price-only stale writes in the same existing guard.
drop trigger if exists trg_meshwar_independent_vendor_order_guard on public.orders;
create trigger trg_meshwar_independent_vendor_order_guard
before update of status,details,total_price on public.orders
for each row when (coalesce(private.v94_jsonb_object(to_jsonb(old.details))->>'checkout_contract','')='independent_vendor_orders')
execute function public.meshwar_independent_vendor_order_guard();

create or replace function public.customer_reconcile_invoice_v58(
  p_session_token text, p_order_id uuid, p_approve boolean default false,
  p_expected_revision text default null
) returns jsonb language plpgsql security definer
set search_path = public,private,pg_temp as $v58$
declare
  v_customer_id uuid; o public.orders%rowtype; projection jsonb; d jsonb;
  revision text; was_changed boolean := false;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);
  select * into o from public.orders where id=p_order_id and orders.customer_id=v_customer_id for update;
  if not found then raise exception 'V58_ORDER_NOT_FOUND'; end if;
  if not (o.status=any(array['بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل'])) then
    raise exception 'V58_ORDER_NOT_AWAITING_APPROVAL';
  end if;
  d := coalesce(nullif(o.details::text,'')::jsonb,'{}'::jsonb);
  if coalesce(d->>'bundle_stock_lifecycle_state','')='deducted' then raise exception 'V58_PAID_ORDER_LOCKED'; end if;
  projection := private.invoice_stock_projection_v58(o);
  was_changed := (projection->>'changed')::boolean;
  if was_changed then
    -- Coupons are already redeemed elsewhere. Do not silently alter redeemed coupons.
    if coalesce((to_jsonb(o)->>'reward_discount_amount')::numeric,0)>
       floor((projection->>'total_price')::numeric*0.1) then
      raise exception 'V58_REWARD_REVIEW_REQUIRED';
    end if;
    perform set_config('kinto.invoice_adjustment_v58',o.id::text,true);
    update public.orders set details=(projection->'details')::text,
      total_price=(projection->>'total_price')::numeric where id=o.id returning * into o;
    perform set_config('kinto.invoice_adjustment_v58','',true);
    -- The existing segment sync has no input row when every product sold out.
    update public.order_store_segments seg
    set items_snapshot='[]'::jsonb,quantity_total=0,subtotal_local=0,updated_at=now()
    where seg.order_id=o.id and not seg.payment_confirmed
      and not exists (select 1 from jsonb_array_elements(o.details::jsonb->'items') item
                      where item->>'store_id'=seg.store_id::text);
    if o.details::jsonb is distinct from projection->'details'
       or o.total_price is distinct from (projection->>'total_price')::numeric then
      raise exception 'V58_ORDER_WRITE_MISMATCH';
    end if;
  end if;
  -- Bind approval to all persisted invoice/payment fields, not a browser amount.
  revision := md5(to_jsonb(o)::text);
  if p_approve then
    if was_changed or p_expected_revision is distinct from revision then
      return jsonb_build_object('approved',false,'review_required',true,'order',to_jsonb(o),'revision',revision);
    end if;
    if o.total_price <= 0 or jsonb_array_length(o.details::jsonb->'items')=0 then
      return jsonb_build_object('approved',false,'unavailable',true,'order',to_jsonb(o),'revision',revision);
    end if;
    perform set_config('kinto.invoice_approval_v58',o.id::text,true);
    update public.orders set status='تمت الموافقة - بانتظار الدفع' where id=o.id returning * into o;
    perform set_config('kinto.invoice_approval_v58','',true);
  end if;
  return jsonb_build_object('approved',p_approve,'changed',was_changed,'order',to_jsonb(o),'revision',revision);
end;
$v58$;
revoke all on function public.customer_reconcile_invoice_v58(text,uuid,boolean,text) from public;
grant execute on function public.customer_reconcile_invoice_v58(text,uuid,boolean,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
