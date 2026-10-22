import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const reviews=readFileSync(new URL('../js/customer-product-reviews-v135.js',import.meta.url),'utf8');
const dashboard=readFileSync(new URL('../dashboard.html',import.meta.url),'utf8');
function section(text,start,end){return text.slice(text.indexOf(start),text.indexOf(end,text.indexOf(start)));}
const badgeCode=section(reviews,'  async function refreshNotificationBadge(','  async function refreshLiveReviewNotifications(');
function notifications(count,failAt=0){
 const keys=Array.from({length:count},(_,i)=>'order:'+i),calls=[],badges=[];
 const sb={rpc:async(name,args)=>{calls.push({name,keys:[...args.p_notification_keys]});return calls.length===failAt?{error:new Error('offline')}:{data:{unread_count:args.p_notification_keys.filter(k=>Number(k.split(':')[1])%2===0).length}}}};
 const ctx=vm.createContext({state:{token:'test'},visibleNotificationKeys:()=>keys,setNotificationBadge:n=>badges.push(n),client:async()=>sb,readOnlyBlocked:()=>false,console:{warn(){}}});
 vm.runInContext(badgeCode,ctx);return{ctx,calls,badges,keys};
}
test('251 notifications are counted and marked in complete batches of at most 100',async()=>{
 const h=notifications(251);await h.ctx.refreshNotificationBadge();assert.deepEqual(h.calls.map(x=>x.keys.length),[100,100,51]);assert.deepEqual(h.calls.flatMap(x=>x.keys),h.keys);assert.equal(h.badges.at(-1),126);
 h.calls.length=0;await h.ctx.markVisibleNotificationsRead();assert.deepEqual(h.calls.map(x=>x.keys.length),[100,100,51]);assert.equal(h.badges.at(-1),0);
});
test('a failed notification batch does not falsely clear unread state',async()=>{
 const h=notifications(201,2);await h.ctx.markVisibleNotificationsRead();assert.equal(h.calls.length,2);assert.deepEqual(h.badges,[]);
});
const chatCode=section(dashboard,'async function loadCustomerMessages(){','\nasync function sendCustomerMessage()');
function chat(){let html='',writes=0;const box={scrollHeight:100,get innerHTML(){return html},set innerHTML(v){html=v;writes++}};const ctx=vm.createContext({document:{getElementById:()=>box},currentCustomerCloud:{id:'customer-a'},customerChatItemsV61:async()=>[{sender_type:'employee',message:'hello',file_url:'attachment',created_at:'2026-10-22'}],escapeHtml:String,attachmentHtml:()=>'<img src="attachment">',console:{error(){}}});vm.runInContext(chatCode,ctx);return{ctx,box,writes:()=>writes};}
test('unchanged chat preserves existing image nodes; new messages update once',async()=>{
 const h=chat();await h.ctx.loadCustomerMessages();await h.ctx.loadCustomerMessages();assert.equal(h.writes(),1);
 h.ctx.customerChatItemsV61=async()=>[{sender_type:'employee',message:'new',created_at:'2026-10-22'}];await h.ctx.loadCustomerMessages();assert.equal(h.writes(),2);assert.match(h.box.innerHTML,/new/);
 h.ctx.customerChatItemsV61=async()=>{throw Error('offline')};await h.ctx.loadCustomerMessages();assert.equal(h.writes(),2);assert.match(h.box.innerHTML,/new/);
});
test('overlapping chat requests are suppressed and another customer cannot receive stale results',async()=>{
 const h=chat();let done,calls=0;h.ctx.customerChatItemsV61=()=>{calls++;return new Promise(r=>done=r)};
 const pending=h.ctx.loadCustomerMessages();await h.ctx.loadCustomerMessages();assert.equal(calls,1);h.ctx.currentCustomerCloud={id:'customer-b'};done([]);await pending;assert.equal(h.writes(),0);assert.equal(h.box.__kintoChatLoading,false);
});
