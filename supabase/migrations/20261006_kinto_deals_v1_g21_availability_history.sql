-- G21: one canonical read-only availability verdict for public campaigns and merchant history.
-- Reuses the same existing variant/matrix stock helpers as V93; never mutates stock or orders.
begin;

create or replace function private.kinto_deals_v1_unavailable_reason_g21(p_campaign_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path=public,private,pg_temp
as $g21$
declare
 c public.kinto_deals_v1_campaigns%rowtype;
 cp record;
 p public.local_products%rowtype;
 probe jsonb;
 opts jsonb;
 used_count bigint;
 gift_is_campaign_product boolean;
begin
 select * into c from public.kinto_deals_v1_campaigns where id=p_campaign_id;
 if not found then return jsonb_build_object('code','missing_campaign'); end if;

 if c.ends_at<=statement_timestamp() then
  return jsonb_build_object('code','time_expired');
 end if;

 if c.max_total_redemptions is not null then
  select count(*) into used_count
  from public.kinto_deals_v1_redemptions r
  where r.campaign_id=c.id and r.state in ('pending','confirmed');
  if used_count>=c.max_total_redemptions then
   return jsonb_build_object('code','quota_exhausted');
  end if;
 end if;

 for cp in
  select x.product_id,x.selected_options,lp.product_name
  from public.kinto_deals_v1_products x
  left join public.local_products lp on lp.id=x.product_id and lp.store_id=c.store_id
  where x.campaign_id=c.id
  order by x.product_id
 loop
  select * into p from public.local_products
  where id=cp.product_id and store_id=c.store_id;
  if not found or coalesce(p.is_out_of_stock,false)
     or (p.stock_quantity is not null and p.stock_quantity<1) then
   return jsonb_build_object('code','product_out_of_stock','product_id',cp.product_id,'product_name',cp.product_name);
  end if;
  probe:=jsonb_build_object(
   'color',coalesce(cp.selected_options->>'color',''),
   'size',coalesce(cp.selected_options->>'size',''),
   'volume',coalesce(cp.selected_options->>'volume','')
  );
  begin
   opts:=public.meshwar_adjust_variant_stock(coalesce(p.options,'{}'::jsonb),probe,1,-1);
   opts:=public.meshwar_adjust_matrix_stock(opts,probe,1,-1);
  exception when others then
   return jsonb_build_object('code','product_variant_out_of_stock','product_id',cp.product_id,'product_name',cp.product_name);
  end;
 end loop;

 if c.gift_product_id is not null then
  select * into p from public.local_products
  where id=c.gift_product_id and store_id=c.store_id;
  select exists(select 1 from public.kinto_deals_v1_products x
    where x.campaign_id=c.id and x.product_id=c.gift_product_id)
   into gift_is_campaign_product;
  if not found or coalesce(p.is_out_of_stock,false)
     or (p.stock_quantity is not null and p.stock_quantity < case when gift_is_campaign_product then 2 else 1 end) then
   return jsonb_build_object('code','gift_out_of_stock','product_id',c.gift_product_id,'product_name',p.product_name);
  end if;
  probe:=jsonb_build_object(
   'color',coalesce(c.gift_selected_options->>'color',''),
   'size',coalesce(c.gift_selected_options->>'size',''),
   'volume',coalesce(c.gift_selected_options->>'volume','')
  );
  begin
   opts:=public.meshwar_adjust_variant_stock(coalesce(p.options,'{}'::jsonb),probe,case when gift_is_campaign_product then 2 else 1 end,-1);
   opts:=public.meshwar_adjust_matrix_stock(opts,probe,case when gift_is_campaign_product then 2 else 1 end,-1);
  exception when others then
   return jsonb_build_object('code','gift_variant_out_of_stock','product_id',c.gift_product_id,'product_name',p.product_name);
  end;
 end if;

 return null;
end;
$g21$;

revoke all on function private.kinto_deals_v1_unavailable_reason_g21(uuid) from public,anon,authenticated;

create or replace function public.kinto_deals_v1_public_feed_g7(p_store_id uuid default null)
returns table(campaign_id uuid,store_id uuid,title text,description text,kind text,starts_at timestamptz,ends_at timestamptz)
language sql stable security definer set search_path=public,private,pg_temp
as $feed$
 select c.id,c.store_id,c.title,c.description,c.kind,c.starts_at,c.ends_at
 from public.kinto_deals_v1_campaigns c
 join public.kinto_deals_v1_publications_g7 pub on pub.campaign_id=c.id
 join public.local_stores st on st.id=c.store_id
 join lateral (
   select s.id,s.review_state from public.kinto_deals_v1_submissions s
   where s.campaign_id=c.id order by s.submitted_at desc,s.id desc limit 1
 ) latest on true
 where pub.published=true and pub.published_at is not null
   and c.status='submitted' and st.status='active'
   and c.starts_at<=statement_timestamp() and c.ends_at>statement_timestamp()
   and latest.review_state='acknowledged'
   and exists(select 1 from public.kinto_deals_v1_review_events e
     where e.submission_id=latest.id and e.campaign_id=c.id and e.store_id=c.store_id
       and e.decision='approved')
   and private.kinto_deals_v1_unavailable_reason_g21(c.id) is null
   and (p_store_id is null or c.store_id=p_store_id)
 order by c.ends_at asc,c.id asc limit 200
$feed$;

comment on function public.kinto_deals_v1_public_feed_g7(uuid) is
'Published approved live campaigns only; G21 also hides campaigns whose required product/gift stock or frozen variant is unavailable.';

create or replace function public.kinto_deals_v1_vendor_review_feed_g3(
 p_session_token text,p_limit integer default 30)
returns jsonb language plpgsql security definer
set search_path=public,private,pg_temp as $deals$
declare v_store uuid; v_items jsonb; v_pending bigint;
begin
 v_store:=private.require_vendor_session(p_session_token);
 if v_store is null then raise exception 'DEALS_VENDOR_SESSION_REQUIRED' using errcode='28000'; end if;
 if p_limit is null or p_limit not between 1 and 100 then
   raise exception 'DEALS_INVALID_PAGE_LIMIT' using errcode='22023'; end if;
 select count(*) into v_pending from public.kinto_deals_v1_submissions s
 where s.store_id=v_store and s.review_state='pending';
 select coalesce(jsonb_agg(to_jsonb(q) order by q.submitted_at desc),'[]'::jsonb)
 into v_items from (
  select s.id as submission_id,s.campaign_id,s.title_snapshot,s.summary_snapshot,
   s.submitted_at,s.reviewed_at,s.review_state,s.rejection_reason,s.revision,
   c.status as campaign_status,c.kind,c.starts_at,c.ends_at,
   private.kinto_deals_v1_unavailable_reason_g21(c.id) as ended_reason,
   case
    when s.review_state='rejected' then 'rejected'
    when s.review_state='pending' then 'pending_review'
    when s.review_state='acknowledged' and c.status='paused' then 'paused'
    when s.review_state='acknowledged' and private.kinto_deals_v1_unavailable_reason_g21(c.id) is not null then 'expired'
    when s.review_state='acknowledged' and c.starts_at>clock_timestamp() then 'approved_scheduled'
    when s.review_state='acknowledged' and c.status='active' then 'active'
    when s.review_state='acknowledged' then 'approved_not_published'
    else 'unknown'
   end as display_state
  from public.kinto_deals_v1_submissions s
  join public.kinto_deals_v1_campaigns c on c.id=s.campaign_id and c.store_id=s.store_id
  where s.store_id=v_store
  order by s.submitted_at desc,s.id desc limit p_limit
 ) q;
 return jsonb_build_object('pending_count',v_pending,'items',v_items);
end;
$deals$;

revoke all on function public.kinto_deals_v1_vendor_review_feed_g3(text,integer)
 from public,anon,authenticated;
grant execute on function public.kinto_deals_v1_vendor_review_feed_g3(text,integer)
 to anon,authenticated;

notify pgrst,'reload schema';
commit;
