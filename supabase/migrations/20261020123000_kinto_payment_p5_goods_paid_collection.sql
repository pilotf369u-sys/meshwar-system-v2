-- P5 cart orders are paid for goods before the shared order engine creates KN rows.
-- Stamp the existing collection column only during the private, transaction-bound
-- P5 cart finalizer. Manual checkout and direct campaign orders retain their current value.
begin;

create or replace function private.kinto_payment_p5_stamp_goods_paid_collection_v1()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,public,private,pg_temp
as $stamp$
begin
  if exists (
    select 1
      from private.kinto_payment_finalize_permits_p5 f
      join private.kinto_payments_p5 p on p.attempt_id=f.attempt_id
     where f.transaction_id=txid_current()
       and f.customer_id=new.customer_id
       and p.customer_id=new.customer_id
       and p.payment_kind='cart'
       and p.status='pending'
  ) then
    new.delivery_payment_type:='product_paid_delivery_cod';
  end if;
  return new;
end;
$stamp$;

revoke all on function private.kinto_payment_p5_stamp_goods_paid_collection_v1() from public,anon,authenticated;
drop trigger if exists trg_00_kinto_payment_p5_goods_paid_collection on public.orders;
create trigger trg_00_kinto_payment_p5_goods_paid_collection
before insert on public.orders
for each row execute function private.kinto_payment_p5_stamp_goods_paid_collection_v1();

comment on function private.kinto_payment_p5_stamp_goods_paid_collection_v1() is
  'P5 cart-only collection mode stamp; requires an internal permit for this transaction and customer. Does not update existing orders.';

-- Mark cart payments in the session-scoped payment-history response so an
-- already-paid P5 invoice can be rendered truthfully without editing its order row.
create or replace function public.kinto_payments_p5_list_v1(p_session_token text,p_page integer default 1)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,public,private,auth,pg_temp
as $list$
declare cid uuid; v_page integer; v_total bigint; v_rows jsonb;
begin
  cid:=private.require_customer_review_session(p_session_token);
  if cid is null then raise exception 'CUSTOMER_SESSION_REQUIRED' using errcode='28000'; end if;
  v_page:=greatest(1,coalesce(p_page,1));
  select count(*) into v_total from private.kinto_payments_p5 p where p.customer_id=cid::text;
  select coalesce(jsonb_agg(jsonb_build_object(
    'kp_number',p.kp_number,'created_at',p.created_at,'amount',p.amount,'currency',p.currency,
    'status',p.status,'payment_kind',p.payment_kind,
    'orders',coalesce((select jsonb_agg(jsonb_build_object(
      'order_id',o.id,'order_code',o.order_code,'currency',o.currency,'invoice',to_jsonb(o)
    ) order by o.created_at,o.id) from public.orders o where o.id=any(p.order_ids) and o.customer_id=cid::text),'[]'::jsonb)
  ) order by p.created_at desc,p.attempt_id desc),'[]'::jsonb)
    into v_rows
    from (select * from private.kinto_payments_p5 where customer_id=cid::text
          order by created_at desc,attempt_id desc limit 10 offset (v_page-1)*10) p;
  return jsonb_build_object('page',v_page,'page_size',10,'total',v_total,
    'pages',ceil(v_total::numeric/10),'payments',v_rows);
end;
$list$;
revoke all on function public.kinto_payments_p5_list_v1(text,integer) from public;
grant execute on function public.kinto_payments_p5_list_v1(text,integer) to anon,authenticated;

commit;
