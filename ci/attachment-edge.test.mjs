import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const original=fs.readFileSync('supabase/functions/kinto-attachment-access-v1/index.ts','utf8');
const source=original.replace(/^import .*\n/,'const createClient=()=>{throw Error("Use injected test client")};\n').replace(/if\(import.meta.main\)Deno.serve[^\n]+/,'');
const {handle}=await import('data:text/javascript,'+encodeURIComponent(stripTypeScriptTypes(source)));
const request=p=>new Request('https://example.test/function',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(p)});
const valid={role:'customer',session_token:'real-test-session',paths:['own/file.png','foreign/file.png']};
function fixture({allowed=['own/file.png'],error=null}={}){const signs=[],calls=[];return{signs,calls,factory:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:allowed,error}},storage:{from:bucket=>({createSignedUrls:async(paths,seconds)=>{signs.push({bucket,paths,seconds});return{data:paths.map(path=>({path,signedUrl:'https://example.test/signed/'+path})),error:null}}})}})}}
test('Edge rejects malformed, anonymous and invalid sessions before signing',async()=>{
 for(const p of [null,1,{}, {...valid,session_token:''},{...valid,role:'vendor'},{...valid,paths:['../secret']},{...valid,paths:Array(101).fill('a')}]){const f=fixture();assert.equal((await handle(request(p),f.factory,()=> 'test')).status,400);assert.equal(f.signs.length,0)}
 const f=fixture({error:{message:'SESSION_INVALID'}});assert.equal((await handle(request(valid),f.factory,()=> 'test')).status,403);assert.equal(f.signs.length,0);
});
test('Edge signs only the exact paths authorized by the database for this session',async()=>{
 const f=fixture();const r=await handle(request(valid),f.factory,()=> 'test');assert.equal(r.status,200);assert.deepEqual(f.signs,[{bucket:'chat-attachments',paths:['own/file.png'],seconds:900}]);const body=await r.json();assert(!Object.hasOwn(body.urls,'foreign/file.png'));assert.deepEqual(f.calls[0].args,{p_role:'customer',p_session_token:'real-test-session',p_paths:valid.paths});
});
test('Edge never signs a path merely because it was returned outside the requested set',async()=>{
 const f=fixture({allowed:['not-requested/private.png']});assert.equal((await handle(request(valid),f.factory,()=> 'test')).status,403);assert.equal(f.signs.length,0);
});
