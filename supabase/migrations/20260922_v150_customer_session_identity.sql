begin;

create or replace function public.customer_session_identity_v150(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer_id uuid;
  v_customer jsonb;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);

  select to_jsonb(c) - 'password'
  into v_customer
  from public.customers c
  where c.id = v_customer_id
  limit 1;

  if v_customer is null then
    raise exception 'CUSTOMER_SESSION_INVALID';
  end if;

  return jsonb_build_object('ok', true, 'customer', v_customer);
end;
$$;

revoke all on function public.customer_session_identity_v150(text) from public;
grant execute on function public.customer_session_identity_v150(text) to anon, authenticated;

commit;
