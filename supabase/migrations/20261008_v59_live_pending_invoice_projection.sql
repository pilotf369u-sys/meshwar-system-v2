-- V59: pending customer invoices remain a live projection until approval.
-- No reservation and no stock write are introduced here. V47 still deducts only at payment.
begin;

create or replace function private.invoice_stock_projection_v59(p_order public.orders)
returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $v59$
declare
  d jsonb := coalesce(nullif(p_order.details::text,'')::jsonb,'{}'::jsonb);
  history jsonb := d->'stock_adjustment_v58'->'display_items';
  rebuilt jsonb := '[]'::jsonb;
  rebuilt_stores jsonb := '[]'::jsonb;
  x jsonb; s jsonb; source_order public.orders%rowtype;
  requested integer; original_total numeric; projected jsonb;
  source_total numeric := 0; source_qty integer := 0; source_count integer := 0;
  sid text;
begin
  -- First reconciliation may use V58 untouched. Later reconciliations rebuild
  -- the customer's original request from the stored display history instead of
  -- treating the previous reduced quantity as a new request.
  if jsonb_typeof(history) is distinct from 'array' then
    return private.invoice_stock_projection_v58(p_order);
  end if;

  for x in select value from jsonb_array_elements(history) loop
    requested := coalesce(nullif(x->>'stock_requested_quantity_v58','')::integer,
                          nullif(x->>'quantity','')::integer,0);
    if requested < 1 then continue; end if;
    original_total := coalesce(nullif(x->>'stock_original_line_total_v59','')::numeric,
                               (coalesce(nullif(x->>'unit_price_local','')::numeric,0) * requested));
    x := jsonb_set(x,'{quantity}',to_jsonb(requested),true);
    x := jsonb_set(x,'{line_total_local}',to_jsonb(original_total),true);
    x := x - '_invoiceRequestedV57' - '_invoiceAvailableV57';
    rebuilt := rebuilt || jsonb_build_array(x);
    source_total := source_total + original_total;
    source_qty := source_qty + requested;
    source_count := source_count + 1;
  end loop;

  if rebuilt='[]'::jsonb then
    return private.invoice_stock_projection_v58(p_order);
  end if;

  for s in select value from jsonb_array_elements(coalesce(d->'stores','[]'::jsonb)) loop
    sid := s->>'store_id';
    s := s || jsonb_build_object(
      'subtotal_local',coalesce((select sum((item->>'line_total_local')::numeric)
                                  from jsonb_array_elements(rebuilt) item
                                  where item->>'store_id'=sid),0),
      'quantity',coalesce((select sum((item->>'quantity')::integer)
                           from jsonb_array_elements(rebuilt) item where item->>'store_id'=sid),0),
      'item_count',coalesce((select count(*) from jsonb_array_elements(rebuilt) item
                             where item->>'store_id'=sid),0));
    rebuilt_stores := rebuilt_stores || jsonb_build_array(s);
  end loop;

  d := jsonb_set(d,'{items}',rebuilt,true);
  d := jsonb_set(d,'{stores}',rebuilt_stores,true);
  d := d || jsonb_build_object('quantity',source_qty,'requested_quantity',source_qty,
       'item_count',source_count,'customer_total_local',source_total);
  d := d - 'stock_adjustment_v58';
  source_order := p_order;
  source_order.details := d::text;
  source_order.total_price := coalesce(nullif(p_order.details::jsonb->'stock_adjustment_v58'->>'previous_total','')::numeric,source_total);
  projected := private.invoice_stock_projection_v58(source_order);

  -- A reconciliation is review-worthy only when its fresh projection differs
  -- from the order currently shown to the customer.  V58's internal flag is
  -- based on the reconstructed original request and would otherwise remain
  -- true on every later review of a still-short item.
  projected := jsonb_set(projected,'{changed}',to_jsonb(
    (projected->'details') is distinct from coalesce(nullif(p_order.details::text,'')::jsonb,'{}'::jsonb)
    or (projected->>'total_price')::numeric is distinct from p_order.total_price
  ),true);
  return projected;
end;
$v59$;
revoke all on function private.invoice_stock_projection_v59(public.orders) from public,anon,authenticated;

create or replace function public.meshwar_independent_vendor_order_guard()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $function$
declare
  v_old jsonb := coalesce(nullif(old.details::text,'')::jsonb,'{}'::jsonb);
  v_new jsonb := coalesce(nullif(new.details::text,'')::jsonb,v_old);
  v_key text;
  v_immutable constant text[] := array['source','checkout_contract','checkout_group_id','vendor_order_id','items','stores','store_id','store_name','quantity','requested_quantity','item_count','customer_scope_id','customer_scope_type','submitted_at','customer_total_local','store_subtotal','currency','shipping_snapshot'];
  v_paid boolean; correction jsonb;
begin
  if current_setting('kinto.invoice_adjustment_v58',true)=old.id::text
     and old.status=any(array['بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل'])
     and new.status=old.status and coalesce(v_old->>'bundle_stock_lifecycle_state','')<>'deducted' then
    correction := private.invoice_stock_projection_v59(old);
    if correction->>'changed'='true' and v_new=correction->'details' and new.total_price=(correction->>'total_price')::numeric then return new; end if;
    raise exception 'V59_CORRECTION_MISMATCH';
  end if;
  foreach v_key in array v_immutable loop if v_old ? v_key then v_new:=jsonb_set(v_new,array[v_key],v_old->v_key,true); end if; end loop;
  if new.status='تمت الموافقة - بانتظار الدفع' and old.status is distinct from new.status and coalesce(v_old->>'bundle_stock_lifecycle_state','')<>'deducted' and old.status<>'تم التسديد' and current_setting('kinto.invoice_approval_v58',true) is distinct from old.id::text then
    correction:=private.invoice_stock_projection_v59(old);if correction->>'changed'='true' then raise exception 'V58_REVIEW_INVOICE_REQUIRED'; end if;
  end if;
  if v_old ? 'stock_adjustment_v58' then v_new:=jsonb_set(v_new,'{stock_adjustment_v58}',v_old->'stock_adjustment_v58',true);new.total_price:=old.total_price;else v_new:=v_new-'stock_adjustment_v58';end if;
  v_paid:=coalesce(v_old->>'bundle_stock_lifecycle_state','')='deducted' or old.status='تم التسديد';
  if coalesce(v_old->>'bundle_stock_lifecycle_state','')='deducted' then v_new:=jsonb_set(v_new,'{bundle_stock_lifecycle_state}','"deducted"'::jsonb,true);foreach v_key in array array['bundle_stock_deducted_at','bundle_variant_stock_deducted']::text[] loop if v_old ? v_key then v_new:=jsonb_set(v_new,array[v_key],v_old->v_key,true);end if;end loop;end if;
  if v_paid and new.status is distinct from old.status and new.status=any(array['مرفوض','رفض التسليم','رفض الطلب','ملغي من قبل العميل','ملغي','ملغى']::text[]) then raise exception 'V94 paid independent vendor order cannot be cancelled or rejected' using errcode='P0001';end if;
  new.details:=v_new::text;return new;
end;
$function$;

create or replace function public.customer_reconcile_invoice_v58(p_session_token text,p_order_id uuid,p_approve boolean default false,p_expected_revision text default null)
returns jsonb language plpgsql security definer set search_path = public,private,pg_temp as $v59$
declare v_customer_id uuid;o public.orders%rowtype;projection jsonb;d jsonb;revision text;was_changed boolean:=false;
begin
  v_customer_id:=private.require_customer_review_session(p_session_token);
  select * into o from public.orders where id=p_order_id and orders.customer_id::text=v_customer_id::text for update;
  if not found then raise exception 'V58_ORDER_NOT_FOUND';end if;
  if not(o.status=any(array['بانتظار موافقة العميل','بانتظار موافقة الزبون','بانتظار التسعير','تم التسعير / بانتظار موافقة العميل'])) then raise exception 'V58_ORDER_NOT_AWAITING_APPROVAL';end if;
  d:=coalesce(nullif(o.details::text,'')::jsonb,'{}'::jsonb);if coalesce(d->>'bundle_stock_lifecycle_state','')='deducted' then raise exception 'V58_PAID_ORDER_LOCKED';end if;
  projection:=private.invoice_stock_projection_v59(o);was_changed:=(projection->>'changed')::boolean;
  if was_changed then
    if coalesce((to_jsonb(o)->>'reward_discount_amount')::numeric,0)>floor((projection->>'total_price')::numeric*0.1) then raise exception 'V58_REWARD_REVIEW_REQUIRED';end if;
    perform set_config('kinto.invoice_adjustment_v58',o.id::text,true);update public.orders set details=(projection->'details')::text,total_price=(projection->>'total_price')::numeric where id=o.id returning * into o;perform set_config('kinto.invoice_adjustment_v58','',true);
    delete from public.order_store_segments seg where seg.order_id=o.id and not seg.payment_confirmed and not exists(select 1 from jsonb_array_elements(o.details::jsonb->'items') item where item->>'store_id'=seg.store_id::text);
    if o.details::jsonb is distinct from projection->'details' or o.total_price is distinct from (projection->>'total_price')::numeric then raise exception 'V58_ORDER_WRITE_MISMATCH';end if;
  end if;
  revision:=md5(to_jsonb(o)::text);
  if p_approve then
    if was_changed or p_expected_revision is distinct from revision then return jsonb_build_object('approved',false,'review_required',true,'order',to_jsonb(o),'revision',revision);end if;
    if o.total_price<=0 or jsonb_array_length(o.details::jsonb->'items')=0 then return jsonb_build_object('approved',false,'unavailable',true,'order',to_jsonb(o),'revision',revision);end if;
    perform set_config('kinto.invoice_approval_v58',o.id::text,true);update public.orders set status='تمت الموافقة - بانتظار الدفع' where id=o.id returning * into o;perform set_config('kinto.invoice_approval_v58','',true);
  end if;
  return jsonb_build_object('approved',p_approve,'changed',was_changed,'order',to_jsonb(o),'revision',revision);
end;
$v59$;
notify pgrst,'reload schema';
commit;
