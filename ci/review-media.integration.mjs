import fs from 'node:fs';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
let db;const native=!!process.env.KINTO_TEST_DATABASE_URL;
if(native){const u=new URL(process.env.KINTO_TEST_DATABASE_URL);assert(['localhost','127.0.0.1'].includes(u.hostname)&&u.pathname==='/kinto_test');const pg=await import(process.env.KINTO_PG_MODULE||'pg'),Client=pg.Client||pg.default.Client;const boot=new Client({connectionString:u.href});await boot.connect();await boot.query('CREATE DATABASE kinto_review_media_test');await boot.end();u.pathname='/kinto_review_media_test';const c=new Client({connectionString:u.href});await c.connect();db={exec:s=>c.query(s),query:(s,a)=>c.query(s,a),close:()=>c.end()};}
else{const p=process.env.KINTO_PGLITE_MODULE;const {PGlite}=await import(p||'@electric-sql/pglite');const {pgcrypto}=await import(p?new URL('./contrib/pgcrypto.js',p.startsWith('file:')?p:pathToFileURL(p)).href:'@electric-sql/pglite/contrib/pgcrypto');db=new PGlite({extensions:{pgcrypto}})}
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
await db.exec(`CREATE EXTENSION pgcrypto;CREATE SCHEMA private;CREATE SCHEMA extensions;CREATE SCHEMA storage;
 DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon;END IF;IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;END $$;
 CREATE TABLE customer_review_sessions(customer_id uuid,token_hash bytea,expires_at timestamptz,revoked_at timestamptz,last_seen_at timestamptz);
 CREATE TABLE product_reviews(id uuid PRIMARY KEY,customer_id uuid,moderation_status text);
 CREATE TABLE product_review_images(id uuid PRIMARY KEY,review_id uuid,storage_path text,mime_type text,byte_size integer,sort_order smallint,moderation_status text);
 CREATE TABLE private.product_review_media_policy_v149(singleton boolean,max_images smallint);INSERT INTO private.product_review_media_policy_v149 VALUES(true,1);
 CREATE TABLE private.product_review_upload_tickets_v150(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),review_id uuid,customer_id uuid,storage_path text UNIQUE,mime_type text,byte_size integer,expires_at timestamptz DEFAULT now()+interval '10 minutes',used_at timestamptz,created_at timestamptz DEFAULT now());
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,UNIQUE(bucket_id,name));
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;GRANT USAGE ON SCHEMA storage TO anon,authenticated;GRANT INSERT ON storage.objects TO anon,authenticated;
 CREATE POLICY legacy_open_insert ON storage.objects FOR INSERT TO anon,authenticated WITH CHECK(true);
 INSERT INTO customer_review_sessions VALUES('${id(1)}',digest('customer-one','sha256'),now()+interval '1 day',null,null),('${id(2)}',digest('customer-two','sha256'),now()+interval '1 day',null,null);
 INSERT INTO product_reviews VALUES('${id(10)}','${id(1)}','pending'),('${id(11)}','${id(2)}','pending'),('${id(12)}','${id(1)}','published'),('${id(13)}','${id(1)}','pending'),('${id(14)}','${id(1)}','pending');`);
const defs=JSON.parse(fs.readFileSync('ci/fixtures/review-media-definitions-20261018.json'));
for(const f of defs)await db.exec(f.definition);
await db.exec(`REVOKE ALL ON FUNCTION private.require_customer_review_session(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.review_storage_upload_allowed_v150(text,text,jsonb) FROM PUBLIC;GRANT EXECUTE ON FUNCTION private.review_storage_upload_allowed_v150(text,text,jsonb) TO anon,authenticated;
REVOKE ALL ON FUNCTION customer_create_review_image_upload_v150(text,uuid,text,integer),customer_finalize_review_image_upload_v150(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION customer_create_review_image_upload_v150(text,uuid,text,integer),customer_finalize_review_image_upload_v150(text,uuid) TO anon,authenticated;
CREATE POLICY kinto_remaining_asset_insert_v1 ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(CASE WHEN bucket_id='product-review-images' THEN private.review_storage_upload_allowed_v150(bucket_id,name,metadata) WHEN bucket_id IN ('category-images','cms-media') THEN false ELSE true END);`);
let role='anon',checks=0;
async function api(fn,args){await db.exec('SET ROLE '+role);try{return (await db.query(`SELECT public.${fn}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result}finally{await db.exec('RESET ROLE')}}
const ticket=(token='customer-one',review=id(10),mime='image/webp',size=14216)=>api('customer_create_review_image_upload_v150',[token,review,mime,size]);
const finalize=(t,token='customer-one')=>api('customer_finalize_review_image_upload_v150',[token,t.ticket_id]);
async function insert(t,metadata,bucket='product-review-images'){await db.exec('SET ROLE '+role);try{return await db.query('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES($1,$2,$3)',[bucket,t.storage_path,metadata===null?null:JSON.stringify(metadata)])}finally{await db.exec('RESET ROLE')}}
async function deny(fn,pattern=/SESSION|NOT_FOUND|INVALID|LOCKED|LIMIT|NOT_ALLOWED|row-level security|permission denied/){await assert.rejects(fn,pattern);checks++}
const pending=await ticket();
await deny(()=>insert(pending,null));await deny(()=>insert(pending,{mimetype:'image/webp',contentLength:14216}));
// Reproduces the reported preflight failure and second-submit quota failure before patching.
await deny(()=>ticket(),/LIMIT/);
const sql=fs.readFileSync('sql/kinto-review-image-upload-v1.sql','utf8');await db.exec(sql);await db.exec(sql);
for(role of ['anon','authenticated']){
 const retry=await ticket();assert.equal(retry.ticket_id,pending.ticket_id);assert.equal(retry.storage_path,pending.storage_path);checks++;
 for(const metadata of [null,{}, {mimetype:'image/webp'},{mimetype:'image/webp',contentLength:14216}]){
  await db.exec('BEGIN');try{await insert(retry,metadata)}finally{await db.exec('ROLLBACK')}checks++;
 }
 await deny(()=>insert({storage_path:'reviews/forged.webp'},null));
 await deny(()=>insert(retry,{mimetype:'image/png',size:14216}));
 await deny(()=>insert(retry,{mimetype:'image/webp',size:14215}));
 await deny(()=>insert(retry,{mimetype:'image/webp',size:'oops'}));
 await deny(()=>insert(retry,null,'category-images'));
 await deny(()=>ticket('customer-two'));await deny(()=>finalize(retry,'customer-two'));await deny(()=>ticket('bad'));await deny(()=>ticket('customer-one',id(12)));
 await deny(()=>finalize(retry));
}
role='anon';await insert(pending,{mimetype:'image/webp',size:14216});const done=await finalize(pending);assert(done.ok);assert.equal(done.status,'pending');checks++;
assert.equal((await db.query('SELECT count(*)::int n FROM product_review_images WHERE review_id=$1',[id(10)])).rows[0].n,1);checks++;
await deny(()=>finalize(pending));await deny(()=>ticket());
// Image remains pending; the public projection can only use published images after moderation.
assert.equal((await db.query("SELECT count(*)::int n FROM product_review_images WHERE moderation_status='published'")).rows[0].n,0);checks++;
await db.query("UPDATE product_reviews SET moderation_status='published' WHERE id=$1",[id(10)]);await db.query("UPDATE product_review_images SET moderation_status='published' WHERE review_id=$1",[id(10)]);assert.equal((await db.query("SELECT count(*)::int n FROM product_review_images WHERE moderation_status='published'")).rows[0].n,1);checks++;
const race=await ticket('customer-one',id(13));await insert(race,{mimetype:'image/webp',size:14216});await db.query("UPDATE product_reviews SET moderation_status='published' WHERE id=$1",[id(13)]);await deny(()=>finalize(race),/LOCKED/);
const exp=await ticket('customer-one',id(14));await db.query("UPDATE private.product_review_upload_tickets_v150 SET expires_at=now()-interval '1 second' WHERE id=$1",[exp.ticket_id]);await deny(()=>insert(exp,null));
await db.query("UPDATE customer_review_sessions SET revoked_at=now() WHERE customer_id=$1",[id(1)]);await deny(()=>ticket());await db.query('UPDATE customer_review_sessions SET revoked_at=null WHERE customer_id=$1',[id(1)]);
const renewed=await ticket('customer-one',id(14));assert.notEqual(renewed.ticket_id,exp.ticket_id);checks++;
// Null preflight metadata alone can never be finalized as an image.
await insert(renewed,null);await deny(()=>finalize(renewed));
const policies=(await db.query("SELECT policyname,qual,with_check FROM pg_policies WHERE schemaname='storage' ORDER BY policyname")).rows;
await db.exec(fs.readFileSync('sql/kinto-review-image-upload-rollback-v1.sql','utf8'));assert.deepEqual((await db.query("SELECT policyname,qual,with_check FROM pg_policies WHERE schemaname='storage' ORDER BY policyname")).rows,policies);checks++;
await db.query('DELETE FROM storage.objects WHERE name=$1',[renewed.storage_path]);await deny(()=>insert(renewed,null));
console.log(`PASS ${checks} review image checks (${native?'PostgreSQL':'PGlite'}): reproduce preflight/quota failure, real hashed sessions, actual restrictive RLS, retry reuse, strict metadata/finalize, moderation race, replay, expiry and rollback`);await db.close();
