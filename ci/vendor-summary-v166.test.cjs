const {PGlite}=require('@electric-sql/pglite');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec(`
 create schema private;
 create role anon;create role authenticated;
 create table orders(id uuid primary key,order_code text,created_at timestamptz);
 create table order_store_segments(id uuid primary key,order_id uuid,store_id uuid,currency text,commission_snapshot jsonb,items_snapshot jsonb,payment_confirmed boolean,store_status text,vendor_payment_status text,vendor_settlement_archive_id uuid);
 create table vendor_settlement_archives_v163(id uuid primary key,store_id uuid,segment_ids jsonb);
 create table private.vendor_profit_costs_v164(segment_id uuid,store_id uuid,total_cost_local numeric);
 create table private.vendor_profit_expenses_v164(segment_id uuid,store_id uuid,amount numeric);
 create function private.require_vendor_session(token text) returns uuid language plpgsql as $$
 begin
 if token='store-a' then return '00000000-0000-0000-0000-000000000001'::uuid;end if;
 if token='store-b' then return '00000000-0000-0000-0000-000000000002'::uuid;end if;
 raise exception 'VENDOR_SESSION_INVALID';
 end $$;
 `);
 const canonical=readFileSync('supabase/migrations/20261010_v165_vendor_profit_pagination.sql','utf8');
 const start=canonical.indexOf('create or replace function private.vendor_profit_rows_v165');
 assert.ok(start>=0);await db.exec(canonical.slice(start,canonical.indexOf('$;',start)+3));
 await db.exec(readFileSync('supabase/migrations/20261010_v166_vendor_dashboard_summary.sql','utf8'));
 const sid='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
 const uuid=i=>'10000000-0000-0000-0000-'+String(i).padStart(12,'0');
 async function row(i,{sales,commission,cost=null,expense=0,paid=false,archived=false,currency='IQD',store=sid,version='v161'}){
  const id=uuid(i),archive=archived?uuid(100+i):null;
  const f={version,gross_amount:sales,commission_amount:commission,other_deductions:0,net_amount:sales-commission};
  await db.query("insert into orders values($1,$2,now())",[id,'KN-'+i]);
  await db.query("insert into order_store_segments values($1,$1,$2,$3,$4,'[{}]',true,'تم التسليم',$5,$6)",[id,store,currency,JSON.stringify(f),paid?'paid':'pending',archive]);
  if(archive)await db.query("insert into vendor_settlement_archives_v163 values($1,$2,$3)",[archive,store,JSON.stringify([{...f,segment_id:id}])]);
  if(cost!==null)await db.query('insert into private.vendor_profit_costs_v164 values($1,$2,$3)',[id,store,cost]);
  if(expense)await db.query('insert into private.vendor_profit_expenses_v164 values($1,$2,$3)',[id,store,expense]);
 }
 await row(100,{sales:123000,commission:12300,cost:87500,expense:1000,archived:true});
 await row(101,{sales:204000,commission:20400,cost:135625,archived:true});
 await row(102,{sales:10000,commission:1000});
 await row(103,{sales:20,commission:2,cost:10,currency:'USD',paid:true});
 await row(104,{sales:999000,commission:99900,cost:10,store:other});
 await row(105,{sales:777000,commission:77700,version:null});
 const report=async token=>(await db.query('select vendor_dashboard_summary_v166($1) result',[token])).rows[0].result;
 const a=await report('store-a'),iqd=a.currencies.find(x=>x.currency==='IQD'),usd=a.currencies.find(x=>x.currency==='USD');
 assert.deepEqual(iqd,{currency:'IQD',orders:3,incomplete_orders:1,invalid_financial_orders:0,sales:337000,commission:33700,paid:294300,pending:9000,profit:70175});
 assert.equal(usd.profit,8);assert.equal(usd.paid,18);
 // Live product prices are absent: only frozen costs and archive/snapshot values are read.
 await db.query('update order_store_segments set vendor_settlement_archive_id=null,vendor_payment_status=\'paid\' where id=$1',[uuid(100)]);
 assert.deepEqual((await report('store-a')).currencies.find(x=>x.currency==='IQD'),iqd);
 await db.query('insert into private.vendor_profit_expenses_v164 values($1,$2,1000)',[uuid(101),sid]);
 assert.equal((await report('store-a')).currencies.find(x=>x.currency==='IQD').profit,69175);
 assert.equal((await report('store-b')).currencies[0].sales,999000);
 await assert.rejects(report('invalid'),/VENDOR_SESSION_INVALID/);
 const grants=(await db.query("select has_function_privilege('anon','vendor_dashboard_summary_v166(text)','execute') allowed")).rows[0];
 assert.equal(grants.allowed,true);
 await db.close();console.log('V166 SQL: archive/live totals, no duplication, costs, expense refresh, currencies and session isolation passed');
})().catch(e=>{console.error(e);process.exit(1)});
