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
 /^employee-dashboard[.]html$/,
 /^docs\/KINTO_G16_[^/]+[.]md$/,
 /^js\/kinto-(?:card-image-(?:prepare|share)|g16-card-api|g16-verified-manual-cards-read|g16-employee-chat-handoff|g16-employee-instructions-read|g16-employee-panel|g16-instruction-freshness|g16-destination-card-artwork|manual-card-policy|manual-dispatch-preflight|manual-payment-message|manual-instruction-assembly|payment-brand|payment-instruction-snapshot|payment-whatsapp-handoff|invoice-readonly)-v1[.]js$/,
 /^previews\/kinto-(?:admin-card-image|employee-payment-instruction|manual-payment-card)-isolated-v1[.]html$/,
 /^tests\/kinto-g16-card-extension-security-contract[.]test[.]cjs$/,
 /^tests\/kinto-g16-employee-manual-cards-edge-v1[.]test[.]cjs$/,
 /^tests\/kinto-g16-employee-manual-cards-edge-runtime-v1[.]test[.]cjs$/,
 /^tests\/kinto-g16-employee-chat-handoff-v1[.]test[.]cjs$/,
 /^tests\/kinto-g16-instruction-freshness-v1[.]test[.]cjs$/,
 /^tests\/kinto-g16-destination-card-artwork-v1[.]test[.]cjs$/,
 /^tests\/kinto-g16-employee-order-context-runtime-v1[.]test[.]cjs$/,
 /^tests\/kinto-g16-employee-instructions-read-runtime-v1[.]test[.]cjs$/,
 /^tests\/kinto-g16-employee-instructions-read-v1[.]test[.]cjs$/,
 /^tests\/kinto-g16-employee-panel-opt-in-v1[.]test[.]cjs$/,
 /^tests\/kinto-(?:g16-card-api|g16-verified-manual-cards-read|manual-card-policy|manual-dispatch-preflight|manual-payment-isolated|manual-payment-preview-scope|manual-instruction-assembly|manual-payment-flow-matrix|payment-brand|payment-instruction-snapshot|payment-whatsapp-handoff|card-image-share|invoice-readonly)-v1[.]test[.]cjs$/,
 /^sql\/kinto-g16-card-assets-isolated-v1[.](?:review|verify-readonly|rollback[.]review)[.]sql$/,
 /^supabase\/functions\/kinto-card-images-v1\/index[.]ts$/,
 /^supabase\/functions\/kinto-g16-employee-manual-cards-read-v1\/index[.]ts$/,
 /^supabase\/functions\/kinto-g16-employee-order-context-read-v1\/index[.]ts$/,
 /^supabase\/functions\/kinto-g16-employee-instructions-read-v1\/index[.]ts$/,
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
 // Exactly ONE additive optional loader is permitted; all preexisting employee
 // logic must remain byte-for-byte equal to the protected base ref.
 if(files.includes('employee-dashboard.html')){
  const original=cp.execFileSync('git',['show',ref+':employee-dashboard.html'],{
   cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const current=fs.readFileSync(path.join(root,'employee-dashboard.html'),'utf8');
  const suffix="\n<!-- G16 opt-in add-on: no effect without ?kintoG16Preview=1; never touches order workflows -->\n<script src=\"js/kinto-g16-employee-panel-v1.js?v=20261127-opt-in\" defer></script>\n";
  if(current!==original+suffix)throw Error('G16 altered protected employee dashboard beyond one optional script loader');
 }

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
