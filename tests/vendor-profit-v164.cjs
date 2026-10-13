const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
// Standalone SQL verification: install @electric-sql/pglite in a temporary prefix and set NODE_PATH.
const {PGlite}=require('@electric-sql/pglite');
const store='bb6f4095-e9d3-4871-b0e5-dedcaa702d37',other='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',segment='10000000-0000-4000-8000-000000000100',order='20000000-0000-4000-8000-000000000100',product='30000000-0000-4000-8000-000000000100',archive='09f7457f-dbaa-4dd3-a717-9c2d470f4091';
const db=new PGlite();
async function run(){
 await db.exec(`create schema private;create role anon;create role authenticated;
 create table public.local_stores(id uuid primary key,commission_rate numeric);
 create table public.orders(id uuid primary key,order_code text,created_at timestamptz default now());
 create table public.order_store_segments(id uuid primary key,order_id uuid,store_id uuid,items_snapshot jsonb,commission_snapshot jsonb,payment_confirmed boolean,store_status text,currency text,vendor_settlement_archive_id uuid);
 create table public.local_products(id uuid primary key,store_id uuid,cost_price numeric);
 create table public.vendor_settlement_archives_v163(id uuid primary key,store_id uuid,statement_no text,segment_ids jsonb);
 create function private.require_vendor_session(t text) returns uuid language plpgsql as $$begin if t='a' then return '${store}'::uuid;elsif t='b' then return '${other}'::uuid;else raise exception 'invalid session';end if;end$$;
 create function private.v94_uuid(t text) returns uuid language sql as $$ select t::uuid $$;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261010_v164_vendor_profit_single_source.sql','utf8'));
 const financial={version:'v161',gross_amount:123000,commission_rate:10,commission_amount:12300,other_deductions:0,net_amount:110700};
 await db.query('insert into local_stores values ($1,10),($2,8)',[store,other]);
 await db.query('insert into orders(id,order_code) values ($1,$2)',[order,'KN-000100']);
 await db.query('insert into local_products values ($1,$2,50)',[product,store]);
 await db.query('insert into order_store_segments values ($1,$2,$3,$4,$5,true,$6,$7,$8)',[segment,order,store,JSON.stringify([{product_id:product,product_name:'Test product',quantity:1,pricing_snapshot:{exchange_rate:1750}}]),JSON.stringify(financial),'تم التسليم','IQD',archive]);
 const archivedLine={...financial,segment_id:segment};
 await db.query('insert into vendor_settlement_archives_v163 values ($1,$2,$3,$4)',[archive,store,'KINTO-STL-TEST',JSON.stringify([archivedLine])]);
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('js/vendor-profit-report-v164.js','utf8'),ctx);const calculate=ctx.window.KintoVendorProfitV164.calculate;
 async function report(token='a'){return (await db.query('select public.vendor_profit_report_v164($1) r',[token])).rows[0].r}
 let r=await report();assert.equal(r.order.statement_no,'KINTO-STL-TEST');assert.equal(r.order.cost_lines[0].cost_local,87500);assert.equal(calculate(r).profit,null);
 assert.equal((await report('b')).order,null);await assert.rejects(()=>report('invalid'));
 await db.query('update local_products set cost_price=null');r=await report();assert.equal(r.order.cost_ready,false);assert.equal(calculate(r).profit,null);
 await assert.rejects(()=>db.query('select vendor_profit_capture_cost_v164($1,$2)',['a',JSON.stringify(r.order.cost_lines)]),/PROFIT_COST_OR_ORDER_FX_MISSING/);
 await db.query('update local_products set cost_price=50');r=await report();const preview=r.order.cost_lines;
 await db.query('update local_products set cost_price=51');
 await assert.rejects(()=>db.query('select vendor_profit_capture_cost_v164($1,$2)',['a',JSON.stringify(preview)]),/PROFIT_COST_PREVIEW_CHANGED/);
 await db.query('update local_products set cost_price=50');r=await report();
 await db.query('select vendor_profit_capture_cost_v164($1,$2)',['a',JSON.stringify(r.order.cost_lines)]);
 r=await report();assert.equal(r.order.cost_frozen,true);assert.equal(calculate(r).profit,23200);
 await db.query('update local_products set cost_price=99');await db.query("update order_store_segments set items_snapshot=jsonb_set(items_snapshot,'{0,pricing_snapshot,exchange_rate}','2000')");
 r=await report();assert.equal(r.order.cost_lines[0].exchange_rate,1750);assert.equal(r.order.total_cost_local,87500);assert.equal(calculate(r).profit,23200);
 await db.query('select vendor_profit_capture_cost_v164($1,$2)',['a','[]']);assert.equal((await db.query('select count(*) n from private.vendor_profit_costs_v164')).rows[0].n,1);
 await db.query('select vendor_profit_add_expense_v164($1,$2,$3,$4)',['a',100,'تغليف','Test']);r=await report();assert.equal(calculate(r).profit,23100);assert.equal(r.order.financial.net_amount,110700);
 await assert.rejects(()=>db.query('select vendor_profit_add_expense_v164($1,$2,$3,$4)',['a',-1,'x','']));
 await assert.rejects(()=>db.query('select vendor_profit_add_expense_v164($1,$2,$3,$4)',['b',100,'x','']));
 assert.deepEqual((await db.query('select segment_ids from vendor_settlement_archives_v163')).rows[0].segment_ids,[archivedLine]);
 for(const value of [null,'',undefined]){const x=JSON.parse(JSON.stringify(r));x.order.total_cost_local=value;assert.equal(calculate(x).profit,null)}
 const incomplete=JSON.parse(JSON.stringify(r));incomplete.order.financial.net_amount=1;assert.throws(()=>calculate(incomplete));
 await db.query('delete from private.vendor_profit_costs_v164');
 await db.query('update local_products set cost_price=50');
 await db.query("update order_store_segments set items_snapshot=jsonb_set(items_snapshot,'{0,quantity}','2')");
 r=await report();assert.equal(r.order.cost_lines[0].cost_local,200000);
 await db.query("update order_store_segments set items_snapshot=jsonb_set(items_snapshot,'{0,pricing_snapshot,exchange_rate}','null')");
 r=await report();assert.equal(r.order.cost_ready,false);assert.equal(calculate(r).profit,null);
 const permissions=await db.query("select has_table_privilege('anon','private.vendor_profit_costs_v164','SELECT') allowed");
 assert.equal(permissions.rows[0].allowed,false);
 console.log('PASS: SQL RPCs; archive parity; missing cost; owner isolation; changed preview; frozen cost/FX; idempotent capture; expense subtraction; untouched archive; incomplete profit.');
 await db.close();
}
run().catch(e=>{console.error(e);process.exitCode=1});
