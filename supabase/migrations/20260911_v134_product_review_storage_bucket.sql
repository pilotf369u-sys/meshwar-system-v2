-- KINTO V134: private review-image bucket only.
-- No anonymous storage.objects policy is created. Upload remains blocked until
-- the isolated, token-validating upload service is reviewed in phase two.

begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-review-images',
  'product-review-images',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do nothing;

commit;
