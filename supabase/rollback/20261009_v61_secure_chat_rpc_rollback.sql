-- Emergency rollback only for 20261009_v61_secure_chat_rpc.sql.
-- This restores the legacy direct browser access to public.messages.
begin;

alter table public.messages disable row level security;

grant select, insert, update, delete on table public.messages to anon, authenticated;

drop function if exists public.customer_chat_mark_read_v61(text);
drop function if exists public.customer_chat_send_v61(text, text, text);
drop function if exists public.customer_chat_list_v61(text);
drop function if exists public.employee_chat_mark_read_v61(text, uuid);
drop function if exists public.employee_chat_send_v61(text, uuid, text, text);
drop function if exists public.employee_chat_list_v61(text, uuid);

commit;
