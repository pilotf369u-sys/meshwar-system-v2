-- KINTO V61: secure customer-support chat behind verified sessions.
-- No order, inventory, payment, or legacy message data is changed.

begin;

create or replace function public.customer_chat_list_v61(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer_id uuid;
  v_items jsonb;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'created_at', m.created_at,
    'customer_id', m.customer_id,
    'employee_id', m.employee_id,
    'sender_type', m.sender_type,
    'message', m.message,
    'file_url', m.file_url,
    'read_by_employee', m.read_by_employee,
    'read_by_customer', m.read_by_customer
  ) order by m.created_at asc), '[]'::jsonb)
  into v_items
  from public.messages m
  where m.customer_id = v_customer_id;

  return jsonb_build_object('items', v_items);
end;
$$;

create or replace function public.customer_chat_send_v61(
  p_session_token text,
  p_message text default null,
  p_file_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer_id uuid;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_file_url text := nullif(trim(coalesce(p_file_url, '')), '');
  v_row public.messages%rowtype;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);

  if v_message is null and v_file_url is null then
    raise exception 'CHAT_MESSAGE_REQUIRED';
  end if;
  if v_message is not null and char_length(v_message) > 4000 then
    raise exception 'CHAT_MESSAGE_TOO_LONG';
  end if;
  if v_file_url is not null
     and position('/storage/v1/object/public/chat-attachments/customer/' || v_customer_id::text || '/' in v_file_url) = 0 then
    raise exception 'CHAT_ATTACHMENT_NOT_OWNED';
  end if;

  insert into public.messages(
    customer_id, sender_type, message, file_url, read_by_employee, read_by_customer
  ) values (
    v_customer_id, 'customer', coalesce(v_message, ''), v_file_url, false, true
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'created_at', v_row.created_at,
    'customer_id', v_row.customer_id,
    'employee_id', v_row.employee_id,
    'sender_type', v_row.sender_type,
    'message', v_row.message,
    'file_url', v_row.file_url,
    'read_by_employee', v_row.read_by_employee,
    'read_by_customer', v_row.read_by_customer
  );
end;
$$;

create or replace function public.customer_chat_mark_read_v61(p_session_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_customer_id uuid;
  v_updated integer;
begin
  v_customer_id := private.require_customer_review_session(p_session_token);

  update public.messages
  set read_by_customer = true
  where customer_id = v_customer_id
    and coalesce(read_by_customer, false) = false
    and lower(coalesce(sender_type, '')) in ('employee', 'admin');

  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated);
end;
$$;

create or replace function public.employee_chat_list_v61(
  p_session_token text,
  p_customer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_employee_id text;
  v_items jsonb;
begin
  v_employee_id := private.require_employee_session_v143(p_session_token);
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id,
    'created_at', m.created_at,
    'customer_id', m.customer_id,
    'employee_id', m.employee_id,
    'sender_type', m.sender_type,
    'message', m.message,
    'file_url', m.file_url,
    'read_by_employee', m.read_by_employee,
    'read_by_customer', m.read_by_customer
  ) order by m.created_at asc), '[]'::jsonb)
  into v_items
  from public.messages m
  where p_customer_id is null or m.customer_id = p_customer_id;

  return jsonb_build_object('items', v_items);
end;
$;

create or replace function public.employee_chat_send_v61(
  p_session_token text,
  p_customer_id uuid,
  p_message text default null,
  p_file_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_employee_id text;
  v_message text := nullif(trim(coalesce(p_message, '')), '');
  v_file_url text := nullif(trim(coalesce(p_file_url, '')), '');
  v_row public.messages%rowtype;
begin
  v_employee_id := private.require_employee_session_v143(p_session_token);
  if p_customer_id is null then raise exception 'CHAT_CUSTOMER_REQUIRED'; end if;
  if v_message is null and v_file_url is null then raise exception 'CHAT_MESSAGE_REQUIRED'; end if;
  if v_message is not null and char_length(v_message) > 4000 then raise exception 'CHAT_MESSAGE_TOO_LONG'; end if;
  if v_file_url is not null
     and position('/storage/v1/object/public/chat-attachments/employee/' || v_employee_id || '/' in v_file_url) = 0 then
    raise exception 'CHAT_ATTACHMENT_NOT_OWNED';
  end if;

  insert into public.messages(
    customer_id, employee_id, sender_type, message, file_url, read_by_employee, read_by_customer
  ) values (
    p_customer_id, v_employee_id::uuid, 'employee', coalesce(v_message, ''), v_file_url, true, false
  )
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'created_at', v_row.created_at,
    'customer_id', v_row.customer_id,
    'employee_id', v_row.employee_id,
    'sender_type', v_row.sender_type,
    'message', v_row.message,
    'file_url', v_row.file_url,
    'read_by_employee', v_row.read_by_employee,
    'read_by_customer', v_row.read_by_customer
  );
end;
$$;

create or replace function public.employee_chat_mark_read_v61(
  p_session_token text,
  p_customer_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_employee_id text;
  v_updated integer;
begin
  v_employee_id := private.require_employee_session_v143(p_session_token);

  update public.messages
  set read_by_employee = true
  where lower(coalesce(sender_type, '')) = 'customer'
    and coalesce(read_by_employee, false) = false
    and (p_customer_id is null or customer_id = p_customer_id);

  get diagnostics v_updated = row_count;
  return jsonb_build_object('updated', v_updated);
end;
$$;

revoke all on function public.customer_chat_list_v61(text) from public;
revoke all on function public.customer_chat_send_v61(text, text, text) from public;
revoke all on function public.customer_chat_mark_read_v61(text) from public;
revoke all on function public.employee_chat_list_v61(text, uuid) from public;
revoke all on function public.employee_chat_send_v61(text, uuid, text, text) from public;
revoke all on function public.employee_chat_mark_read_v61(text, uuid) from public;

grant execute on function public.customer_chat_list_v61(text) to anon, authenticated;
grant execute on function public.customer_chat_send_v61(text, text, text) to anon, authenticated;
grant execute on function public.customer_chat_mark_read_v61(text) to anon, authenticated;
grant execute on function public.employee_chat_list_v61(text, uuid) to anon, authenticated;
grant execute on function public.employee_chat_send_v61(text, uuid, text, text) to anon, authenticated;
grant execute on function public.employee_chat_mark_read_v61(text, uuid) to anon, authenticated;

alter table public.messages enable row level security;
revoke all on table public.messages from anon, authenticated;
revoke all on table public.messages from public;

commit;
