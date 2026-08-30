from pathlib import Path

tag='<script src="js/local-store-category-images-v53.js?v=20260830-v53" data-mw-category-images-v53></script>'
for name in ['index.html','vendor-dashboard-v2.html']:
    p=Path(name)
    s=p.read_text(encoding='utf-8')
    if 'local-store-category-images-v53.js' in s:
        continue
    assert '</body>' in s, f'{name}: closing body not found'
    s=s.replace('</body>',tag+'\n</body>',1)
    p.write_text(s,encoding='utf-8')

# Safety invariants: no customer session/auth code touched by this feature.
for name in ['index.html','vendor-dashboard-v2.html']:
    s=Path(name).read_text(encoding='utf-8')
    assert s.count('local-store-category-images-v53.js')==1

addon=Path('js/local-store-category-images-v53.js').read_text(encoding='utf-8')
assert 'restoreCustomerSession' not in addon
assert 'logout()' not in addon
assert 'loggedInUser' not in addon
assert 'meshwar_customer_id' not in addon
assert 'store_category_media' in addon
assert 'category-images' in addon
