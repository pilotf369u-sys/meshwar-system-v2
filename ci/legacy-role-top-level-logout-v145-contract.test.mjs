import assert from 'node:assert/strict';
import fs from 'node:fs';

for (const file of [
  'admin-dashboard.html',
  'branch-dashboard.html',
  'delivery-dashboard.html'
]) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.match(
    source,
    /<a\b(?=[^>]*\bhref=["']login\.html["'])(?=[^>]*\btarget=["']_top["'])[^>]*>\s*تسجيل الخروج\s*<\/a>/i,
    `${file} must leave the outer role shell when logging out`
  );
}

console.log('legacy role top-level logout contract: ok');
