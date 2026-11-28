-- KINTO G16 isolated card assets rollback — REVIEW ONLY.
-- Does NOT delete existing G16 methods, admin OTP, orders, invoices or stock.
-- Run only if isolated extension was explicitly installed and is being retired.
-- Private bucket cleanup: existing objects must be reviewed/remediated first.
begin;
drop function if exists public.kinto_g16_card_asset_commit_v1(text,uuid,text,uuid,text);
drop function if exists public.kinto_g16_employee_card_catalogue_v1(text);
drop table if exists public.kinto_g16_card_image_challenges_v1;
drop table if exists public.kinto_g16_card_assets_v1;
-- An empty bucket can be removed. If objects exist, leave it in place and
-- require separately approved secure deletion of media, not automatic deletion.
delete from storage.buckets b
 where b.id='kinto-g16-card-images-v1'
  and not exists(select 1 from storage.objects o where o.bucket_id=b.id);
commit;
