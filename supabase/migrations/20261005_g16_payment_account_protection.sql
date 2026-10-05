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
create or replace function public.kinto_payment_account_review_g16(
 p_session_token text,p_change_id uuid,p_decision text
) returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $
declare a text; c public.kinto_payment_pending_changes_g16%rowtype;
begin
 a:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(a),'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_decision not in ('approve','reject') then raise exception 'INVALID_DECISION' using errcode='22023'; end if;
 select * into c from public.kinto_payment_pending_changes_g16 where id=p_change_id and status='pending' for update;
 if not found then raise exception 'PENDING_CHANGE_NOT_FOUND' using errcode='P0002'; end if;
 -- Separation of duties: requester cannot approve their own financial destination change.
 if p_decision='approve' and c.requested_by=a then raise exception 'SECOND_ADMIN_REQUIRED' using errcode='42501'; end if;
 if p_decision='approve' then
  update public.kinto_payment_methods_g16 set recipient_name=c.new_recipient_name,account_reference=c.new_account_reference,is_enabled=false,updated_at=now() where id=c.method_id;
  update public.kinto_payment_pending_changes_g16 set status='approved',reviewed_by=a,reviewed_at=now() where id=c.id;
  insert into public.kinto_payment_audit_g16(method_id,admin_id,action,new_account_reference) values(c.method_id,a,'ACCOUNT_CHANGE_APPROVED',c.new_account_reference);
 else
  update public.kinto_payment_pending_changes_g16 set status='rejected',reviewed_by=a,reviewed_at=now() where id=c.id;
  insert into public.kinto_payment_audit_g16(method_id,admin_id,action,new_account_reference) values(c.method_id,a,'ACCOUNT_CHANGE_REJECTED',c.new_account_reference);
 end if;
 return jsonb_build_object('ok',true,'status',case when p_decision='approve' then 'approved' else 'rejected' end,'method_enabled',false);
end $;
revoke all on function public.kinto_payment_account_review_g16(text,uuid,text) from public;
grant execute on function public.kinto_payment_account_review_g16(text,uuid,text) to anon,authenticated;

create or replace function public.kinto_payment_security_list_g16(p_session_token text)
returns jsonb language plpgsql security definer set search_path=public,private,pg_temp as $
declare a text; p jsonb; l jsonb;
begin
 a:=private.require_admin_session_v147(p_session_token);
 if nullif(btrim(a),'') is null then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000'; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.requested_at desc),'[]'::jsonb) into p from
 (select c.id,c.method_id,m.label,m.provider,c.requested_by,c.new_recipient_name,c.new_account_reference,c.requested_at,c.status
  from public.kinto_payment_pending_changes_g16 c join public.kinto_payment_methods_g16 m on m.id=c.method_id where c.status='pending') x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into l from
 (select id,method_id,admin_id,action,created_at from public.kinto_payment_audit_g16 order by created_at desc limit 100) x;
 return jsonb_build_object('pending',p,'audit',l,'current_admin',a);
end $;
revoke all on function public.kinto_payment_security_list_g16(text) from public;
grant execute on function public.kinto_payment_security_list_g16(text) to anon,authenticated;
commit;
