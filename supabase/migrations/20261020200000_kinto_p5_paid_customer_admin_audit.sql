-- P5 payment history: customer paid-only; admin full audit, read-only and session-validated.
begin;
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
  select count(*) into v_total from private.kinto_payments_p5 p where p.customer_id=cid::text and p.status='paid';
  select coalesce(jsonb_agg(jsonb_build_object(
    'kp_number',p.kp_number,'created_at',p.created_at,'amount',p.amount,'currency',p.currency,
    'status',p.status,'payment_kind',p.payment_kind,
    'orders',coalesce((select jsonb_agg(jsonb_build_object(
      'order_id',o.id,'order_code',o.order_code,'currency',o.currency,'invoice',to_jsonb(o)
    ) order by o.created_at,o.id) from public.orders o where o.id=any(p.order_ids) and o.customer_id=cid::text),'[]'::jsonb)
  ) order by p.created_at desc,p.attempt_id desc),'[]'::jsonb)
    into v_rows
    from (select * from private.kinto_payments_p5 where customer_id=cid::text and status='paid'
          order by created_at desc,attempt_id desc limit 8 offset (v_page-1)*8) p;
  return jsonb_build_object('page',v_page,'page_size',8,'total',v_total,
    'pages',ceil(v_total::numeric/8),'payments',v_rows);
end;
$list$;
revoke all on function public.kinto_payments_p5_list_v1(text,integer) from public;
grant execute on function public.kinto_payments_p5_list_v1(text,integer) to anon,authenticated;


-- Admin-only, read-only audit of all payment attempts; no customer-facing exposure.
create or replace function public.kinto_payments_p5_admin_audit_v1(p_session_token text,p_page integer default 1,p_status text default 'all',p_search text default '')
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,private,auth,pg_temp
as $audit$
declare v_admin text; v_page integer; v_total bigint; v_rows jsonb; v_filter text; v_search text;
begin
  v_admin:=private.require_admin_session_v147(p_session_token);
  if nullif(v_admin,'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
  v_page:=greatest(1,least(coalesce(p_page,1),100000));
  v_filter:=coalesce(nullif(trim(p_status),''),'all');
  if v_filter not in ('all','paid','pending','failed','cancelled','reconciliation_required') then raise exception 'INVALID_STATUS'; end if;
  v_search:=left(trim(coalesce(p_search,'')),80);
  select count(*) into v_total from private.kinto_payments_p5 p where (v_filter='all' or p.status=v_filter) and (v_search='' or p.kp_number ilike '%'||replace(replace(v_search,'%','\\%'),'_','\\_')||'%' escape '\\' or p.customer_id=v_search);
  select coalesce(jsonb_agg(jsonb_build_object('kp_number',p.kp_number,'created_at',p.created_at,'amount',p.amount,'currency',p.currency,'status',p.status,'payment_kind',p.payment_kind,'customer_id',p.customer_id,'order_codes',coalesce((select jsonb_agg(o.order_code order by o.created_at,o.id) from public.orders o where o.id=any(p.order_ids)),'[]'::jsonb)) order by p.created_at desc,p.attempt_id desc),'[]'::jsonb) into v_rows
  from (select * from private.kinto_payments_p5 p where (v_filter='all' or p.status=v_filter) and (v_search='' or p.kp_number ilike '%'||replace(replace(v_search,'%','\\%'),'_','\\_')||'%' escape '\\' or p.customer_id=v_search) order by p.created_at desc,p.attempt_id desc limit 20 offset (v_page-1)*20) p;
  return jsonb_build_object('page',v_page,'page_size',20,'total',v_total,'pages',ceil(v_total::numeric/20),'payments',v_rows);
end;$audit$;
revoke all on function public.kinto_payments_p5_admin_audit_v1(text,integer,text,text) from public;
grant execute on function public.kinto_payments_p5_admin_audit_v1(text,integer,text,text) to anon,authenticated;

commit;
