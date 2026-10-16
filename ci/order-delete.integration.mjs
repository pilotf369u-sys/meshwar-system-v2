import fs from 'node:fs';
import assert from 'node:assert/strict';
let db;
if(process.env.KINTO_TEST_DATABASE_URL){
 const url=new URL(process.env.KINTO_TEST_DATABASE_URL);
 assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/kinto_test','ISOLATED_DATABASE_REQUIRED');
 const pg=await import(process.env.KINTO_PG_MODULE||'pg'),Client=pg.Client||pg.default.Client;
 const bootstrap=new Client({connectionString:url.href});await bootstrap.connect();await bootstrap.query('CREATE DATABASE kinto_order_delete_test');await bootstrap.end();
 url.pathname='/kinto_order_delete_test';const client=new Client({connectionString:url.href});await client.connect();
 db={exec:s=>client.query(s),query:(s,a)=>client.query(s,a),close:()=>client.end()};
}else{const {PGlite}=await import(process.env.KINTO_PGLITE_MODULE||'@electric-sql/pglite');db=new PGlite();}
await db.exec(`DO $$BEGIN
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
 IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END$$;CREATE SCHEMA private;
CREATE TABLE orders(id integer PRIMARY KEY,status text,settlement_id bigint,settlement_status text DEFAULT 'unsettled',is_settled boolean DEFAULT false,
 total_price numeric,currency text,delivery_fee numeric,delivery_payment_type text,branch_id text,courier_id text,delivery_agent_id uuid);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY operational_access ON orders FOR ALL TO PUBLIC USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON orders TO anon,authenticated;
GRANT ALL ON orders TO service_role;
INSERT INTO orders(id,status) VALUES(1,'انتظار رد الموظف'),(2,'تم التسديد');
INSERT INTO orders(id,status,settlement_id) VALUES(3,'تم التسليم',99);`);
for(const x of JSON.parse(fs.readFileSync('ci/fixtures/order-delete-guard-20261016.json','utf8')))await db.exec(x.definition);
await db.exec(`REVOKE ALL ON FUNCTION private.kinto_order_settlement_guard_v1() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER settlement_guard BEFORE INSERT OR UPDATE OR DELETE ON orders FOR EACH ROW EXECUTE FUNCTION private.kinto_order_settlement_guard_v1();`);
let checks=0,role='anon';
async function asApi(sql){await db.exec('SET ROLE '+role);try{return await db.query(sql)}finally{await db.exec('RESET ROLE')}}
async function denied(sql,pattern=/permission denied/){await assert.rejects(()=>asApi(sql),pattern);checks++}
// Reproduce only in synthetic DB: even paid (but not settled) orders are deletable.
for(role of ['anon','authenticated']){
 await asApi('DELETE FROM orders WHERE id=2');assert.equal((await db.query('SELECT * FROM orders WHERE id=2')).rows.length,0);checks++;
 await db.exec("INSERT INTO orders(id,status) VALUES(2,'تم التسديد')");
 await denied('DELETE FROM orders WHERE id=3',/SETTLED_ORDER_DELETE_DENIED/);
}
const policiesBefore=(await db.query("SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE tablename='orders' ORDER BY policyname")).rows;
const triggersBefore=(await db.query("SELECT tgname,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid='orders'::regclass AND NOT tgisinternal")).rows;
await db.exec(fs.readFileSync('sql/kinto-order-delete-lockdown-v1.sql','utf8'));
await db.exec(fs.readFileSync('sql/kinto-order-delete-lockdown-v1.sql','utf8'));
for(role of ['anon','authenticated']){
 for(const sql of ['DELETE FROM orders WHERE id=1','DELETE FROM orders WHERE id=2','DELETE FROM orders WHERE id=3','DELETE FROM orders','DELETE FROM orders WHERE false'])await denied(sql);
 assert.equal((await asApi('SELECT * FROM orders')).rows.length,3);checks++;
 // Preserve the existing cancellation/tracking mechanism; this stage adds no new policy.
 await asApi("UPDATE orders SET status='ملغي من قبل العميل' WHERE id=1");checks++;
 await asApi("UPDATE orders SET status='تم الشحن' WHERE id=2");checks++;
 const inserted=role==='anon'?10:11;await asApi(`INSERT INTO orders(id,status) VALUES(${inserted},'انتظار رد الموظف')`);checks++;
 const flags=(await db.query("SELECT has_table_privilege($1,'orders','SELECT') s,has_table_privilege($1,'orders','INSERT') i,has_table_privilege($1,'orders','UPDATE') u,has_table_privilege($1,'orders','DELETE') d",[role])).rows[0];
 assert.deepEqual(flags,{s:true,i:true,u:true,d:false});checks++;
 // Remove only this test's inserted row as owner between iterations.
 await db.query('DELETE FROM orders WHERE id=$1',[inserted]);
}
assert.deepEqual((await db.query("SELECT policyname,cmd,qual,with_check FROM pg_policies WHERE tablename='orders' ORDER BY policyname")).rows,policiesBefore);checks++;
assert.deepEqual((await db.query("SELECT tgname,pg_get_triggerdef(oid) definition FROM pg_trigger WHERE tgrelid='orders'::regclass AND NOT tgisinternal")).rows,triggersBefore);checks++;
assert.equal((await db.query("SELECT has_table_privilege('service_role','orders','DELETE') allowed")).rows[0].allowed,true);checks++;
await db.exec('DELETE FROM orders WHERE id=2');assert.equal((await db.query('SELECT * FROM orders WHERE id=2')).rows.length,0);checks++;
await db.exec(fs.readFileSync('sql/kinto-order-delete-rollback-v1.sql','utf8'));
for(role of ['anon','authenticated']){
 await db.exec("INSERT INTO orders(id,status) VALUES(2,'تم التسديد')");await asApi('DELETE FROM orders WHERE id=2');checks++;
}
await db.exec(fs.readFileSync('sql/kinto-order-delete-lockdown-v1.sql','utf8'));
assert.equal((await db.query('SELECT count(*)::integer n FROM orders')).rows[0].n,2);checks++;
console.log(`PASS ${checks} order deletion checks: synthetic baseline, API denial including no-match DELETE, retained rows/CRUD/policies/triggers, owner maintenance, service grant, idempotence and rollback`);
await db.close();
