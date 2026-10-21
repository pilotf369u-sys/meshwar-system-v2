import fs from 'node:fs';
import assert from 'node:assert/strict';
export async function verifyCouponFinance({db,order,id,request,decide,cash,admin,branch}){
 let checks=0;
 await db.exec(`ALTER TABLE orders ADD COLUMN reward_discount_amount numeric DEFAULT 0,ADD COLUMN reward_discount_currency text,ADD COLUMN reward_discount_snapshot jsonb,ADD COLUMN details text;
 CREATE TABLE order_store_segments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),order_id uuid REFERENCES orders(id),store_id uuid,subtotal_local numeric,currency text,commission_snapshot jsonb,vendor_payment_status text DEFAULT 'pending',vendor_settlement_archive_id uuid,updated_at timestamptz);
 CREATE FUNCTION private.v94_jsonb_object(v jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$ BEGIN IF jsonb_typeof(v)='string' THEN RETURN (v#>>'{}')::jsonb; END IF; RETURN coalesce(v,'{}'); END $$;
 CREATE FUNCTION private.v94_uuid(v text) RETURNS uuid LANGUAGE sql IMMUTABLE AS $$ SELECT v::uuid $$;
 CREATE TABLE local_stores(id uuid,commission_rate numeric);`);
 await db.exec(fs.readFileSync('supabase/migrations/20261009_v161_new_orders_vendor_finance.sql','utf8'));
 // Use the deployed RPC definitions, not a synthetic rewrite, with real auth and claims.
 const financeSource=fs.readFileSync('supabase/migrations/20261009_v162_new_order_finance_rpc.sql','utf8');
 const saveDefinition=financeSource.match(/create or replace function public.admin_save_vendor_finance_v161[\s\S]*?end \$\$;/i)[0];await db.exec(saveDefinition);await db.exec('GRANT EXECUTE ON FUNCTION public.admin_save_vendor_finance_v161(text,uuid,numeric,text) TO anon,authenticated');
 const defs=JSON.parse(fs.readFileSync('ci/fixtures/coupon-settlement-definitions-20261018.json'));
 for(const f of defs)await db.exec(f.definition);
 const store=id(600),snap={version:'v161',gross_amount:46000,commission_rate:10,commission_amount:4600,other_deductions:0,net_amount:41400,vendor_payment_status:'pending'};
 async function coupon(n,funder='vendor',opts={}){
  await order(n,{price:46000,fee:5000,currency:'IQD',...opts});
  await db.query('UPDATE orders SET reward_discount_amount=3000,reward_discount_currency=$2,reward_discount_snapshot=$3 WHERE id=$1',[id(n),opts.discountCurrency||'IQD',JSON.stringify({source:'kinto_coupon_v401',store_id:opts.store||store,funded_by:funder,vendor_points:funder==='mixed'?1000:3000,kinto_points:funder==='mixed'?2000:0})]);
  await db.query('INSERT INTO order_store_segments(id,order_id,store_id,subtotal_local,currency,commission_snapshot,vendor_payment_status,vendor_settlement_archive_id) VALUES($1,$2,$3,46000,\'IQD\',$4,$5,$6)',[id(n+1000),id(n),store,JSON.stringify({...snap,vendor_payment_status:opts.paid?'paid':'pending'}),opts.paid?'paid':'pending',opts.archive?id(999):null]);
 }
 await coupon(600);await coupon(601,'kinto');await coupon(602,'mixed');await coupon(603,'vendor',{paid:true});await coupon(604,'vendor',{archive:true});await coupon(605,'vendor',{store:id(601)});await coupon(606,'vendor',{discountCurrency:'USD'});
 const read=async n=>(await db.query('SELECT commission_snapshot FROM order_store_segments WHERE order_id=$1',[id(n)])).rows[0].commission_snapshot;
 const sql=fs.readFileSync('sql/kinto-coupon-finance-v1.sql','utf8');await db.exec(sql);
 for(const [n,basis,commission,net]of [[600,43000,4300,38700],[601,46000,4600,41400],[602,45000,4500,40500]]){const s=await read(n);assert.equal(s.gross_amount,basis);assert.equal(s.commission_amount,commission);assert.equal(s.net_amount,net);assert.equal(s.customer_goods_amount,43000);assert.equal(s.original_goods_amount,46000);checks++}
 for(const n of [603,604,605,606]){assert.equal((await read(n)).gross_amount,46000);checks++}
 await db.exec(sql);assert.equal((await read(600)).net_amount,38700);checks++;
 // A subsequent tracking/details sync must not put the pre-coupon basis back.
 await db.query('UPDATE orders SET details=$2 WHERE id=$1',[id(600),JSON.stringify({vendor_finance_version:'v161',vendor_finance_snapshot:snap})]);assert.equal((await read(600)).net_amount,38700);checks++;
 await db.query("UPDATE order_store_segments SET commission_snapshot=commission_snapshot||'{\"other_deductions\":700,\"vendor_payment_status\":\"paid\"}'::jsonb,vendor_payment_status='paid' WHERE order_id=$1",[id(600)]);
 await db.query('UPDATE orders SET details=details WHERE id=$1',[id(600)]);assert.equal((await read(600)).net_amount,38000);assert.equal((await read(600)).vendor_payment_status,'paid');checks++;
 // Restore this synthetic paid row for the rollback test only.
 await db.query("UPDATE order_store_segments SET commission_snapshot=commission_snapshot||'{\"other_deductions\":0,\"net_amount\":38700,\"vendor_payment_status\":\"pending\"}'::jsonb,vendor_payment_status='pending' WHERE order_id=$1",[id(600)]);
 await db.exec('SET ROLE anon');try{await db.query('SELECT admin_save_vendor_finance_v161($1,$2,700,\'pending\')',[admin,id(1600)])}finally{await db.exec('RESET ROLE')}assert.equal((await read(600)).net_amount,38000);checks++;
 await db.exec('SET ROLE anon');await assert.rejects(()=>db.query('SELECT admin_save_vendor_finance_v161($1,$2,0,\'paid\')',['invalid',id(1600)]),/SESSION|TOKEN/);await db.exec('RESET ROLE');checks++;
 await db.query("UPDATE order_store_segments SET commission_snapshot=commission_snapshot||'{\"other_deductions\":0}'::jsonb WHERE order_id=$1",[id(600)]);
 await coupon(607);assert.equal((await read(607)).net_amount,38700);checks++;
 await db.query('UPDATE orders SET reward_discount_amount=0,reward_discount_snapshot=null WHERE id=$1',[id(607)]);assert.equal((await read(607)).net_amount,41400);checks++;
 await db.query('UPDATE order_store_segments SET commission_snapshot=commission_snapshot||\'{"other_deductions":700}\'::jsonb WHERE order_id=$1',[id(607)]);assert.equal((await read(607)).net_amount,40700);checks++;
 // Read-only frontend and server collection agree, with shipping/payment semantics intact.
 for(const [n,expected]of [[600,48000],[601,48000],[602,48000],[606,51000]]){
  const claim=await request('branch',branch,[id(n)]);const sid=claim.settlements[0].id;
  const row=(await db.query('SELECT gross_amount FROM settlements WHERE id=$1',[sid])).rows[0];assert.equal(Number(row.gross_amount),expected);
  await decide('admin',admin,sid,'approve');checks++;
 }
 await coupon(608);const receipt=await cash('branch',branch,[id(608)]);const r=(await db.query('SELECT * FROM delivery_settlements WHERE id=$1',[receipt.settlements[0].id])).rows[0];assert.equal(Number(r.total_collected_amount),48000);assert.equal(Number(r.net_submitted_amount),43000);checks++;
 for(const [n,payment,expected]of [[609,'paid_prepaid',0],[610,'product_paid_delivery_cod',5000]]){await coupon(n,'vendor',{payment});const c=await request('branch',branch,[id(n)]);assert.equal(Number((await db.query('SELECT gross_amount FROM settlements WHERE id=$1',[c.settlements[0].id])).rows[0].gross_amount),expected);checks++}
 // No coupon still behaves exactly as before; UI never changes original goods.
 await order(611,{price:46000,fee:5000,currency:'IQD'});const c=await request('branch',branch,[id(611)]);assert.equal(Number((await db.query('SELECT gross_amount FROM settlements WHERE id=$1',[c.settlements[0].id])).rows[0].gross_amount),51000);checks++;
 assert.equal(Number((await db.query('SELECT total_price FROM orders WHERE id=$1',[id(600)])).rows[0].total_price),46000);checks++;
 await assert.rejects(()=>db.exec('SET ROLE anon; SELECT private.kinto_coupon_goods_v1(\'{}\');'),/permission denied/);await db.exec('RESET ROLE');checks++;
 // Do not approve a previously overvalued claim under the new rule.
 await coupon(612);const old=await request('branch',branch,[id(612)]);await db.query('UPDATE settlements SET gross_amount=51000,net_amount=51000 WHERE id=$1',[old.settlements[0].id]);await assert.rejects(()=>decide('admin',admin,old.settlements[0].id,'approve'),/AMOUNT_MISMATCH/);checks++;
 // Refuse rollback after later financial edits; transaction leaves patch installed.
 await db.query('UPDATE order_store_segments SET commission_snapshot=commission_snapshot||\'{"other_deductions":50}\'::jsonb WHERE order_id=$1',[id(600)]);
 const rollback=fs.readFileSync('sql/kinto-coupon-finance-rollback-v1.sql','utf8');await assert.rejects(()=>db.exec(rollback),/ROLLBACK_REQUIRES_REVIEW/);await db.exec('ROLLBACK');checks++;
 await db.query("UPDATE order_store_segments s SET commission_snapshot=b.after_value FROM private.kinto_coupon_finance_backup_v1 b WHERE b.kind='segment' AND b.key=s.id::text");
 await db.exec(rollback);assert.equal((await read(600)).gross_amount,46000);checks++;
 console.log(`PASS ${checks} coupon finance checks: funded discounts, original goods, paid/archive isolation, sync, shipping/payment modes, session claims, stale claims, idempotence and rollback`);
}
