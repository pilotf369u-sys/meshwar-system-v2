import fs from 'node:fs';import assert from 'node:assert/strict';
export async function verifyControlSurface({db,id,admin,employee,branch,vendor,otherVendor,api}){
 let count=0;
 await db.exec(`ALTER TABLE store_categories ADD COLUMN name text,ADD COLUMN slug text,ADD COLUMN sort_order integer DEFAULT 0,ADD COLUMN is_visible boolean DEFAULT true,ADD COLUMN created_at timestamptz DEFAULT now(),ADD COLUMN updated_at timestamptz DEFAULT now();ALTER TABLE store_categories ALTER COLUMN id SET DEFAULT gen_random_uuid();
 UPDATE store_categories SET name='Existing',slug='existing';
 CREATE TABLE currencies(id bigserial PRIMARY KEY,code text,name text,rate numeric,updated_at timestamptz DEFAULT now());
 CREATE TABLE store_category_media(id uuid PRIMARY KEY,store_id uuid);
 CREATE TABLE agents(id bigint PRIMARY KEY,phone text);
 CREATE TABLE local_orders(id uuid PRIMARY KEY,store_id uuid,customer_name text);
 CREATE TABLE local_returns(id uuid PRIMARY KEY,store_id uuid,penalty_amount numeric,return_status text);
 CREATE TABLE financial_settlements(id bigserial PRIMARY KEY,store_id text,period_end timestamptz,closed_at timestamptz,status text);
 CREATE VIEW local_store_financial_summary WITH(security_invoker=true) AS SELECT store_id,count(*) FROM local_orders GROUP BY store_id;
 CREATE TABLE messages(id uuid PRIMARY KEY,customer_id text,file_url text);
 CREATE SCHEMA storage;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean);
 CREATE TABLE storage.objects(id uuid PRIMARY KEY,bucket_id text,name text,metadata jsonb);
 CREATE FUNCTION private.review_storage_upload_allowed_v150(b text,n text,m jsonb) RETURNS boolean LANGUAGE sql AS $$SELECT coalesce(m->>'ticket'='valid-review',false)$$;
 CREATE FUNCTION private.review_storage_delete_allowed_v150(b text,n text) RETURNS boolean LANGUAGE sql AS $$SELECT n LIKE 'delete-ticket/%'$$;
 GRANT USAGE ON SCHEMA storage TO anon,authenticated;GRANT ALL ON storage.objects TO anon,authenticated;
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;CREATE POLICY old_storage_open ON storage.objects TO public USING(true) WITH CHECK(true);
 INSERT INTO storage.buckets VALUES('chat-attachments',true),('category-images',true),('product-review-images',true),('cms-media',true);
 GRANT ALL ON local_orders,local_returns,financial_settlements,agents,store_categories,store_category_media,currencies TO anon,authenticated;
 GRANT SELECT ON local_store_financial_summary TO anon,authenticated;
 ALTER TABLE local_orders ENABLE ROW LEVEL SECURITY;CREATE POLICY old_local_orders ON local_orders TO public USING(true) WITH CHECK(true);
 ALTER TABLE local_returns ENABLE ROW LEVEL SECURITY;CREATE POLICY old_local_returns ON local_returns TO public USING(true) WITH CHECK(true);
 ALTER TABLE financial_settlements ENABLE ROW LEVEL SECURITY;CREATE POLICY old_finance ON financial_settlements TO public USING(true) WITH CHECK(true);
 INSERT INTO local_orders VALUES('${id(960)}','${id(1)}','Private A'),('${id(961)}','${id(2)}','Private B');`);
 for(let i=0;i<2;i++){await db.exec(fs.readFileSync('sql/kinto-control-surface-session-v1.sql','utf8'));await db.exec(fs.readFileSync('sql/kinto-control-surface-lockdown-v1.sql','utf8'))}
 async function deny(fn){await assert.rejects(fn,/DENIED|INVALID|REQUIRED|SESSION|permission denied|row-level security|duplicate key/);count++}
 async function direct(sql,role='anon'){await db.exec('SET ROLE '+role);try{return await db.query(sql)}finally{await db.exec('RESET ROLE')}}
 async function headers(role,token){await db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify(token?{'x-kinto-role':role,'x-kinto-session':token}:{})])}
 const cat=(token,action,pid,patch)=>api('kinto_category_write_session_v1',[token,action,pid,JSON.stringify(patch)]).then(x=>x[0]);
 for(const role of ['anon','authenticated']){
  for(const table of ['currencies','store_categories','store_category_media','local_orders','local_returns'])await deny(()=>direct('DELETE FROM '+table,role));
  await deny(()=>direct('SELECT * FROM agents',role));
  await headers('',null);assert.equal((await direct('SELECT * FROM local_orders',role)).rows.length,0);count++;
  await headers('vendor',vendor);const rows=(await direct('SELECT * FROM local_orders',role)).rows;assert(rows.length===1&&rows[0].store_id===id(1));count++;
  await headers('admin',admin);assert.equal((await direct('SELECT * FROM local_store_financial_summary',role)).rows.length,2);count++;
 }
 await headers('',null);
 await deny(()=>cat('bad','insert',null,{name:'Bad',slug:'bad'}));
 const own=(await cat(vendor,'insert',null,{name:'Own',slug:'own'}))[0];assert.equal(own.store_id,id(1));count++;
 assert.deepEqual(await cat(otherVendor,'update',own.id,{name:'Foreign'}),[]);count++;
 await deny(()=>cat(vendor,'update',own.id,{parent_id:id(71)}));
 await cat(vendor,'update',own.id,{name:'Updated'});assert.equal((await db.query('SELECT name FROM store_categories WHERE id=$1',[own.id])).rows[0].name,'Updated');count++;
 await cat(vendor,'delete',own.id,{});assert.equal((await db.query('SELECT id FROM store_categories WHERE id=$1',[own.id])).rows.length,0);count++;
 await deny(()=>api('kinto_currency_write_session_v1',[vendor,'insert',null,JSON.stringify({name:'USD',rate:2})]));
 const currency=(await api('kinto_currency_write_session_v1',[admin,'insert',null,JSON.stringify({name:'USD',rate:1500})]))[0][0];assert.equal(currency.name,'USD');count++;
 await api('kinto_currency_write_session_v1',[admin,'delete',currency.id,'{}']);count++;
 const courier=(await api('courier_login_v149',['courier-phone','courier-pass']))[0].session_token;
 const ticket=(role,token,purpose,target,mime='image/png',size=100)=>api('kinto_attachment_ticket_session_v1',[role,token,purpose,target,mime,size]).then(x=>x[0]);
 await deny(()=>ticket('customer','bad','chat',id(601)));await deny(()=>ticket('customer','customer-one','chat',id(602)));await deny(()=>ticket('customer','customer-one','proof',id(703)));
 const file=await ticket('customer','customer-one','chat',id(601));assert.equal(file.bucket,'chat-attachments');count++;
 await direct(`INSERT INTO storage.objects VALUES('${id(970)}','chat-attachments','${file.path}','{"mimetype":"image/png","size":100}')`);count++;
 await deny(()=>direct(`INSERT INTO storage.objects VALUES('${id(971)}','chat-attachments','forged/path','{"mimetype":"image/png","size":100}')`));
 await deny(()=>direct(`INSERT INTO storage.objects VALUES('${id(971)}','chat-attachments','${file.path}','{"mimetype":"image/png","size":99}')`));
 assert.equal((await direct('SELECT * FROM storage.objects')).rows.length,0);count++;
 for(const bucket of ['category-images','cms-media','product-review-images'])await deny(()=>direct(`INSERT INTO storage.objects VALUES('${id(972)}','${bucket}','forged','{"mimetype":"image/png","size":100}')`));
 await direct(`INSERT INTO storage.objects VALUES('${id(973)}','product-review-images','valid','{"ticket":"valid-review"}')`);count++;
 await db.query(`INSERT INTO messages VALUES($1,$2,$3)`,[id(980),id(601),'https://hsmmbloouskqdnptiiad.supabase.co/storage/v1/object/public/chat-attachments/'+file.path]);
 assert.deepEqual((await api('kinto_attachment_read_session_v1',['customer','customer-one',JSON.stringify([file.path])]))[0],[file.path]);count++;
 assert.deepEqual((await api('kinto_attachment_read_session_v1',['customer','customer-two',JSON.stringify([file.path])]))[0],[]);count++;
 await db.query('UPDATE employees SET permissions=$1 WHERE id=$2',[JSON.stringify({orders:false,customers:true}),id(2)]);
 await deny(()=>ticket('employee',employee,'parcel',id(703)));
 await db.query("UPDATE employees SET permissions='{}' WHERE id=$1",[id(2)]);
 const proof=await ticket('courier',courier,'proof',id(703));assert(proof.path);count++;
 await deny(()=>ticket('courier',courier,'proof',id(702)));
 const expiring=await ticket('customer','customer-one','chat',id(601));await db.query("UPDATE customer_review_sessions SET revoked_at=now() WHERE customer_id=$1",[id(601)]);
 await deny(()=>direct(`INSERT INTO storage.objects VALUES('${id(974)}','chat-attachments','${expiring.path}','{"mimetype":"image/png","size":100}')`));
 await db.query('UPDATE customer_review_sessions SET revoked_at=null WHERE customer_id=$1',[id(601)]);
 await db.exec(fs.readFileSync('sql/kinto-control-surface-rollback-v1.sql','utf8'));
 assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='chat-attachments'")).rows[0].public,true);count++;
 for(let i=0;i<2;i++){await db.exec(fs.readFileSync('sql/kinto-launch-controls-session-v1.sql','utf8'));await db.exec(fs.readFileSync('sql/kinto-launch-controls-lockdown-v1.sql','utf8'))}
 assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='chat-attachments'")).rows[0].public,false);count++;
 await deny(()=>direct('SELECT password_hash FROM local_stores'));
 await db.exec(fs.readFileSync('sql/kinto-launch-controls-rollback-v1.sql','utf8'));
 assert.equal((await db.query("SELECT public FROM storage.buckets WHERE id='chat-attachments'")).rows[0].public,true);count++;
 console.log(`PASS ${count} control-surface checks: role/row isolation, category ownership, currencies, private attachments, upload tickets, revoked sessions, review-policy intersection and rollback`);
}
