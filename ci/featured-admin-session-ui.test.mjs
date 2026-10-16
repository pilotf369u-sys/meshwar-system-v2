import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
test('actual campaign controllers send session tokens for list/create/update/toggle/delete',async()=>{
 const calls=[],elements=new Map();let token='synthetic-admin-token';
 const values={featuredMerchant:'11111111-1111-4111-8111-111111111111',featuredStoreName:'Test',featuredSlotType:'hero_banner',featuredStartDate:'2026-10-16T10:00',featuredEndDate:'2026-10-20T10:00'};
 for(const id of ['featuredCampaignStatus','featuredCampaignBody','featuredEditId','featuredSaveBtn','featuredMerchant','featuredStoreName','featuredSlotType','featuredStartDate','featuredEndDate','featuredBannerUrl','featuredStoreLogo','featuredItemIds','featuredIsActive','featuredCancelBtn'])elements.set(id,{value:values[id]||'',checked:true,style:{},querySelectorAll:()=>[],click:()=>{}});
 const sb={rpc:async(name,args)=>{calls.push({name,args});return {data:[]}}};
 const context={window:{KintoAdminSessionV147:{read:()=>token?{token}:null},addEventListener:()=>{},confirm:()=>true},document:{readyState:'loading',addEventListener:()=>{},getElementById:id=>elements.get(id)},verifyAdmin:async()=>{if(!token)throw Error('ADMIN_SESSION_REQUIRED')},getSb:async()=>sb,console:{error:()=>{}},setInterval:()=>0,clearInterval:()=>{}};
 vm.createContext(context);
 for(const [file,expose]of [['js/admin-featured-campaigns-v1-core-v15.js','window.core={loadCampaigns,saveCampaign,toggleCampaign};'],['js/admin-featured-campaigns-v92.js','window.v92={save,removeCampaign};']]){
  let s=fs.readFileSync(file,'utf8');const i=s.lastIndexOf('})();');assert(i>=0);s=s.slice(0,i)+expose+s.slice(i);vm.runInContext(s,context);
 }
 await context.window.core.loadCampaigns();await context.window.core.toggleCampaign(values.featuredMerchant,false);
 await context.window.core.saveCampaign();for(const [k,v]of Object.entries(values))elements.get(k).value=v;
 await context.window.v92.save();elements.get('featuredEditId').value=values.featuredMerchant;await context.window.v92.save();await context.window.v92.removeCampaign(values.featuredMerchant,{});
 for(const name of ['admin_list_merchant_featured_slots','admin_toggle_merchant_featured_slot','admin_upsert_merchant_featured_slot','admin_upsert_merchant_featured_slot_v2','admin_delete_merchant_featured_slot_v2'])assert(calls.some(c=>c.name===name+'_session_v1'),name);
 for(const c of calls){assert.equal(c.args.p_session_token,token);assert(!('p_admin_id'in c.args));}
 token=null;const before=calls.length;await context.window.core.loadCampaigns().catch(()=>{});await context.window.core.toggleCampaign(values.featuredMerchant,true);await context.window.v92.save();await context.window.v92.removeCampaign(values.featuredMerchant,{});assert.equal(calls.length,before);
});
