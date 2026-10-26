"""Offline integration boundary: current main business code and accepted mobile source."""
import hashlib,json,pathlib
root=pathlib.Path(__file__).resolve().parents[2]
m=json.loads((root/'mobile/release/INTEGRATION-SCOPE-20261026.json').read_text())
assert m['main_parent_only'] and not m['source_branch_merged']
assert m['production_ready'] is False and m['merge_or_deploy_authorized'] is False
for group in ['protected_main_sha256','accepted_mobile_source_sha256']:
 for relative,expected in m[group].items():
  p=root/relative
  assert p.is_file() and not p.is_symlink(),relative
  data=p.read_bytes()
  delta=m.get('authorized_invoice_identity_delta',{})
  if group=='protected_main_sha256' and relative==delta.get('path'):
   for change in delta['replacements']:
    after=change['after'].encode();before=change['before'].encode()
    assert data.count(after)==1,('exact authorized invoice identity delta',relative)
    data=data.replace(after,before,1)
  assert hashlib.sha256(data).hexdigest()==expected,(group,relative)
p=root/'dashboard.html';b=p.read_bytes();addition=m['dashboard_only_added_line'].encode()
assert b.count(addition)==1,'exactly one added privacy dependency'
assert hashlib.sha256(b.replace(addition,b'',1)).hexdigest()==m['dashboard_without_privacy_client_sha256'],'current dashboard changed beyond privacy dependency'
print('PASS_INTEGRATION_SCOPE: current main business/CMS/pages preserved; dashboard has one dependency addition; accepted mobile source unchanged; no readiness/deployment authority')
