\set ON_ERROR_STOP on
CREATE ROLE service_role;CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA extensions;CREATE SCHEMA private;
CREATE EXTENSION pgcrypto;
-- Synthetic storage configuration only: no storage objects or customer files.
CREATE SCHEMA storage;
CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean,file_size_limit bigint,allowed_mime_types text[]);
INSERT INTO storage.buckets VALUES('chat-attachments',true,5242880,ARRAY['image/jpeg']),('product-review-images',true,51200,ARRAY['image/jpeg','image/png','image/webp']),('private-unrelated-test',false,NULL,NULL);
ALTER TABLE storage.buckets ADD COLUMN versioning_status text DEFAULT 'DISABLED';
CREATE TABLE public.customers(id uuid PRIMARY KEY,name text,phone text,email text,code text,password text);
CREATE TABLE public.orders(id uuid PRIMARY KEY,customer_id uuid REFERENCES public.customers(id),status text,details jsonb);
CREATE TABLE public.local_stores(id uuid PRIMARY KEY);
CREATE TABLE public.local_products(id uuid PRIMARY KEY,store_id uuid REFERENCES public.local_stores(id),product_name text,image_url text);
CREATE TABLE public.order_store_segments(id uuid PRIMARY KEY,order_id uuid REFERENCES public.orders(id),store_id uuid REFERENCES public.local_stores(id),items_snapshot jsonb);
-- Full review schema and shipped review/session implementations, not a fake success RPC.
\ir ../../supabase/migrations/20260911_v131_product_reviews_schema.sql
\ir ../../supabase/migrations/20260911_v132_product_reviews_customer_contract.sql
\ir ../../supabase/migrations/20260912_v137_product_review_order_customer_compat.sql
\ir ../../supabase/migrations/20260912_v151_review_submit_snapshot_compat.sql
CREATE TABLE public.product_review_image_payloads(image_id uuid PRIMARY KEY REFERENCES public.product_review_images(id)ON DELETE CASCADE,image_bytes bytea);
\ir ../../supabase/migrations/20260912_v140_storefront_published_reviews.sql
\ir ../../supabase/migrations/20260912_v141_review_lightbox_helpful.sql
-- Observed v150 upload-ticket ownership; synthetic fixture only, no Storage objects.
CREATE TABLE private.product_review_upload_tickets_v150(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid NOT NULL REFERENCES public.product_reviews(id)ON DELETE CASCADE,customer_id uuid NOT NULL REFERENCES public.customers(id)ON DELETE CASCADE,storage_path text NOT NULL UNIQUE,mime_type text NOT NULL,byte_size integer NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
-- Match the shipped admin-session storage/validator without unrelated admin login setup.
CREATE TABLE public.admin_sessions_v147(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),admin_id text,token_hash bytea,expires_at timestamptz,revoked_at timestamptz,last_seen_at timestamptz DEFAULT now());
\ir admin-validator.sql
-- Load exact owner-exported session/identity/review definitions into the disposable fixture only.
\ir owner-session-contract-fixture.sql
CREATE TABLE public.test_preservation_snapshot(kind text PRIMARY KEY,payload text);
INSERT INTO public.test_preservation_snapshot VALUES('functions',(SELECT jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private')));
\ir ../../sql/kinto-privacy-controls-v1.sql

\ir ../../sql/kinto-privacy-media-v1.sql

\ir ../../sql/kinto-privacy-chat-v1.sql

\ir ../../sql/kinto-privacy-review-erasure-v1.sql

\ir ../../sql/kinto-privacy-progress-v1.sql

\ir ../../sql/kinto-privacy-checkpoint-v1.sql
