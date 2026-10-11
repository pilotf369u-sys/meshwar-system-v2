-- KINTO V171: isolated store visit counters. Run before merging PR.
-- No customer identifiers, IPs, user agents, order writes, or auth changes.
begin;
create table if not exists public.kinto_store_visits_daily_v171 (
 store_id uuid not null references public.local_stores(id) on delete cascade,
 visit_day date not null,
 visits bigint not null default 0 check(visits>=0),
 unique_browsers bigint not null default 0 check(unique_browsers>=0),
 ad_visits bigint not null default 0 check(ad_visits>=0),
 primary key(store_id,visit_day)
);
create table if not exists private.kinto_store_visit_dedupe_v171 (
 store_id uuid not null references public.local_stores(id) on delete cascade,
 visit_day date not null,
 token_hash text not null,
 token_kind text not null check(token_kind in ('session','browser')),
 primary key(store_id,visit_day,token_kind,token_hash)
);
create index if not exists kinto_visit_dedupe_day_v171 on private.kinto_store_visit_dedupe_v171(visit_day);
revoke all on public.kinto_store_visits_daily_v171 from public,anon,authenticated;
revoke all on private.kinto_store_visit_dedupe_v171 from public,anon,authenticated;
create or replace function public.kinto_record_store_visit_v171(
 p_store_id uuid,p_session_id uuid,p_browser_id uuid,p_ad_source text default null
) returns void language plpgsql volatile security definer
set search_path=public,private,pg_temp as $$
declare d date:=(now() at time zone 'Europe/Istanbul')::date;
 v_session_count integer:=0;v_browser_count integer:=0;
begin
 if p_store_id is null or p_session_id is null or p_browser_id is null then return;end if;
 if not exists(select 1 from public.local_stores where id=p_store_id and status='active') then return;end if;
 -- Hard upper bound per store/day to limit accidental or abusive growth.
 if exists(select 1 from public.kinto_store_visits_daily_v171 where store_id=p_store_id and visit_day=d and visits>=10000) then return;end if;
 -- Hash high-entropy random UUIDs; never persist browser or session identifiers themselves.
 insert into private.kinto_store_visit_dedupe_v171(store_id,visit_day,token_kind,token_hash)
 values(p_store_id,d,'session',md5(p_session_id::text))
 on conflict do nothing;
 get diagnostics v_session_count=row_count;
 insert into private.kinto_store_visit_dedupe_v171(store_id,visit_day,token_kind,token_hash)
 values(p_store_id,d,'browser',md5(p_browser_id::text))
 on conflict do nothing;
 get diagnostics v_browser_count=row_count;
 if v_session_count>0 or v_browser_count>0 then
  insert into public.kinto_store_visits_daily_v171(store_id,visit_day,visits,unique_browsers,ad_visits)
  values(p_store_id,d,case when v_session_count>0 then 1 else 0 end,
    case when v_browser_count>0 then 1 else 0 end,
    case when v_session_count>0 and lower(coalesce(p_ad_source,'')) in ('facebook','instagram','google','tiktok','snapchat') then 1 else 0 end)
  on conflict(store_id,visit_day) do update set
   visits=public.kinto_store_visits_daily_v171.visits+excluded.visits,
   unique_browsers=public.kinto_store_visits_daily_v171.unique_browsers+excluded.unique_browsers,
   ad_visits=public.kinto_store_visits_daily_v171.ad_visits+excluded.ad_visits;
 end if;
end $$;
revoke all on function public.kinto_record_store_visit_v171(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.kinto_record_store_visit_v171(uuid,uuid,uuid,text) to anon,authenticated;
create or replace function public.vendor_store_visits_v171(p_session_token text,p_from date,p_to date)
returns jsonb language plpgsql volatile security definer
set search_path=public,private,pg_temp as $$
declare sid uuid; result jsonb;
begin
 sid:=private.require_vendor_session(p_session_token);
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>365 then
  raise exception 'VENDOR_VISITS_DATE_RANGE_INVALID';
 end if;
 select jsonb_build_object('visits',coalesce(sum(visits),0),
  'unique_browsers',coalesce(sum(unique_browsers),0),
  'ad_visits',coalesce(sum(ad_visits),0),'from',p_from,'to',p_to)
 into result from public.kinto_store_visits_daily_v171
 where store_id=sid and visit_day between p_from and p_to;
 return result;
end $$;
revoke all on function public.vendor_store_visits_v171(text,date,date) from public,anon,authenticated;
grant execute on function public.vendor_store_visits_v171(text,date,date) to anon,authenticated;
-- Run this separately via a reviewed daily scheduler to cap dedup storage:
-- delete from private.kinto_store_visit_dedupe_v171
-- where visit_day < (now() at time zone 'Europe/Istanbul')::date - 35;
-- V171 must not be enabled at scale until scheduled retention is installed.
notify pgrst,'reload schema';
commit;
