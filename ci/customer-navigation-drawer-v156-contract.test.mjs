import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('dashboard.html','utf8'),js=fs.readFileSync('js/customer-navigation-drawer-v156.js','utf8'),css=fs.readFileSync('css/customer-navigation-drawer-v156.css','utf8');
assert.match(html,/customer-navigation-drawer-v156\.css/);assert.match(html,/customer-navigation-drawer-v156\.js/);
for(const tab of ['activeOrders','orderHistory','chatHelp','notifications','drafts','productReviews','customerFavorites'])assert.match(js,new RegExp(tab));
for(const selector of ['#backBtn','#mwGlobalThemeToggle','#customerLogoutBtn'])assert.ok(js.includes(selector));
assert.ok(js.includes('notificationUnreadBadge'));assert.ok(js.includes('MutationObserver'));assert.ok(!js.includes('innerText==='));
assert.match(css,/@media\(max-width:1024px\)/);assert.ok(css.includes('inset-inline-end'));assert.ok(css.includes('html[dir="ltr"]'));
console.log('V156 customer navigation drawer contract passed');
