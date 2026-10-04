import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const ui=readFileSync('js/admin-kinto-deals-g3f.js','utf8'),sql=readFileSync('supabase/migrations/20261004_kinto_deals_v1_g9_admin_publication_status.sql','utf8');
for(const s of ['publicationControls(parent,d)','displayControls(publicationArea)','kinto_deals_v1_admin_publication_g8','kinto_deals_v1_admin_publication_status_g9','confirm(','p_campaign_id:null'])assert.ok(ui.includes(s),s);
for(const s of ['private.require_admin_session_v147','kinto_deals_v1_publications_g7','kinto_deals_v1_display_settings_g7','revoke all on function'])assert.ok(sql.includes(s),s);
assert.doesNotMatch(sql,/update\s+public\.orders|merchant_deals_enabled|active_kinto_campaigns_v400/i);
console.log('G9 publication UI isolation checks passed');
