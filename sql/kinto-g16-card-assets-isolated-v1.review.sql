-- KINTO G16 isolated card-image metadata and read-only employee catalogue.
-- REVIEW ONLY. DO NOT DEPLOY until security review/OTP image-approval Edge flow.
-- No modifications to orders, invoices, payment states, inventory or existing G16 functions.
begin;
create table if not exists public.kinto_g16_card_assets_v1(
 method_id uuid primary key references public.kinto_payment_methods_g16(id) on delete restrict,
 image_object_key text,
 is_default boolean not null default false,
 updated_at timestamptz not null default now(),
 updated_by text,
 constraint kinto_g16_card_assets_image_key check (
  image_object_key is null or
  (char_length(image_object_key) between 55 and 180 and
   image_object_key ~ '^g16-cards/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{32,64}[.]webp$')
 )
);
-- A preferred/default card is optional; never more than one.
create unique index if not exists kinto_g16_card_assets_default_one_v1
 on public.kinto_g16_card_assets_v1(is_default) where is_default = true;
alter table public.kinto_g16_card_assets_v1 enable row level security;
revoke all on public.kinto_g16_card_assets_v1 from public, anon, authenticated;
-- The bucket is PRIVATE. No direct browser storage policies are installed.
-- A future dedicated Edge function will validate WebP bytes and OTP, then use
-- service role to write a server-generated, immutable object key.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('kinto-g16-card-images-v1','kinto-g16-card-images-v1',false,204800,array['image/webp'])
 on conflict (id) do nothing;

-- All image/default metadata writes require the one-time OTP commit function below.

-- Employee session is independently verified server-side. Read-only,
-- and only returns enabled + destination-verified manual cards.
create or replace function public.kinto_g16_employee_card_catalogue_v1(
 p_employee_session_token text
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $$
declare v_actor jsonb; v_cards jsonb;
begin
 v_actor:=public.employee_session_identity_v143(p_employee_session_token);
 if v_actor->>'ok'<>'true' or
  lower(btrim(coalesce(v_actor->'employee'->>'role',''))) not in ('employee','موظف') then
  raise exception 'EMPLOYEE_SESSION_REQUIRED';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,'label',m.label,'provider',m.provider,
  'recipient_name',m.recipient_name,'account_reference',m.account_reference,
  'instructions',m.instructions,'image_object_key',a.image_object_key,
  'is_default',coalesce(a.is_default,false),'destination_verified_at',m.destination_verified_at,
  'is_enabled',m.is_enabled,'method_type',m.method_type
 ) order by coalesce(a.is_default,false) desc,m.created_at,m.id),'[]'::jsonb)
 into v_cards from public.kinto_payment_methods_g16 m
 left join public.kinto_g16_card_assets_v1 a on a.method_id=m.id
 where m.method_type='manual' and m.is_enabled=true and m.destination_verified_at is not null
  and nullif(btrim(coalesce(m.account_reference,'')),'') is not null
  and nullif(btrim(coalesce(m.recipient_name,'')),'') is not null;
 return jsonb_build_object('ok',true,'cards',v_cards);
end $$;
revoke all on function public.kinto_g16_employee_card_catalogue_v1(text) from public;
grant execute on function public.kinto_g16_employee_card_catalogue_v1(text) to anon,authenticated,service_role;
-- Separate one-time OTP proof for card image/default changes. No changes to G16 OTP tables.
create table if not exists public.kinto_g16_card_image_challenges_v1(
 id uuid primary key default gen_random_uuid(),
 admin_id text not null,
 method_id uuid not null references public.kinto_payment_methods_g16(id) on delete restrict,
 make_default boolean not null default false,
 code_hash text not null check (code_hash ~ '^[0-9a-f]{64}
 attempts smallint not null default 0 check (attempts between 0 and 5),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists kinto_g16_card_image_challenges_admin_recent_v1
 on public.kinto_g16_card_image_challenges_v1(admin_id,created_at desc);
alter table public.kinto_g16_card_image_challenges_v1 enable row level security;
revoke all on public.kinto_g16_card_image_challenges_v1 from public,anon,authenticated;
grant select,insert,update on public.kinto_g16_card_image_challenges_v1 to service_role;

-- Atomically verify AND consume the image OTP, then apply metadata.
-- Caller may upload only a server-validated private object. On SQL failure the
-- Edge function must remove the orphan uploaded blob.
create or replace function public.kinto_g16_card_asset_commit_v1(
 p_admin_session_token text, p_challenge_id uuid, p_otp_hash text,
 p_method_id uuid, p_image_object_key text
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $
declare v_admin text; v_ch public.kinto_g16_card_image_challenges_v1%rowtype;
 v_method public.kinto_payment_methods_g16%rowtype;
begin
 v_admin:=private.require_admin_session_v147(p_admin_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'ADMIN_SESSION_REQUIRED'; end if;
 select * into v_ch from public.kinto_g16_card_image_challenges_v1
 where id=p_challenge_id for update;
 if not found or v_ch.admin_id<>v_admin or v_ch.method_id<>p_method_id
    or v_ch.consumed_at is not null or v_ch.expires_at<=now()
    or v_ch.attempts>=5 then raise exception 'IMAGE_CHALLENGE_INVALID'; end if;
 if p_otp_hash is null or v_ch.code_hash<>p_otp_hash then
  update public.kinto_g16_card_image_challenges_v1
   set attempts=least(attempts+1,5) where id=p_challenge_id;
  return jsonb_build_object('ok',false,'error','IMAGE_CODE_INVALID');
 end if;
 select * into v_method from public.kinto_payment_methods_g16 where id=p_method_id for update;
 if not found or v_method.method_type<>'manual' or v_method.is_enabled is not true
    or v_method.destination_verified_at is null then
  raise exception 'CARD_METHOD_NOT_AUTHORIZED';
 end if;
 if p_image_object_key is null or p_image_object_key !~
  ('^g16-cards/' || p_method_id::text || '/[0-9a-f]{32,64}[.]webp
  raise exception 'CARD_OBJECT_KEY_INVALID';
 end if;
 perform pg_advisory_xact_lock(160025);
 if v_ch.make_default then
  update public.kinto_g16_card_assets_v1
   set is_default=false,updated_at=now(),updated_by=v_admin
   where is_default=true and method_id<>p_method_id;
 end if;
 insert into public.kinto_g16_card_assets_v1(method_id,image_object_key,is_default,updated_by)
 values(p_method_id,p_image_object_key,v_ch.make_default,v_admin)
 on conflict(method_id) do update set
  image_object_key=excluded.image_object_key,is_default=excluded.is_default,
  updated_at=now(),updated_by=excluded.updated_by;
 update public.kinto_g16_card_image_challenges_v1
  set consumed_at=now() where id=p_challenge_id;
 return jsonb_build_object('ok',true,'method_id',p_method_id);
end $;
revoke all on function public.kinto_g16_card_asset_commit_v1(text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.kinto_g16_card_asset_commit_v1(text,uuid,text,uuid,text) to service_role;

commit;
),
 attempts smallint not null default 0 check (attempts between 0 and 5),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists kinto_g16_card_image_challenges_admin_recent_v1
 on public.kinto_g16_card_image_challenges_v1(admin_id,created_at desc);
alter table public.kinto_g16_card_image_challenges_v1 enable row level security;
revoke all on public.kinto_g16_card_image_challenges_v1 from public,anon,authenticated;
grant select,insert,update on public.kinto_g16_card_image_challenges_v1 to service_role;

-- Atomically verify AND consume the image OTP, then apply metadata.
-- Caller may upload only a server-validated private object. On SQL failure the
-- Edge function must remove the orphan uploaded blob.
create or replace function public.kinto_g16_card_asset_commit_v1(
 p_admin_session_token text, p_challenge_id uuid, p_otp_hash text,
 p_method_id uuid, p_image_object_key text
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $
declare v_admin text; v_ch public.kinto_g16_card_image_challenges_v1%rowtype;
 v_method public.kinto_payment_methods_g16%rowtype;
begin
 v_admin:=private.require_admin_session_v147(p_admin_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'ADMIN_SESSION_REQUIRED'; end if;
 select * into v_ch from public.kinto_g16_card_image_challenges_v1
 where id=p_challenge_id for update;
 if not found or v_ch.admin_id<>v_admin or v_ch.method_id<>p_method_id
    or v_ch.consumed_at is not null or v_ch.expires_at<=now()
    or v_ch.attempts>=5 then raise exception 'IMAGE_CHALLENGE_INVALID'; end if;
 if p_otp_hash is null or v_ch.code_hash<>p_otp_hash then
  update public.kinto_g16_card_image_challenges_v1
   set attempts=least(attempts+1,5) where id=p_challenge_id;
  return jsonb_build_object('ok',false,'error','IMAGE_CODE_INVALID');
 end if;
 select * into v_method from public.kinto_payment_methods_g16 where id=p_method_id for update;
 if not found or v_method.method_type<>'manual' or v_method.is_enabled is not true
    or v_method.destination_verified_at is null then
  raise exception 'CARD_METHOD_NOT_AUTHORIZED';
 end if;
 if p_image_object_key is null or p_image_object_key !~
  ('^g16-cards/' || p_method_id::text || '/[0-9a-f]{32,64}[.]webp) then
  raise exception 'CARD_OBJECT_KEY_INVALID';
 end if;
 perform pg_advisory_xact_lock(160025);
 if v_ch.make_default then
  update public.kinto_g16_card_assets_v1
   set is_default=false,updated_at=now(),updated_by=v_admin
   where is_default=true and method_id<>p_method_id;
 end if;
 insert into public.kinto_g16_card_assets_v1(method_id,image_object_key,is_default,updated_by)
 values(p_method_id,p_image_object_key,v_ch.make_default,v_admin)
 on conflict(method_id) do update set
  image_object_key=excluded.image_object_key,is_default=excluded.is_default,
  updated_at=now(),updated_by=excluded.updated_by;
 update public.kinto_g16_card_image_challenges_v1
  set consumed_at=now() where id=p_challenge_id;
 return jsonb_build_object('ok',true,'method_id',p_method_id);
end $;
revoke all on function public.kinto_g16_card_asset_commit_v1(text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.kinto_g16_card_asset_commit_v1(text,uuid,text,uuid,text) to service_role;

commit;
) then
  raise exception 'CARD_OBJECT_KEY_INVALID';
 end if;
 perform pg_advisory_xact_lock(160025);
 if v_ch.make_default then
  update public.kinto_g16_card_assets_v1
   set is_default=false,updated_at=now(),updated_by=v_admin
   where is_default=true and method_id<>p_method_id;
 end if;
 insert into public.kinto_g16_card_assets_v1(method_id,image_object_key,is_default,updated_by)
 values(p_method_id,p_image_object_key,v_ch.make_default,v_admin)
 on conflict(method_id) do update set
  image_object_key=excluded.image_object_key,is_default=excluded.is_default,
  updated_at=now(),updated_by=excluded.updated_by;
 update public.kinto_g16_card_image_challenges_v1
  set consumed_at=now() where id=p_challenge_id;
 return jsonb_build_object('ok',true,'method_id',p_method_id);
end $;
revoke all on function public.kinto_g16_card_asset_commit_v1(text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.kinto_g16_card_asset_commit_v1(text,uuid,text,uuid,text) to service_role;

commit;
),
 attempts smallint not null default 0 check (attempts between 0 and 5),
 expires_at timestamptz not null,
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
create index if not exists kinto_g16_card_image_challenges_admin_recent_v1
 on public.kinto_g16_card_image_challenges_v1(admin_id,created_at desc);
alter table public.kinto_g16_card_image_challenges_v1 enable row level security;
revoke all on public.kinto_g16_card_image_challenges_v1 from public,anon,authenticated;
grant select,insert,update on public.kinto_g16_card_image_challenges_v1 to service_role;

-- Atomically verify AND consume the image OTP, then apply metadata.
-- Caller may upload only a server-validated private object. On SQL failure the
-- Edge function must remove the orphan uploaded blob.
create or replace function public.kinto_g16_card_asset_commit_v1(
 p_admin_session_token text, p_challenge_id uuid, p_otp_hash text,
 p_method_id uuid, p_image_object_key text
) returns jsonb language plpgsql security definer
set search_path = public, private, pg_temp as $
declare v_admin text; v_ch public.kinto_g16_card_image_challenges_v1%rowtype;
 v_method public.kinto_payment_methods_g16%rowtype;
begin
 v_admin:=private.require_admin_session_v147(p_admin_session_token);
 if nullif(btrim(v_admin),'') is null then raise exception 'ADMIN_SESSION_REQUIRED'; end if;
 select * into v_ch from public.kinto_g16_card_image_challenges_v1
 where id=p_challenge_id for update;
 if not found or v_ch.admin_id<>v_admin or v_ch.method_id<>p_method_id
    or v_ch.consumed_at is not null or v_ch.expires_at<=now()
    or v_ch.attempts>=5 then raise exception 'IMAGE_CHALLENGE_INVALID'; end if;
 if p_otp_hash is null or v_ch.code_hash<>p_otp_hash then
  update public.kinto_g16_card_image_challenges_v1
   set attempts=least(attempts+1,5) where id=p_challenge_id;
  return jsonb_build_object('ok',false,'error','IMAGE_CODE_INVALID');
 end if;
 select * into v_method from public.kinto_payment_methods_g16 where id=p_method_id for update;
 if not found or v_method.method_type<>'manual' or v_method.is_enabled is not true
    or v_method.destination_verified_at is null then
  raise exception 'CARD_METHOD_NOT_AUTHORIZED';
 end if;
 if p_image_object_key is null or p_image_object_key !~
  ('^g16-cards/' || p_method_id::text || '/[0-9a-f]{32,64}[.]webp) then
  raise exception 'CARD_OBJECT_KEY_INVALID';
 end if;
 perform pg_advisory_xact_lock(160025);
 if v_ch.make_default then
  update public.kinto_g16_card_assets_v1
   set is_default=false,updated_at=now(),updated_by=v_admin
   where is_default=true and method_id<>p_method_id;
 end if;
 insert into public.kinto_g16_card_assets_v1(method_id,image_object_key,is_default,updated_by)
 values(p_method_id,p_image_object_key,v_ch.make_default,v_admin)
 on conflict(method_id) do update set
  image_object_key=excluded.image_object_key,is_default=excluded.is_default,
  updated_at=now(),updated_by=excluded.updated_by;
 update public.kinto_g16_card_image_challenges_v1
  set consumed_at=now() where id=p_challenge_id;
 return jsonb_build_object('ok',true,'method_id',p_method_id);
end $;
revoke all on function public.kinto_g16_card_asset_commit_v1(text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.kinto_g16_card_asset_commit_v1(text,uuid,text,uuid,text) to service_role;

commit;
