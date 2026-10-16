import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
export async function verifyStoreControl({db,id,admin,employee,branch,vendor,otherVendor,api}){
 let count=0;
 await db.exec(`ALTER TABLE local_stores ALTER COLUMN id SET DEFAULT gen_random_uuid();ALTER TABLE local_stores ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),ADD COLUMN IF NOT EXISTS store_url text,ADD COLUMN IF NOT EXISTS profit_margin_percent numeric;
 CREATE TABLE global_stores(id bigserial PRIMARY KEY,name text UNIQUE,logo_url text,category text,store_url text,sort_order integer,is_active boolean DEFAULT true,updated_at timestamptz);`);
 for(const f of JSON.parse(fs.readFileSync('ci/fixtures/store-control-definitions-20261017.json','utf8')))await db.exec(f.definition);
 await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON local_stores TO anon,authenticated;ALTER TABLE local_stores ENABLE ROW LEVEL SECURITY;CREATE POLICY old_store_open ON local_stores TO public USING(true) WITH CHECK(true);');
 for(let i=0;i<2;i++){await db.exec(fs.readFileSync('sql/kinto-store-control-session-v1.sql','utf8'));await db.exec(fs.readFileSync('sql/kinto-store-control-lockdown-v1.sql','utf8'))}
 const operation=(role,token,op,args)=>api('kinto_store_operation_session_v1',[role,token,op,JSON.stringify(args)]).then(x=>x[0]);
 async function deny(fn){await assert.rejects(fn,/DENIED|INVALID|REQUIRED|DISABLED|SESSION|permission denied|SHORT|SIGNATURE_DRIFT/);count++}
 async function direct(sql,role='anon'){await db.exec('SET ROLE '+role);try{return await db.query(sql)}finally{await db.exec('RESET ROLE')}}
 for(const role of ['anon','authenticated']){
  for(const sql of ['SELECT password_hash FROM local_stores','SELECT * FROM local_stores',`UPDATE local_stores SET password_hash='FORGED' WHERE id='${id(1)}'`,`DELETE FROM local_stores WHERE id='${id(1)}'`,`INSERT INTO local_stores(id,store_name) VALUES('${id(901)}','FORGED')`])await deny(()=>direct(sql,role));
  const rows=(await direct('SELECT * FROM kinto_local_stores_public_v1',role)).rows;assert(rows.length>=2&&rows.every(x=>!Object.hasOwn(x,'password_hash')));count++;
 }
 await deny(()=>api('vendor_set_exchange_rate',[id(1),999,'USD','IQD']));await deny(()=>api('vendor_set_profit_margin',[id(1),999]));
 await deny(()=>operation('vendor','bad','vendor_set_exchange_rate',{p_store_id:id(1),p_rate:2,p_base_currency:'USD',p_target_currency:'IQD'}));
 await deny(()=>operation('admin',vendor,'admin_save_local_store',{}));await deny(()=>operation('admin',employee,'delete_global_store',{p_store_id:1}));
 await deny(()=>operation('vendor',otherVendor,'vendor_set_profit_margin',{p_store_id:id(1),p_margin:900}));
 await deny(()=>operation('vendor',vendor,'vendor_set_profit_margin',{p_store_id:id(1),p_margin:10,unexpected:'SQL'}));
 await deny(()=>operation('vendor',vendor,'vendor_set_profit_margin;DELETE FROM orders',{}));
 await operation('vendor',vendor,'vendor_set_exchange_rate',{p_store_id:id(1),p_rate:1500,p_base_currency:'USD',p_target_currency:'IQD'});assert.equal(Number((await db.query('SELECT exchange_rate FROM local_stores WHERE id=$1',[id(1)])).rows[0].exchange_rate),1500);count++;
 await operation('vendor',vendor,'vendor_set_profit_margin',{p_store_id:id(1),p_margin:27.5});assert.equal(Number(await operation('vendor',vendor,'vendor_get_profit_margin',{p_store_id:id(1)})),27.5);count++;
 await deny(()=>operation('vendor',vendor,'vendor_set_exchange_rate',{p_rate:'NaN',p_base_currency:'USD',p_target_currency:'IQD'}));
 const gid=await operation('admin',admin,'save_global_store',{p_admin_id:id(2),p_name:'Test Global',p_logo_url:'https://example.test/logo.png',p_category:'fashion',p_store_url:'https://example.test',p_sort_order:1});assert(Number(gid)>0);count++;
 await operation('admin',admin,'update_global_store',{p_admin_id:id(2),p_store_id:gid,p_name:'Updated Global',p_logo_url:'https://example.test/logo.png',p_category:'fashion',p_store_url:'https://example.test',p_sort_order:2});assert.equal((await db.query('SELECT name FROM global_stores WHERE id=$1',[gid])).rows[0].name,'Updated Global');count++;
 const storeArgs={p_admin_id:id(2),p_store_id:null,p_store_name:'New Test Store',p_username:'new-test-store',p_phone:'new-test-phone',p_password:'new-store-password',p_country:'Test',p_governorate:'Test',p_store_type:'شامل',p_specialty:'شامل',p_default_currency:'USD',p_commission_rate:12,p_logo_url:null,p_store_url:null,p_status:'active'};
 const sid=await operation('admin',admin,'admin_save_local_store',storeArgs);assert(sid);assert.equal((await db.query("SELECT password_hash=extensions.crypt('new-store-password',password_hash) ok FROM local_stores WHERE id=$1",[sid])).rows[0].ok,true);count++;
 await deny(()=>operation('admin',admin,'admin_save_local_store',{...storeArgs,p_password:'short'}));
 await api('kinto_admin_store_status_session_v1',[admin,sid,'inactive']);assert.equal((await db.query('SELECT status FROM local_stores WHERE id=$1',[sid])).rows[0].status,'inactive');count++;
 await deny(()=>api('kinto_admin_store_status_session_v1',[vendor,sid,'active']));
 await db.query("UPDATE vendor_sessions SET revoked_at=now() WHERE token_hash=extensions.digest($1,'sha256')",[vendor]);await deny(()=>operation('vendor',vendor,'vendor_get_profit_margin',{}));await db.query("UPDATE vendor_sessions SET revoked_at=null WHERE token_hash=extensions.digest($1,'sha256')",[vendor]);
 await operation('admin',admin,'delete_global_store',{p_store_id:gid});assert.equal((await db.query('SELECT id FROM global_stores WHERE id=$1',[gid])).rows.length,0);count++;
 // Actual shipped adapter invokes the real scoped SQL wrapper with server-derived store authority.
 let token=vendor;const win={sessionStorage:{getItem:()=>JSON.stringify({token})},fetch:async(input,init)=>{const r=new Request(input,init);const a=await r.json();try{return new Response(JSON.stringify(await operation(a.p_role,a.p_session_token,a.p_operation,a.p_args)),{status:200})}catch(e){return new Response(JSON.stringify({message:e.message}),{status:403})}}};
 const ctx=vm.createContext({window:win,document:{currentScript:{dataset:{role:"vendor"}}},Request,Response,Headers,URL,Date,JSON,Error,String,Object});vm.runInContext(fs.readFileSync('js/kinto-store-control-v1.js','utf8'),ctx);
 const response=await win.KintoStoreControlV1.fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/vendor_set_profit_margin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({p_store_id:id(1),p_margin:14})});assert.equal(response.status,200);assert.equal(Number(await response.json()),14);count++;
 token=otherVendor;const foreign=await win.KintoStoreControlV1.fetch('https://hsmmbloouskqdnptiiad.supabase.co/rest/v1/rpc/vendor_set_profit_margin',{method:'POST',body:JSON.stringify({p_store_id:id(1),p_margin:99})});assert.equal(foreign.status,403);count++;
 console.log(`PASS ${count} store control checks: table/column lockdown, private credentials, real session scopes, native pricing delegates, hashed store creation, global store management and shipped adapter`);
}
