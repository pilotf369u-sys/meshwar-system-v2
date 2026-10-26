// Differential comparison: actual invoice JS vs actual pure SQL projection.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
 const preview=fs.readFileSync('sql/kinto-privacy-transaction-preview-v1.sql','utf8');const helper=preview.slice(preview.indexOf('CREATE FUNCTION private.kinto_privacy_preview_object_v1'),preview.indexOf('CREATE FUNCTION private.kinto_privacy_preview_relation_v1'));
 const sql=fs.readFileSync('sql/kinto-privacy-invoice-retention-v1.sql','utf8');const pure=sql.slice(sql.indexOf('CREATE FUNCTION private.kinto_privacy_invoice_trim_v1'),sql.indexOf('CREATE FUNCTION public.kinto_privacy_invoice_preserve_v1'));
 await db.exec('CREATE SCHEMA private;'+helper+pure);
 const js=fs.readFileSync('js/kinto-bundle-ui-v93.js','utf8'),line=p=>js.split('\n').find(x=>x.startsWith(p));
 const functions=js.slice(js.indexOf('function frozenInvoiceCustomerV1('),js.indexOf('async function hydrateCustomer('));
 const read=vm.runInNewContext(line('const first=')+'\n'+line('function details(')+'\n'+functions+'\ncustomerData');
 const p={name:'TEST NAME',code:'TEST CODE',phone:'TEST PHONE',secondary_phone:null,country:'TEST COUNTRY',state:'TEST STATE',address:'TEST ADDRESS'};
 const complete={name:'FROZEN NAME',code:'FROZEN CODE',phone:'FROZEN PHONE',secondary_phone:'',country:'',province:'',address:''};
 const cases=[{details:'{}'},{details:{customer_name:'ORDER NAME'}},{details:'{}',customer_snapshot:complete},{details:{customer:complete}},{details:{customer:{name:'PARTIAL'}}},{details:'{}',customer_snapshot:{name:'PARTIAL'}},{details:{},customer_name:'OTHER',customer_phone:'OTHER'},{details:'{}'}];
 const profiles=[p,p,p,p,p,p,p,{...p,name:'\u00a0\uFEFF TEST SPACE\u2028\u3000',phone:'\tTEST PHONE\n'}];
 for(let i=0;i<cases.length;i++){const order=cases[i],profile=profiles[i],j=JSON.parse(JSON.stringify(read({...order,_kintoCustomer:profile})));j.secondary_phone=j.secondary;delete j.secondary;const result=(await db.query('SELECT private.kinto_privacy_electronic_identity_v1($1::jsonb,$2::jsonb) AS result',[JSON.stringify(order),JSON.stringify(profile)])).rows[0].result;assert.deepEqual(result,j,'case '+i)}
 for(const order of [{details:'{malformed'},{details:'{}'}]){const profile=order.details==='{malformed'?p:{...p,phone:123};assert.equal((await db.query('SELECT private.kinto_privacy_electronic_identity_v1($1::jsonb,$2::jsonb) AS result',[JSON.stringify(order),JSON.stringify(profile)])).rows[0].result,null)}
 console.log('PASS_ELECTRONIC_IDENTITY_SQL: 8 actual JS/SQL comparisons, including frozen/partial/profile/Unicode whitespace; malformed and unexpected scalar contexts held.');
 }finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
