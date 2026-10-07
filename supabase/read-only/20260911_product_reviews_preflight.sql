-- KINTO product reviews preflight.
-- READ ONLY: this file does not create, alter, update, insert, or delete anything.

begin transaction read only;

-- 1) Required relations.
select
  dependency,
  relation_name,
  case when relation_name is null then 'MISSING' else 'OK' end as result
from (
  values
    ('customers', to_regclass('public.customers')),
    ('orders', to_regclass('public.orders')),
    ('local_stores', to_regclass('public.local_stores')),
    ('local_products', to_regclass('public.local_products')),
    ('order_store_segments', to_regclass('public.order_store_segments')),
    ('storage_buckets', to_regclass('storage.buckets'))
) as required(dependency, relation_name);

-- 2) Required columns and accepted data types.
with required(table_schema, table_name, column_name, accepted_udt_names) as (
  values
    ('public','customers','id',array['uuid']),
    ('public','customers','name',array['text','varchar']),
    ('public','customers','code',array['text','varchar']),
    ('public','customers','phone',array['text','varchar']),
    ('public','customers','email',array['text','varchar']),
    ('public','customers','password',array['text','varchar']),
    ('public','orders','id',array['uuid']),
    ('public','orders','customer_id',array['uuid']),
    ('public','orders','status',array['text','varchar']),
    ('public','orders','details',array['json','jsonb','text','varchar']),
    ('public','orders','created_at',array['timestamptz','timestamp']),
    ('public','local_stores','id',array['uuid']),
    ('public','local_products','id',array['uuid']),
    ('public','local_products','store_id',array['uuid']),
    ('public','local_products','product_name',array['text','varchar']),
    ('public','local_products','image_url',array['text','varchar']),
    ('public','order_store_segments','id',array['uuid']),
    ('public','order_store_segments','order_id',array['uuid']),
    ('public','order_store_segments','store_id',array['uuid']),
    ('public','order_store_segments','items_snapshot',array['jsonb'])
)
select
  r.table_schema,
  r.table_name,
  r.column_name,
  c.udt_name as actual_udt_name,
  r.accepted_udt_names,
  case
    when c.column_name is null then 'MISSING'
    when c.udt_name = any(r.accepted_udt_names) then 'OK'
    else 'TYPE_MISMATCH'
  end as result
from required r
left join information_schema.columns c
  on c.table_schema = r.table_schema
 and c.table_name = r.table_name
 and c.column_name = r.column_name
order by r.table_name, r.column_name;

-- 3) Exact identifier types used by the proposed foreign keys.
select
  n.nspname as table_schema,
  c.relname as table_name,
  a.attname as column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) as actual_type
from pg_catalog.pg_attribute a
join pg_catalog.pg_class c on c.oid = a.attrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (c.relname, a.attname) in (
    ('customers','id'),
    ('orders','id'),
    ('orders','customer_id'),
    ('local_stores','id'),
    ('local_products','id'),
    ('local_products','store_id'),
    ('order_store_segments','id'),
    ('order_store_segments','order_id'),
    ('order_store_segments','store_id')
  )
  and a.attnum > 0
  and not a.attisdropped
order by c.relname, a.attname;

-- 4) Required PostgreSQL functions/extensions.
with required_function(name) as (
  values ('digest'), ('crypt'), ('gen_random_bytes'), ('hashtextextended')
)
select
  r.name,
  exists (
    select 1
    from pg_catalog.pg_proc p
    where p.proname = r.name
  ) as available,
  case when exists (
    select 1 from pg_catalog.pg_proc p where p.proname = r.name
  ) then 'OK' else 'MISSING' end as result
from required_function r
order by r.name;

select
  e.extname,
  e.extversion,
  case when e.extname = 'pgcrypto' then 'OK' else 'INFO' end as result
from pg_catalog.pg_extension e
where e.extname in ('pgcrypto','plpgsql')
order by e.extname;

-- 5) Detect pre-existing review objects. All should be ABSENT before V131.
select
  object_name,
  relation_name,
  case when relation_name is null then 'ABSENT_OK' else 'EXISTS_REVIEW_REQUIRED' end as result
from (
  values
    ('product_reviews', to_regclass('public.product_reviews')),
    ('product_review_images', to_regclass('public.product_review_images')),
    ('customer_review_sessions', to_regclass('public.customer_review_sessions')),
    ('customer_review_login_attempts', to_regclass('public.customer_review_login_attempts'))
) as review_objects(object_name, relation_name);

-- 6) Detect an existing bucket without changing it.
select
  'product-review-images' as bucket_id,
  exists (
    select 1 from storage.buckets b where b.id = 'product-review-images'
  ) as already_exists,
  case when exists (
    select 1 from storage.buckets b where b.id = 'product-review-images'
  ) then 'EXISTS_REVIEW_REQUIRED' else 'ABSENT_OK' end as result;

-- 7) Verify the columns used by the bucket migration.
select
  c.column_name,
  c.udt_name,
  case
    when c.column_name in ('id','name','public','file_size_limit','allowed_mime_types') then 'OK'
    else 'INFO'
  end as result
from information_schema.columns c
where c.table_schema = 'storage'
  and c.table_name = 'buckets'
  and c.column_name in ('id','name','public','file_size_limit','allowed_mime_types')
order by c.ordinal_position;

commit;
