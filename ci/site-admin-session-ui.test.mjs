import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('actual settings, brand and media controllers use session-only RPCs and preserve settings',async()=>{
 const calls=[],uploads=[],elements=new Map();let saved={unknown_key:'preserve'},token='synthetic-session';
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'',checked:false,style:{},textContent:'',addEventListener:()=>{}});return elements.get(id)};
 const sb={rpc:async(name,args)=>{calls.push({name,args});if(name==='get_site_settings')return {data:saved};if(name==='save_site_settings_session_v1'){saved=JSON.parse(JSON.stringify(args.p_value));return {data:true}}if(name==='admin_create_hero_upload_session_v1')return {data:{bucket:'site-hero-media',path:'hero/synthetic.png'}};throw Error('UNEXPECTED_RPC '+name)},storage:{from:bucket=>({upload:async(path,file,options)=>{uploads.push({bucket,path,options});return {}},getPublicUrl:()=>({data:{publicUrl:'https://example.com/hero.png'}})})}};
 const context={window:{KintoAdminSessionV147:{read:()=>token?{token}:null,identity:async()=>{if(!token)throw Error('SESSION_REQUIRED');return {id:'admin-1',role:'admin'}}},addEventListener:()=>{}},document:{readyState:'loading',addEventListener:()=>{},getElementById:el},location:{search:'?adminId=admin-1'},URLSearchParams,URL,console:{error:()=>{},warn:()=>{}},sb};vm.createContext(context);
 const html=fs.readFileSync('admin-content-cms.html','utf8'),inline=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];vm.runInContext(inline,context);vm.runInContext('getSb=async()=>sb;currentSettings={unknown_key:"preserve"};fillForm(DEFAULTS);',context);
 await context.window.saveSiteSettings();assert.equal(saved.unknown_key,'preserve');
 await vm.runInContext("uploadHeroFile({name:'test.png',type:'image/png',size:10},'hero_image_url','image')",context);
 let source=fs.readFileSync('js/admin-brand-logo-v15.js','utf8');const i=source.lastIndexOf('})();');source=source.slice(0,i)+'window.brandTest={saveLogo,upload};'+source.slice(i);vm.runInContext(source,context);
 el('brand_logo_url').value='https://example.com/logo.png';await context.window.brandTest.saveLogo();assert.equal(saved.unknown_key,'preserve');assert.equal(saved.brand_logo_url,'https://example.com/logo.png');
 await context.window.brandTest.upload({name:'logo.png',type:'image/png',size:10});assert.equal(uploads.length,2);for(const up of uploads)assert.equal(up.options.upsert,false);
 for(const c of calls.filter(x=>x.name!=='get_site_settings')){assert.equal(c.args.p_session_token,token);assert(!('p_admin_id'in c.args));}
 token=null;const before=calls.length;await context.window.saveSiteSettings();await assert.rejects(()=>context.window.brandTest.saveLogo());await assert.rejects(()=>context.window.brandTest.upload({name:'logo.png',type:'image/png',size:10}));assert.equal(calls.length,before);
});
