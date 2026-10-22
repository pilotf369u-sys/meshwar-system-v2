import fs from 'node:fs';
const snapshot=JSON.parse(fs.readFileSync(new URL('./fixtures/schema-20261017.json',import.meta.url)));
const configuration=JSON.parse(fs.readFileSync(new URL('./fixtures/configuration-20261017.json',import.meta.url)));
const q=s=>'"'+s.replaceAll('"','""')+'"',name=s=>s.split('.').map(q).join('.'),role=s=>s==='PUBLIC'?'PUBLIC':q(s);
export async function bootstrap(db,{wasm=false}={}){
 await db.exec(`SET check_function_bodies=false;SET search_path=public,private,extensions,pg_catalog;CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;CREATE SCHEMA private;CREATE SCHEMA extensions;CREATE SCHEMA auth;CREATE SCHEMA storage;CREATE TABLE auth.users(id uuid PRIMARY KEY);CREATE TABLE storage.buckets(id text PRIMARY KEY,public boolean);CREATE TABLE storage.objects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb);CREATE EXTENSION pgcrypto WITH SCHEMA extensions;`);
 if(wasm)await db.exec('CREATE FUNCTION extensions.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$SELECT gen_random_uuid()$$');else await db.exec('CREATE EXTENSION "uuid-ossp" WITH SCHEMA extensions');
 await db.exec(`CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$SELECT current_user::text$$;CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$SELECT coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;`);
 const identitySeq=new Set(snapshot.tables.flatMap(t=>t.columns.filter(c=>c.identity).map(c=>`${t.schema}.${t.name}_${c.name}_seq`)));
 for(const s of snapshot.sequences)if(!identitySeq.has(`${s.schema}.${s.name}`))await db.exec(`CREATE SEQUENCE ${q(s.schema)}.${q(s.name)} AS ${s.type} INCREMENT ${s.increment} MINVALUE ${s.min} MAXVALUE ${s.max} START ${s.start} CACHE ${s.cache} ${s.cycle?'CYCLE':'NO CYCLE'}`);
 for(const t of snapshot.tables){const cols=t.columns.map(c=>`${q(c.name)} ${c.type}${c.identity?' GENERATED '+(c.identity==='a'?'ALWAYS':'BY DEFAULT')+' AS IDENTITY':c.default?' DEFAULT '+c.default:''}${c.notnull?' NOT NULL':''}`);await db.exec(`CREATE TABLE ${q(t.schema)}.${q(t.name)}(${cols.join(',')})`)}
 for(const c of snapshot.constraints.filter(c=>c.type!=='f'))await db.exec(`ALTER TABLE ${name(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
 for(const c of snapshot.constraints.filter(c=>c.type==='f'))await db.exec(`ALTER TABLE ${name(c.table)} ADD CONSTRAINT ${q(c.name)} ${c.definition}`);
 for(const sql of snapshot.indexes)await db.exec(sql);
 for(const f of snapshot.functions)await db.exec(f.definition);
 for(const v of snapshot.views)await db.exec(`CREATE VIEW ${q(v.schema)}.${q(v.name)}${v.options?.length?' WITH ('+v.options.join(',')+')':''} AS ${v.definition}`);
 for(const t of snapshot.triggers){await db.exec(t.definition);if(t.enabled==='D')await db.exec(`ALTER TABLE ${name(t.table)} DISABLE TRIGGER ${q(t.name)}`)}
 for(const t of snapshot.tables)if(t.rls)await db.exec(`ALTER TABLE ${q(t.schema)}.${q(t.name)} ENABLE ROW LEVEL SECURITY`);
 for(const p of snapshot.policies)await db.exec(`CREATE POLICY ${q(p.policyname)} ON ${q(p.schemaname)}.${q(p.tablename)} AS ${p.permissive} FOR ${p.cmd} TO ${p.roles.map(x=>x==='public'?'PUBLIC':q(x)).join(',')}${p.qual?' USING ('+p.qual+')':''}${p.with_check?' WITH CHECK ('+p.with_check+')':''}`);
 await db.exec('GRANT USAGE ON SCHEMA public,private,extensions TO anon,authenticated,service_role;REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public,private FROM PUBLIC,anon,authenticated,service_role');
 const sequences=new Set(snapshot.sequences.map(s=>`${s.schema}.${s.name}`));
 for(const g of snapshot.table_grants)await db.exec(`GRANT ${g.privilege} ON ${sequences.has(g.table.includes('.')?g.table:'public.'+g.table)?'SEQUENCE':'TABLE'} ${name(g.table)} TO ${role(g.grantee)}`);
 for(const g of snapshot.column_grants)await db.exec(`GRANT ${g.privilege} (${q(g.column)}) ON ${name(g.table)} TO ${role(g.grantee)}`);
 for(const g of snapshot.function_grants)await db.exec(`GRANT ${g.privilege} ON FUNCTION ${g.function} TO ${role(g.grantee)}`);
 for(const [table,rows]of Object.entries(configuration))for(const r of rows||[]){const cols=Object.keys(r);await db.query(`INSERT INTO public.${q(table)}(${cols.map(q).join(',')}) VALUES(${cols.map((_,i)=>'$'+(i+1)).join(',')})`,cols.map(c=>typeof r[c]==='object'&&r[c]!==null?JSON.stringify(r[c]):r[c]))}
 return{tables:snapshot.tables.length,functions:snapshot.functions.length,triggers:snapshot.triggers.length,policies:snapshot.policies.length};
}
