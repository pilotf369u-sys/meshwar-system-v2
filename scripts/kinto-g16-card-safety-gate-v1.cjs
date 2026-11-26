#!/usr/bin/env node
/* KINTO G16 isolated card safety gate. Run locally against a checked-out PR.
 * No network access, no writes, no production Supabase contact.
 * Usage: node scripts/kinto-g16-card-safety-gate-v1.cjs [base-ref]
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const ref=process.argv[2]||'origin/main';
const permitted=[
 /^docs\/KINTO_G16_[^/]+[.]md$/,
 /^js\/kinto-(?:card-image-(?:prepare|share)|g16-card-api|manual-card-policy|manual-dispatch-preflight|manual-payment-message|manual-instruction-assembly|payment-brand|payment-instruction-snapshot|payment-whatsapp-handoff|invoice-readonly)-v1[.]js$/,
 /^previews\/kinto-(?:admin-card-image|employee-payment-instruction|manual-payment-card)-isolated-v1[.]html$/,
 /^tests\/kinto-g16-card-extension-security-contract[.]test[.]cjs$/,
 /^tests\/kinto-(?:g16-card-api|manual-card-policy|manual-dispatch-preflight|manual-payment-isolated|manual-instruction-assembly|manual-payment-flow-matrix|payment-brand|payment-instruction-snapshot|payment-whatsapp-handoff|card-image-share|invoice-readonly)-v1[.]test[.]cjs$/,
 /^sql\/kinto-g16-card-assets-isolated-v1[.](?:review|verify-readonly|rollback[.]review)[.]sql$/,
 /^supabase\/functions\/kinto-card-images-v1\/index[.]ts$/,
 /^scripts\/kinto-g16-card-safety-gate-v1[.]cjs$/
];
function run(){
 let files;
 try{
  files=cp.execFileSync('git',['diff','--name-only',ref+'...HEAD'],{
   cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split('\n').filter(Boolean);
 }catch(e){throw Error('Unable to compare PR to '+ref+'; cannot assert isolation')}
 const forbidden=files.filter(f=>!permitted.some(re=>re.test(f)));
 if(forbidden.length)throw Error('Protected operational files changed: '+forbidden.join(', '));
 const proposed=path.join(root,'sql/kinto-g16-card-assets-isolated-v1.review.sql');
 const sql=fs.readFileSync(proposed,'utf8');
 if(!sql.includes('DO NOT RUN')||/\b(?:create|alter|drop|insert|update|delete|commit)\s+(?:table|function|into|from|[a-z_])/i.test(sql.replace(/^--[^\n]*/gm,'')))
  throw Error('G16 image SQL deployment must remain disabled');
 const edge=fs.readFileSync(path.join(root,'supabase/functions/kinto-card-images-v1/index.ts'),'utf8');
 if(!edge.includes("Deno.env.get('KINTO_G16_CARD_IMAGES_APPROVED')!=='true'"))
  throw Error('Edge endpoint release safety lock missing');
 const preview=fs.readFileSync(path.join(root,'previews/kinto-employee-payment-instruction-isolated-v1.html'),'utf8');
 for(const requirement of ['kinto-invoice-readonly-v1.js','card_full','goods_now_shipping_cod','full_cod'])
  if(!preview.includes(requirement))throw Error('Employee preview guard missing '+requirement);
 process.stdout.write('G16 isolated safety gate PASS: '+files.length+' changed files; protected operations untouched.\n');
}
try{run()}catch(e){process.stderr.write('G16 isolated safety gate BLOCKED: '+e.message+'\n');process.exitCode=1}
