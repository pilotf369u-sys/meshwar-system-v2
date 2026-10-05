-- G16 payment account protection. Isolated from orders/auth engine.
begin;
create table if not exists public.kinto_payment_audit_g16(
 id bigserial primary key, method_id uuid, admin_id text not null, action text not null,
 old_account_reference text, new_account_reference text, created_at timestamptz not null default now()
);
alter table public.kinto_payment_audit_g16 enable row level security;
revoke all on public.kinto_payment_audit_g16 from public,anon,authenticated;
create table if not exists public.kinto_payment_pending_changes_g16(
 id uuid primary key default gen_random_uuid(), method_id uuid not null references public.kinto_payment_methods_g16(id) on delete cascade,
 requested_by text not null, new_recipient_name text, new_account_reference text not null,
 requested_at timestamptz not null default now(), status text not null default 'pending' check(status in('pending','approved','rejected')),
 reviewed_by text, reviewed_at timestamptz
);
alter table public.kinto_payment_pending_changes_g16 enable row level security;
revoke all on public.kinto_payment_pending_changes_g16 from public,anon,authenticated;
create or replace function public.kinto_payment_account_change_g16(
 p_session_token text,p_method_id uuid,p_recipient_name text,p_account_reference text
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $$
declare a text; old public.kinto_payment_methods_g16%rowtype; c uuid;
begin
 a:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(a),'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 select * into old from public.kinto_payment_methods_g16 where id=p_method_id and method_type='manual' for update;
 if not found then raise exception 'PAYMENT_METHOD_NOT_FOUND' using errcode='P0002'; end if;
 if nullif(btrim(coalesce(p_account_reference,'')),'') is null then raise exception 'ACCOUNT_REQUIRED' using errcode='22023'; end if;
 update public.kinto_payment_methods_g16 set is_enabled=false,updated_at=now() where id=p_method_id;
 update public.kinto_payment_pending_changes_g16 set status='rejected',reviewed_by=a,reviewed_at=now() where method_id=p_method_id and status='pending';
 insert into public.kinto_payment_pending_changes_g16(method_id,requested_by,new_recipient_name,new_account_reference)
 values(p_method_id,a,nullif(btrim(coalesce(p_recipient_name,'')),''),btrim(p_account_reference)) returning id into c;
 insert into public.kinto_payment_audit_g16(method_id,admin_id,action,old_account_reference,new_account_reference)
 values(p_method_id,a,'ACCOUNT_CHANGE_REQUESTED',old.account_reference,btrim(p_account_reference));
 return jsonb_build_object('ok',true,'pending_change_id',c,'method_disabled',true);
end $$;
revoke all on function public.kinto_payment_account_change_g16(text,uuid,text,text) from public;
grant execute on function public.kinto_payment_account_change_g16(text,uuid,text,text) to anon,authenticated;
-- No browser-callable approval RPC: a stolen admin session cannot approve a new destination.
commit;
