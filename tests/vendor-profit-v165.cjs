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
 await db.exec("alter table orders add column details text default '{}', add column total_price numeric default 123000, add column currency text default 'IQD'; alter table order_store_segments add column vendor_payment_status text, add column updated_at timestamptz; create function private.v94_jsonb_object(v jsonb) returns jsonb language sql as $body$ select case when jsonb_typeof(v)='string' then (v#>>'{}')::jsonb else v end $body$;");
 await db.exec(fs.readFileSync('supabase/migrations/20261009_v161_new_orders_vendor_finance.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261010_v165_vendor_profit_pagination.sql','utf8'));

 await db.query('insert into local_stores values ($1,10),($2,8)',[store,other]);
 await db.query('insert into local_products values ($1,$2,50)',[product,store]);
 const f={version:'v161',gross_amount:123000,commission_rate:10,commission_amount:12300,other_deductions:0,net_amount:110700};
 await db.exec("select set_config('app.v161_finance_checkout','on',false);");
 const input={checkout_contract:'independent_vendor_orders',vendor_finance_version:'v161',store_id:store,items:[{product_id:product,product_name:'Unit cost test',quantity:5,pricing_snapshot:{exchange_rate:1750}}]};
 await db.query('insert into orders(id,order_code,details) values($1,$2,$3)',[order,'KN-000100',JSON.stringify(input)]);
 let items=JSON.parse((await db.query('select details from orders where id=$1',[order])).rows[0].details).items;
 assert.equal((await db.query('select units from private.vendor_profit_units_v165 where order_id=$1',[order])).rows[0].units[0].unit_cost_usd,50);
 await db.query('update local_products set cost_price=99');
 items[0].quantity=1;items[0].pricing_snapshot.exchange_rate=9999;
 items.push({product_id:'ffffffff-ffff-4fff-8fff-ffffffffffff',product_name:'Unavailable item',quantity:0,pricing_snapshot:{exchange_rate:1750}});
 await db.query('insert into order_store_segments(id,order_id,store_id,items_snapshot,commission_snapshot,payment_confirmed,store_status,currency,vendor_settlement_archive_id) values($1,$2,$3,$4,$5,true,$6,$7,null)',[segment,order,store,JSON.stringify(items),JSON.stringify(f),'تم التسليم','IQD']);
 let detail=(await db.query('select vendor_profit_detail_v165($1,$2) r',['a',segment])).rows[0].r;
 assert.equal(detail.order.total_cost_local,87500);
 const ctx={window:{}};vm.runInNewContext(fs.readFileSync('js/vendor-profit-report-v165.js','utf8'),ctx);const calc=ctx.window.KintoVendorProfitV164.calculate;
 assert.equal(calc(detail).profit,23200);
 assert.equal((await db.query('select vendor_profit_detail_v165($1,$2) r',['b',segment])).rows[0].r.order,null);
 await assert.rejects(()=>db.query('select vendor_profit_add_expense_v165($1,$2,$3,$4,$5)',['b',segment,100,'x','']));
 await db.query('select vendor_profit_add_expense_v165($1,$2,$3,$4,$5)',['a',segment,100,'تغليف','']);
 detail=(await db.query('select vendor_profit_detail_v165($1,$2) r',['a',segment])).rows[0].r;
 assert.equal(calc(detail).profit,23100);assert.equal(detail.order.financial.net_amount,110700);
 await db.query('insert into vendor_settlement_archives_v163 values($1,$2,$3,$4)',[archive,store,'KINTO-STL-TEST',JSON.stringify([{...f,segment_id:segment}])]);
 await db.query('update order_store_segments set vendor_settlement_archive_id=$1 where id=$2',[archive,segment]);
 await db.query("update order_store_segments set commission_snapshot=jsonb_set(commission_snapshot,'{net_amount}','1') where id=$1",[segment]);
 detail=(await db.query('select vendor_profit_detail_v165($1,$2) r',['a',segment])).rows[0].r;
 assert.equal(calc(detail).profit,23100);
 // Twelve orders lacking a historical cost snapshot stay incomplete, never zero-cost profit.
 for(let n=1;n<=12;n++){
  const oid='20000000-0000-4000-8000-'+String(n).padStart(12,'0'),seg='10000000-0000-4000-8000-'+String(n).padStart(12,'0');
  await db.query('insert into orders(id,order_code) values($1,$2)',[oid,'KN-TEST-'+n]);
  await db.query('insert into order_store_segments(id,order_id,store_id,items_snapshot,commission_snapshot,payment_confirmed,store_status,currency,vendor_settlement_archive_id) values($1,$2,$3,$4,$5,true,$6,$7,null)',[seg,oid,store,JSON.stringify([{product_id:product,quantity:1,pricing_snapshot:{exchange_rate:1750}}]),JSON.stringify(f),'تم التسليم','IQD']);
 }
 let list=(await db.query('select vendor_profit_list_v165($1,$2,$3) r',['a',1,''])).rows[0].r;
 assert.equal(list.total,13);assert.equal(list.rows.length,5);assert.equal(list.pages,3);
 assert.equal(list.summary[0].incomplete_orders,12);assert.equal(list.summary[0].profit,23100);
 const ids=list.rows.map(x=>x.segment_id);
 list=(await db.query('select vendor_profit_list_v165($1,$2,$3) r',['a',2,''])).rows[0].r;
 assert.equal(list.rows.length,5);assert.ok(list.rows.every(x=>!ids.includes(x.segment_id)));
 list=(await db.query('select vendor_profit_list_v165($1,$2,$3) r',['a',99,''])).rows[0].r;
 assert.equal(list.page,3);assert.equal(list.rows.length,3);
 list=(await db.query('select vendor_profit_list_v165($1,$2,$3) r',['a',1,'KN-000100'])).rows[0].r;
 assert.equal(list.total,1);assert.equal(list.summary[0].profit,23100);
 assert.equal((await db.query("select vendor_profit_list_v165('b') r")).rows[0].r.total,0);
 await assert.rejects(()=>db.query("select vendor_profit_list_v165('invalid')"));
 await assert.rejects(()=>db.query("select vendor_profit_list_v165('a',1,'','2026-10-11','2026-10-01')"),/PROFIT_DATE_RANGE_INVALID/);
 // Existing manual confirmation is still owner scoped and preview checked.
 const oldseg='10000000-0000-4000-8000-000000000001';
 let old=(await db.query('select vendor_profit_detail_v165($1,$2) r',['a',oldseg])).rows[0].r;
 await assert.rejects(()=>db.query('select vendor_profit_capture_cost_v165($1,$2,$3)',['a',oldseg,'[]']),/PROFIT_COST_PREVIEW_CHANGED/);
 await db.query('select vendor_profit_capture_cost_v165($1,$2,$3)',['a',oldseg,JSON.stringify(old.order.cost_lines)]);
 old=(await db.query('select vendor_profit_detail_v165($1,$2) r',['a',oldseg])).rows[0].r;
 assert.equal(old.order.total_cost_local,173250);
 // Missing unit cost at creation must not freeze automatically when product is filled later.
 await db.query('update local_products set cost_price=null');
 const missingOrder='20000000-0000-4000-8000-000000000999',missingSeg='10000000-0000-4000-8000-000000000999';
 await db.query('insert into orders(id,order_code,details) values($1,$2,$3)',[missingOrder,'KN-MISSING',JSON.stringify(input)]);
 items=JSON.parse((await db.query('select details from orders where id=$1',[missingOrder])).rows[0].details).items;
 assert.equal((await db.query('select units from private.vendor_profit_units_v165 where order_id=$1',[missingOrder])).rows[0].units[0].unit_cost_usd,null);
 await db.query('update local_products set cost_price=50');
 await db.query('insert into order_store_segments(id,order_id,store_id,items_snapshot,commission_snapshot,payment_confirmed,store_status,currency,vendor_settlement_archive_id) values($1,$2,$3,$4,$5,true,$6,$7,null)',[missingSeg,missingOrder,store,JSON.stringify(items),JSON.stringify(f),'تم التسليم','IQD']);
 detail=(await db.query('select vendor_profit_detail_v165($1,$2) r',['a',missingSeg])).rows[0].r;
 assert.equal(detail.order.cost_frozen,false);assert.equal(calc(detail).profit,null);

 await db.exec("update orders set created_at='2026-10-10T00:00:00Z';");
 let dated=(await db.query("select vendor_profit_list_v165('a',1,'','2026-10-11','2026-10-11') r")).rows[0].r;
 assert.equal(dated.total,0);
 dated=(await db.query("select vendor_profit_list_v165('a',1,'','2026-10-10','2026-10-10') r")).rows[0].r;
 assert.equal(dated.total,14);
 await db.query("update order_store_segments set currency='TRY' where id=$1",[missingSeg]);
 const grouped=(await db.query("select vendor_profit_list_v165('a') r")).rows[0].r.summary;
 assert.equal(grouped.length,2);assert.equal(grouped.find(x=>x.currency==='TRY').profit,null);
 console.log('PASS V165: five-row server pages, search, currency totals, owner isolation, immutable checkout unit cost, final quantity, archive parity, missing costs and expenses.');
 await db.close();
}
run().catch(e=>{console.error(e);process.exitCode=1});
