import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
let db;const native=Boolean(process.env.KINTO_TEST_DATABASE_URL);
if(native){const url=new URL(process.env.KINTO_TEST_DATABASE_URL);assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname==='/kinto_test','ISOLATED_LOCAL_TEST_DATABASE_REQUIRED');const pg=await import(process.env.KINTO_PG_MODULE||'pg'),Client=pg.Client||pg.default.Client;const bootstrap=new Client({connectionString:url.href});await bootstrap.connect();await bootstrap.query('CREATE DATABASE kinto_legacy_reward_test');await bootstrap.end();url.pathname='/kinto_legacy_reward_test';const c=new Client({connectionString:url.href});await c.connect();db={exec:s=>c.query(s),query:(s,a)=>c.query(s,a),close:()=>c.end()};await db.exec('CREATE EXTENSION pgcrypto');}
else{const modulePath=process.env.KINTO_PGLITE_MODULE;const {PGlite}=await import(modulePath||'@electric-sql/pglite');const {pgcrypto}=await import(modulePath?new URL('./contrib/pgcrypto.js',modulePath.startsWith('file:')?modulePath:pathToFileURL(modulePath)).href:'@electric-sql/pglite/contrib/pgcrypto');db=new PGlite({extensions:{pgcrypto}});await db.exec('CREATE EXTENSION pgcrypto');}

await db.exec(`DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated;END IF;END $$;
CREATE SCHEMA private;
CREATE TABLE employees(id uuid PRIMARY KEY,role text);
CREATE TABLE customers(id uuid PRIMARY KEY,reward_balances jsonb,rewards_log jsonb);
CREATE TABLE orders(id uuid PRIMARY KEY,customer_id text,status text,currency text,delivery_currency text,total_price numeric,delivery_fee numeric,reward_discount_amount numeric,reward_discount_currency text,reward_discount_snapshot jsonb);`);
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
for(const entry of JSON.parse(fs.readFileSync('ci/fixtures/legacy-reward-definitions-20261016.json','utf8')))await db.exec(entry.definition);
await db.exec(`REVOKE ALL ON FUNCTION apply_order_reward_discount(uuid,numeric,text,text) FROM PUBLIC;GRANT EXECUTE ON FUNCTION apply_order_reward_discount(uuid,numeric,text,text) TO anon,authenticated;
INSERT INTO employees VALUES('${id(2)}','employee');INSERT INTO customers VALUES('${id(1)}','{"USD":100}','[]');
INSERT INTO orders(id,customer_id,status,currency,delivery_currency,total_price,delivery_fee) VALUES('${id(10)}','${id(1)}','بانتظار التسعير','USD','USD',100,5);`);
let apiRole='anon',checks=0;
const args=actor=>[id(10),10,'USD',actor];
async function call(actor){await db.exec('SET ROLE '+apiRole);try{return (await db.query('SELECT public.apply_order_reward_discount($1,$2,$3,$4) result',args(actor))).rows[0].result}finally{await db.exec('RESET ROLE')}}
async function reset(){await db.exec(`UPDATE customers SET reward_balances='{"USD":100}',rewards_log='[]';UPDATE orders SET reward_discount_amount=null,reward_discount_currency=null,reward_discount_snapshot=null;`)}
const definition=(await db.query("SELECT pg_get_functiondef('public.apply_order_reward_discount(uuid,numeric,text,text)'::regprocedure) definition")).rows[0].definition;
// Synthetic-only reproduction: no customer/order direct grants, no session at all.
for(apiRole of ['anon','authenticated'])for(const actor of [id(2),null]){await reset();const old=await call(actor);assert.equal(Number(old.remaining_balance),90);assert.equal((await db.query('SELECT reward_balances FROM customers')).rows[0].reward_balances.USD,90);checks++}
await reset();
await db.exec(fs.readFileSync('sql/kinto-legacy-reward-discount-lockdown-v1.sql','utf8'));
await db.exec(fs.readFileSync('sql/kinto-legacy-reward-discount-lockdown-v1.sql','utf8'));
for(apiRole of ['anon','authenticated']){
 for(const actor of [id(2),null,'',id(999)]){await assert.rejects(()=>call(actor),/permission denied/);checks++}
 const acl=(await db.query("SELECT has_function_privilege($1,'public.apply_order_reward_discount(uuid,numeric,text,text)','EXECUTE') allowed",[apiRole])).rows[0];assert.equal(acl.allowed,false);checks++;
}
const balance=(await db.query('SELECT reward_balances,rewards_log FROM customers')).rows[0];assert.equal(balance.reward_balances.USD,100);assert.deepEqual(balance.rewards_log,[]);checks++;
assert.equal((await db.query('SELECT reward_discount_amount FROM orders')).rows[0].reward_discount_amount,null);checks++;
assert.equal((await db.query("SELECT pg_get_functiondef('public.apply_order_reward_discount(uuid,numeric,text,text)'::regprocedure) definition")).rows[0].definition,definition);checks++;
// Owner SQL still works; the legacy implementation is retained, not rewritten or dropped.
assert.equal(Number((await db.query('SELECT public.apply_order_reward_discount($1,$2,$3,$4) result',args(id(2)))).rows[0].result.remaining_balance),90);checks++;
await reset();await db.exec(fs.readFileSync('sql/kinto-legacy-reward-discount-rollback-v1.sql','utf8'));
for(apiRole of ['anon','authenticated']){await reset();assert.equal(Number((await call(id(2))).remaining_balance),90);checks++}
console.log(`PASS ${checks} legacy reward retirement checks: synthetic baseline bypass, API denial, unchanged balances/body, owner compatibility, idempotence and rollback`);await db.close();
