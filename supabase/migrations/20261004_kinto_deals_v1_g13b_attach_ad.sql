-- G13B: attach a compressed ad only to an editable draft owned by the verified vendor session.
begin;
do $g13check$ begin
 if to_regprocedure('public.kinto_deals_v1_vendor_drafts_g4(text,uuid,integer)') is null then
  raise exception 'G13_REQUIRES_G4_VENDOR_DRAFT_SIGNATURE';
 end if;
end $g13check$;
create or replace function public.kinto_deals_v1_attach_ad_g13(
 p_session_token text,p_campaign_id uuid,p_object_path text,p_byte_size integer,p_width integer,p_height integer)
returns jsonb language plpgsql volatile security definer
set search_path=public,private,pg_temp as $fn$
declare v_drafts jsonb;v_old text;v_status text;
begin
 if p_campaign_id is null or p_object_path is null or p_byte_size not between 32 and 204800
  or p_width not between 1 and 1200 or p_height not between 1 and 1200
  or p_object_path !~ ('^' || p_campaign_id::text || '/[0-9a-f-]{36}[.]webp$')
 then raise exception 'G13_INVALID_AD_METADATA' using errcode='22023';end if;
 -- Reuse the already deployed store-scoped vendor draft reader to prove session + ownership.
 v_drafts:=public.kinto_deals_v1_vendor_drafts_g4(p_session_token,p_campaign_id,1);
 if jsonb_array_length(coalesce(v_drafts->'items','[]'::jsonb))<>1
  or v_drafts#>>'{items,0,id}'<>p_campaign_id::text
 then raise exception 'G13_DRAFT_NOT_OWNED' using errcode='28000';end if;
 select status into v_status from public.kinto_deals_v1_campaigns where id=p_campaign_id for update;
 if v_status is distinct from 'draft' then raise exception 'G13_DRAFT_LOCKED' using errcode='55000';end if;
 -- Reject paths not uploaded to our dedicated private bucket.
 if not exists(select 1 from storage.objects where bucket_id='kinto-merchant-campaign-ads' and name=p_object_path)
 then raise exception 'G13_OBJECT_MISSING' using errcode='P0002';end if;
 select object_path into v_old from public.kinto_deals_v1_ad_assets_g13 where campaign_id=p_campaign_id for update;
 insert into public.kinto_deals_v1_ad_assets_g13(campaign_id,object_path,byte_size,width,height)
 values(p_campaign_id,p_object_path,p_byte_size,p_width,p_height)
 on conflict(campaign_id) do update set object_path=excluded.object_path,byte_size=excluded.byte_size,
 width=excluded.width,height=excluded.height,updated_at=now();
 if v_old is not null and v_old<>p_object_path then
  insert into public.kinto_deals_v1_ad_cleanup_g13(object_path,campaign_id)
  values(v_old,p_campaign_id) on conflict(object_path) do nothing;
 end if;
 return jsonb_build_object('ok',true,'campaign_id',p_campaign_id);
end;$fn$;
revoke all on function public.kinto_deals_v1_attach_ad_g13(text,uuid,text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_attach_ad_g13(text,uuid,text,integer,integer,integer) to service_role;
commit;
