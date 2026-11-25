#!/usr/bin/env node
/* KINTO G16 isolated card safety gate. Run locally against a checked-out PR.
 * No network access, no writes, no production Supabase contact.
 * Usage: node scripts/kinto-g16-card-safety-gate-v1.cjs [base-ref]
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
const ref=process.argv[2]||'origin/main';
const prohibited=[
 /^admin-dashboard[.]html$/,/^employee-dashboard[.]html$/,/^dashboard[.]html$/,
 /^index[.]html$/,/^js\/admin-payment-methods-g16[.]js$/,
 /^supabase\/functions\/kinto-payment-security-g16\//,
 /^supabase\/migrations\//,/^mobile\//,/^css\//,
 /^js\/.*(?:checkout|cart|invoice|order|stock|auth|vendor|payment-mode).*[.]js$/
];
function run(){
 let files;
 try{
  files=cp.execFileSync('git',['diff','--name-only',ref+'...HEAD'],{
   cwd:root,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim().split('\n').filter(Boolean);
 }catch(e){throw Error('Unable to compare PR to '+ref+'; cannot assert isolation')}
 const forbidden=files.filter(f=>prohibited.some(re=>re.test(f)));
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
