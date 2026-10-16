import fs from 'node:fs';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
let db;const native=Boolean(process.env.KINTO_TEST_DATABASE_URL);
if(native){const url=new URL(process.env.KINTO_TEST_DATABASE_URL);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/kinto_test','ISOLATED_LOCAL_TEST_DATABASE_REQUIRED');const pg=await import(process.env.KINTO_PG_MODULE||'pg'),Client=pg.Client||pg.default.Client;const bootstrap=new Client({connectionString:url.href});await bootstrap.connect();await bootstrap.query('CREATE DATABASE kinto_private_media_test');await bootstrap.end();url.pathname='/kinto_private_media_test';const c=new Client({connectionString:url.href});await c.connect();db={exec:s=>c.query(s),query:(s,a)=>c.query(s,a),close:()=>c.end()};await db.exec('CREATE EXTENSION pgcrypto');}
else{const modulePath=process.env.KINTO_PGLITE_MODULE;const {PGlite}=await import(modulePath||'@electric-sql/pglite');const {pgcrypto}=await import(modulePath?new URL('./contrib/pgcrypto.js',modulePath.startsWith('file:')?modulePath:pathToFileURL(modulePath)).href:'@electric-sql/pglite/contrib/pgcrypto');db=new PGlite({extensions:{pgcrypto}});await db.exec('CREATE EXTENSION pgcrypto');}

await db.exec(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF; END $$;
CREATE SCHEMA storage;CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean);
INSERT INTO storage.buckets VALUES('kinto-customer-notice-media',false),('kinto-merchant-campaign-ads',false),('product-images',true),('site-hero-media',true),('category-images',true),('chat-attachments',true),('product-review-images',true),('cms-media',true);
CREATE TABLE storage.objects(bucket_id text,name text,metadata jsonb DEFAULT '{}',PRIMARY KEY(bucket_id,name));ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon,authenticated,service_role;GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO anon,authenticated,service_role;
CREATE POLICY old_allow_all ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);
INSERT INTO storage.objects SELECT id,'existing','{}' FROM storage.buckets;`);
let count=0,apiRole='anon';
async function asRole(sql,args=[],role=apiRole){await db.exec('SET ROLE '+role);try{return await db.query(sql,args)}finally{await db.exec('RESET ROLE')}}
const privateBuckets=['kinto-customer-notice-media','kinto-merchant-campaign-ads'];
for(apiRole of ['anon','authenticated'])assert.equal((await asRole("SELECT * FROM storage.objects WHERE bucket_id=ANY($1)",[privateBuckets])).rows.length,2);
await db.exec(fs.readFileSync('sql/kinto-private-media-lockdown-v1.sql','utf8'));
for(apiRole of ['anon','authenticated'])for(const bucket of privateBuckets){
 assert.equal((await asRole('SELECT * FROM storage.objects WHERE bucket_id=$1',[bucket])).rows.length,0);count++;
 await assert.rejects(()=>asRole('INSERT INTO storage.objects VALUES($1,$2,$3)',[bucket,'forbidden',{}]),/row-level security/);count++;
 assert.equal((await asRole("UPDATE storage.objects SET metadata='{}' WHERE bucket_id=$1 RETURNING name",[bucket])).rows.length,0);count++;
 assert.equal((await asRole('DELETE FROM storage.objects WHERE bucket_id=$1 RETURNING name',[bucket])).rows.length,0);count++;
 await assert.rejects(()=>asRole("UPDATE storage.objects SET bucket_id=$1 WHERE bucket_id='category-images' AND name='existing'",[bucket]),/row-level security/);count++;
 await assert.rejects(()=>asRole("INSERT INTO storage.objects VALUES($1,'existing','{}') ON CONFLICT(bucket_id,name) DO UPDATE SET metadata=excluded.metadata",[bucket]),/row-level security/);count++;
}
for(const bucket of privateBuckets){
 assert.equal((await asRole('SELECT * FROM storage.objects WHERE bucket_id=$1',[bucket],'service_role')).rows.length,1);count++;
 await asRole("INSERT INTO storage.objects VALUES($1,'service-upload','{}')",[bucket],'service_role');count++;
 assert.equal((await asRole("UPDATE storage.objects SET metadata='{}' WHERE bucket_id=$1 AND name='service-upload' RETURNING name",[bucket],'service_role')).rows.length,1);count++;
 assert.equal((await asRole("DELETE FROM storage.objects WHERE bucket_id=$1 AND name='service-upload' RETURNING name",[bucket],'service_role')).rows.length,1);count++;
}
for(apiRole of ['anon','authenticated'])for(const bucket of ['product-images','site-hero-media','category-images','chat-attachments','product-review-images','cms-media']){
 assert.equal((await asRole('SELECT * FROM storage.objects WHERE bucket_id=$1',[bucket])).rows.length,1);
 await asRole('INSERT INTO storage.objects VALUES($1,$2,$3)',[bucket,'public-test',{}]);
 assert.equal((await asRole("UPDATE storage.objects SET metadata='{}' WHERE bucket_id=$1 AND name='public-test' RETURNING name",[bucket])).rows.length,1);
 assert.equal((await asRole("DELETE FROM storage.objects WHERE bucket_id=$1 AND name='public-test' RETURNING name",[bucket])).rows.length,1);count+=4;
}
await db.exec(fs.readFileSync('sql/kinto-private-media-rollback-v1.sql','utf8'));
assert.equal((await asRole('SELECT * FROM storage.objects WHERE bucket_id=ANY($1)',[privateBuckets])).rows.length,2);count++;
// Existing policy restrictions are not deleted or widened by this slice.
await db.exec(`CREATE POLICY existing_product_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon,authenticated WITH CHECK(bucket_id<>'product-images');`);
await db.exec(fs.readFileSync('sql/kinto-private-media-lockdown-v1.sql','utf8'));
await assert.rejects(()=>asRole("INSERT INTO storage.objects VALUES('product-images','still-blocked','{}')"),/row-level security/);count++;
await (await import('./private-media-edge.mjs')).verifyPrivateMediaEdges({asRole});
await db.close();console.log(`PASS: ${count} private-bucket SQL policy checks`);
