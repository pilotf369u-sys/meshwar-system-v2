import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync('supabase/migrations/20261004_kinto_deals_v1_g8_admin_publication.sql','utf8');
for(const part of ['private.require_admin_session_v147','p_action','publish','unpublish','enable_display','disable_display',"v_latest.review_state<>'acknowledged'","e.decision='approved'","v_campaign.status<>'submitted'",'v_campaign.ends_at<=v_now','v_campaign.starts_at>v_now','kinto_deals_v1_publications_g7','kinto_deals_v1_display_settings_g7','revoke all on function'])assert.ok(s.includes(part),part);
assert.doesNotMatch(s,/update\s+public\.kinto_deals_v1_flags|update\s+public\.orders|active_kinto_campaigns_v400/i);
console.log('G8 admin publication static isolation checks passed');
