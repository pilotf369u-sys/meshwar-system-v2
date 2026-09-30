-- V391 — isolated admin -> vendor notifications
-- Communication only: no order, payment, shipping, invoice or loyalty mutations.

create table if not exists public.kinto_admin_notifications(
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(trim(title)) between 2 and 160),
  body text not null check(length(trim(body)) between 2 and 4000),
  kind text not null default 'announcement' check(kind in('announcement','campaign','warning','policy','action_required')),
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.kinto_admin_notification_recipients(
  notification_id uuid not null references public.kinto_admin_notifications(id) on delete cascade,
  store_id text not null,
  read_at timestamptz,
  response text check(response is null or response in('accepted','rejected')),
  responded_at timestamptz,
  primary key(notification_id,store_id)
);
create index if not exists kinto_admin_notification_recipients_store_idx
  on public.kinto_admin_notification_recipients(store_id,notification_id);

alter table public.kinto_admin_notifications enable row level security;
alter table public.kinto_admin_notification_recipients enable row level security;
revoke all on public.kinto_admin_notifications,public.kinto_admin_notification_recipients from public,anon,authenticated;

create or replace function public.admin_send_vendor_notification_v391(
 p_session_token text,p_title text,p_body text,p_kind text default 'announcement',
 p_store_ids text[] default null,p_all_stores boolean default false
) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare aid text;nid uuid;cnt integer:=0;k text;
begin
 aid:=private.require_admin_session_v147(p_session_token);
 if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
 if length(trim(coalesce(p_title,''))) not between 2 and 160 then raise exception 'invalid title'; end if;
 if length(trim(coalesce(p_body,''))) not between 2 and 4000 then raise exception 'invalid body'; end if;
 k:=lower(trim(coalesce(p_kind,'announcement')));
 if k not in('announcement','campaign','warning','policy','action_required') then raise exception 'invalid notification kind'; end if;
 if not coalesce(p_all_stores,false) and coalesce(cardinality(p_store_ids),0)=0 then raise exception 'recipient required'; end if;

 insert into public.kinto_admin_notifications(title,body,kind,created_by)
 values(trim(p_title),trim(p_body),k,aid) returning id into nid;

 if coalesce(p_all_stores,false) then
   insert into public.kinto_admin_notification_recipients(notification_id,store_id)
   select nid,s.id::text from public.local_stores s
   on conflict do nothing;
 else
   insert into public.kinto_admin_notification_recipients(notification_id,store_id)
   select nid,s.id::text from public.local_stores s
   where s.id::text=any(p_store_ids)
   on conflict do nothing;
 end if;
 get diagnostics cnt=row_count;
 if cnt=0 then raise exception 'no valid recipients'; end if;
 return jsonb_build_object('ok',true,'notification_id',nid,'recipients',cnt);
end $$;

create or replace function public.admin_vendor_notifications_v391(
 p_session_token text,p_limit integer default 100
) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare aid text;
begin
 aid:=private.require_admin_session_v147(p_session_token);
 if coalesce(aid,'')='' then raise exception 'invalid admin session'; end if;
 return coalesce((
   select jsonb_agg(x order by x.created_at desc) from(
     select n.id,n.title,n.body,n.kind,n.created_at,
       count(r.store_id)::int recipients,
       count(r.read_at)::int read_count,
       count(*) filter(where r.response='accepted')::int accepted_count,
       count(*) filter(where r.response='rejected')::int rejected_count
     from public.kinto_admin_notifications n
     join public.kinto_admin_notification_recipients r on r.notification_id=n.id
     group by n.id order by n.created_at desc limit greatest(1,least(coalesce(p_limit,100),200))
   ) x
 ),'[]'::jsonb);
end $$;

create or replace function public.vendor_notifications_v391(
 p_session_token text,p_limit integer default 100
) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare sid text;
begin
 -- Reuse the same server-authoritative vendor session resolver used by secure vendor order RPCs.
 sid:=private.require_vendor_session(p_session_token)::text;
 if coalesce(sid,'')='' then raise exception 'VENDOR_SESSION_INVALID'; end if;
 return jsonb_build_object(
  'unread',coalesce((select count(*) from public.kinto_admin_notification_recipients r where r.store_id=sid and r.read_at is null),0),
  'items',coalesce((
    select jsonb_agg(x order by x.created_at desc) from(
      select n.id,n.title,n.body,n.kind,n.created_at,r.read_at,r.response,r.responded_at
      from public.kinto_admin_notification_recipients r
      join public.kinto_admin_notifications n on n.id=r.notification_id
      where r.store_id=sid order by n.created_at desc
      limit greatest(1,least(coalesce(p_limit,100),200))
    ) x
  ),'[]'::jsonb)
 );
end $$;

create or replace function public.vendor_notification_action_v391(
 p_session_token text,p_notification_id uuid,p_action text
) returns jsonb
language plpgsql security definer set search_path=public,private,extensions,pg_temp as $$
declare sid text;a text;
begin
 sid:=private.require_vendor_session(p_session_token)::text;
 if coalesce(sid,'')='' then raise exception 'VENDOR_SESSION_INVALID'; end if;
 a:=lower(trim(coalesce(p_action,'')));
 if a not in('read','accepted','rejected') then raise exception 'invalid action'; end if;
 update public.kinto_admin_notification_recipients
 set read_at=coalesce(read_at,now()),
     response=case when a in('accepted','rejected') then a else response end,
     responded_at=case when a in('accepted','rejected') then now() else responded_at end
 where notification_id=p_notification_id and store_id=sid;
 if not found then raise exception 'notification not found'; end if;
 return jsonb_build_object('ok',true);
end $$;

revoke all on function public.admin_send_vendor_notification_v391(text,text,text,text,text[],boolean) from public;
revoke all on function public.admin_vendor_notifications_v391(text,integer) from public;
revoke all on function public.vendor_notifications_v391(text,integer) from public;
revoke all on function public.vendor_notification_action_v391(text,uuid,text) from public;
grant execute on function public.admin_send_vendor_notification_v391(text,text,text,text,text[],boolean) to anon,authenticated;
grant execute on function public.admin_vendor_notifications_v391(text,integer) to anon,authenticated;
grant execute on function public.vendor_notifications_v391(text,integer) to anon,authenticated;
grant execute on function public.vendor_notification_action_v391(text,uuid,text) to anon,authenticated;
