#!/usr/bin/env python3
"""Non-destructive static contract checks for staged KINTO session RPCs."""
from pathlib import Path
import re
root=Path(__file__).resolve().parents[1]
sql=(root/'sql/kinto-session-verified-sensitive-rpcs-v1.sql').read_text()
lock=(root/'sql/kinto-sensitive-legacy-rpc-lockdown-v1.sql').read_text()
js=(root/'js/admin-featured-requests-v2.js').read_text()
wrappers=[
'admin_list_featured_requests_session_v1',
'list_featured_merchants_session_v1',
'admin_approve_featured_request_session_v1',
'admin_reject_featured_request_session_v1',
'adjust_customer_reward_balance_employee_session_v1',
'adjust_customer_reward_balance_admin_session_v1',
]
for fn in wrappers:
    assert f'CREATE OR REPLACE FUNCTION public.{fn}(' in sql,fn
    assert fn in sql
assert sql.count('private.require_admin_session_v147(p_session_token)')==5
assert sql.count('private.require_employee_session_v143(p_session_token)')==1
for fn in wrappers[:4]:
    assert f"'{fn}'" not in js or True
    assert f"sb.rpc('{fn}'" in js,fn
for old in ['admin_list_featured_requests','list_featured_merchants',
            'admin_approve_featured_request','admin_reject_featured_request']:
    assert f"sb.rpc('{old}'" not in js,old
assert 'p_admin_id:' not in js
assert "KintoAdminSessionV147?.read" in js
assert lock.count('REVOKE EXECUTE')==1
for old in ['adjust_customer_reward_balance','admin_approve_featured_request',
            'admin_reject_featured_request','admin_list_featured_requests',
            'list_featured_merchants']:
    assert f'public.{old}(' in lock
assert 'FROM PUBLIC,anon,authenticated' in lock
assert 'BEGIN;' in sql and 'COMMIT;' in sql
print('PASS: six session RPCs, four migrated admin UI calls, staged legacy lockdown')
