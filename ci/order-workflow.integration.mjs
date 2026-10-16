// Real deployed V310 loyalty routines: catches trigger composition missing from isolated ACL-only fixtures.
import fs from 'node:fs';import assert from 'node:assert/strict';
export async function verifyOrderWorkflow({db,id,api}){
 let checks=0;
 await db.exec(`ALTER TABLE orders ADD COLUMN loyalty_points_earned bigint NOT NULL DEFAULT 0,ADD COLUMN loyalty_points_redeemed bigint NOT NULL DEFAULT 0,ADD COLUMN reward_discount_amount numeric NOT NULL DEFAULT 0,ADD COLUMN reward_discount_currency text,ADD COLUMN reward_discount_snapshot jsonb NOT NULL DEFAULT '{}';
 CREATE TABLE kinto_loyalty_settings(id integer PRIMARY KEY,coupon_unit bigint,coupon_days integer);INSERT INTO kinto_loyalty_settings VALUES(1,1000,30);
 CREATE TABLE kinto_store_loyalty_settings(store_id text PRIMARY KEY,enabled boolean DEFAULT true,earn_rate numeric DEFAULT .01);
 CREATE TABLE kinto_loyalty_wallets(customer_id text,store_id text,currency text,progress_points bigint DEFAULT 0,fractional_carry numeric DEFAULT 0,updated_at timestamptz,PRIMARY KEY(customer_id,store_id,currency));
 CREATE TABLE kinto_loyalty_coupons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id text,store_id text,currency text,points bigint,source_order_id text,expires_at timestamptz,funded_by text,status text DEFAULT 'active',used_order_id text,used_at timestamptz,campaign_id uuid);
 CREATE TABLE kinto_loyalty_ledger(id bigserial PRIMARY KEY,customer_id text,store_id text,order_id text,event_type text,points numeric,currency text,earn_rate_snapshot numeric,eligible_product_total numeric,note text,funded_by text,funding_snapshot jsonb);`);
 for(const f of JSON.parse(fs.readFileSync('ci/fixtures/workflow-loyalty-definitions-20261017.json','utf8')))await db.exec(f.definition);
 await db.exec(`CREATE TRIGGER trg_kinto_loyalty_order_v310 BEFORE UPDATE OF status ON orders FOR EACH ROW EXECUTE FUNCTION kinto_loyalty_order_v310();
 DROP TRIGGER IF EXISTS trg_00_kinto_order_session_write_guard_v1 ON orders;
 DROP TRIGGER IF EXISTS trg_kinto_order_session_write_guard_v1 ON orders;
 CREATE TRIGGER trg_kinto_order_session_write_guard_v1 BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION private.kinto_order_session_write_guard_v1();
 INSERT INTO orders(id,customer_id,branch_id,courier_id,delivery_agent_id,status,total_price,currency,details) VALUES('${id(801)}','${id(601)}','${id(30)}','1','${id(200)}','مندوب',200000,'IQD','{"source":"local_store","store_id":"${id(1)}"}'),('${id(802)}','${id(601)}',null,null,null,'بانتظار موافقة العميل',20000,'IQD','{"source":"local_store","store_id":"${id(1)}"}');`);
 const courier=(await api('courier_login_v149',['courier-phone','courier-pass']))[0].session_token;
 async function direct(role,token,sql,apiRole='anon'){await db.query("SELECT set_config('request.headers',$1,false)",[JSON.stringify({'x-kinto-role':role,'x-kinto-session':token})]);await db.exec('SET ROLE '+apiRole);try{return await db.query(sql)}finally{await db.exec('RESET ROLE')}}
 await assert.rejects(()=>direct('courier',courier,`UPDATE orders SET status='تم التسليم' WHERE id='${id(801)}'`),/COURIER_ORDER_WRITE_DENIED/);checks++;
 assert.equal(Number((await db.query('SELECT count(*) n FROM kinto_loyalty_ledger')).rows[0].n),0);checks++;
 for(let i=0;i<2;i++)await db.exec(fs.readFileSync('sql/kinto-order-workflow-trigger-order-v1.sql','utf8'));
 const order=(await db.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='orders'::regclass AND NOT tgisinternal ORDER BY tgname`)).rows.map(x=>x.tgname);
 assert(order.indexOf('trg_00_kinto_order_session_write_guard_v1')<order.indexOf('trg_kinto_loyalty_order_v310'));checks++;
 for(const apiRole of ['anon','authenticated']){
  await assert.rejects(()=>direct('courier',courier,`UPDATE orders SET loyalty_points_earned=999999 WHERE id='${id(801)}'`,apiRole),/COURIER_ORDER_WRITE_DENIED/);checks++;
  await assert.rejects(()=>direct('customer','customer-one',`UPDATE orders SET reward_discount_amount=999999 WHERE id='${id(802)}'`,apiRole),/CUSTOMER_ORDER_WRITE_DENIED/);checks++;
 }
 await direct('courier',courier,`UPDATE orders SET status='تم التسليم' WHERE id='${id(801)}'`);
 assert.equal(Number((await db.query('SELECT loyalty_points_earned FROM orders WHERE id=$1',[id(801)])).rows[0].loyalty_points_earned),2000);checks++;
 assert.equal(Number((await db.query("SELECT count(*) n FROM kinto_loyalty_coupons WHERE source_order_id=$1",[id(801)])).rows[0].n),2);checks++;
 await direct('courier',courier,`UPDATE orders SET status='تم التسليم' WHERE id='${id(801)}'`);
 assert.equal(Number((await db.query("SELECT count(*) n FROM kinto_loyalty_ledger WHERE order_id=$1 AND event_type='earn'",[id(801)])).rows[0].n),1);checks++;
 await db.query(`UPDATE orders SET loyalty_points_redeemed=1000,reward_discount_amount=1000,reward_discount_currency='IQD',reward_discount_snapshot='{"funded_by":"vendor","vendor_points":1000}' WHERE id=$1`,[id(802)]);
 await db.query(`INSERT INTO kinto_loyalty_coupons(customer_id,store_id,currency,points,status,used_order_id,expires_at,funded_by) VALUES($1,$2,'IQD',1000,'used',$3,now()+interval '1 day','vendor')`,[id(601),id(1),id(802)]);
 await direct('customer','customer-one',`UPDATE orders SET status='ملغي من قبل العميل',rejection_reason='ملغي من قبل العميل' WHERE id='${id(802)}'`);
 const cancelled=(await db.query('SELECT reward_discount_amount,loyalty_points_redeemed FROM orders WHERE id=$1',[id(802)])).rows[0];assert.equal(Number(cancelled.reward_discount_amount),0);assert.equal(Number(cancelled.loyalty_points_redeemed),0);checks++;
 assert.equal(Number((await db.query("SELECT count(*) n FROM kinto_loyalty_ledger WHERE order_id=$1 AND event_type='restore'",[id(802)])).rows[0].n),1);checks++;
 assert.equal(Number((await db.query("SELECT count(*) n FROM kinto_loyalty_coupons WHERE customer_id=$1 AND status='active'",[id(601)])).rows[0].n),3);checks++;
 await db.query("SELECT set_config('request.headers','{}',false)");
 console.log(`PASS ${checks} workflow trigger checks: reproduce courier failure, real V310 earning/coupon issuance/restoration, guard precedence, replay safety and forged financial fields denied`);
}
