#!/usr/bin/env python3
"""Build a reviewable static-site ZIP from an exact Git commit; never deploy."""
import argparse
import hashlib
import io
import json
import posixpath
import re
import subprocess
import tarfile
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PAGES = '''admin-branch-reports.html admin-branches.html admin-content-cms.html
admin-dashboard.html admin-delivery-reports.html branch-dashboard.html
branch-manifest.html dashboard.html delivery-dashboard.html employee-dashboard.html
external-shipping-shell.html global-stores.html index.html local-stores-admin.html
local-stores.html login.html order.html register.html store.html
vendor-dashboard-barcode-shell.html vendor-dashboard-v2.html vendor-dashboard.html'''.split()
ASSETS = {'css': {'.css'}, 'js': {'.js'},
          'images': {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico'},
          'meshwar-images': {'.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'},
          'videos': {'.mp4', '.webm', '.ogg'}}

def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])

class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ('src', 'poster'):
            if a.get(key):
                self.refs.append(a[key])
        if tag == 'link' and a.get('href'):
            self.refs.append(a['href'])
        if tag == 'a' and re.search(r'\.html(?:[?#]|$)', a.get('href', '')):
            self.refs.append(a['href'])

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True, help='Full 40-character approved commit SHA')
    parser.add_argument('--output', required=True, type=Path, help='New directory outside the checkout')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9a-f]{40}', args.source):
        parser.error('--source must be an exact full commit SHA')
    resolved = git('rev-parse', args.source + '^{commit}').decode().strip()
    if resolved != args.source:
        parser.error('Source commit did not resolve exactly')
    output = args.output.resolve()
    if output == ROOT or ROOT in output.parents:
        parser.error('Output must be outside the repository')
    if output.exists():
        parser.error('Output directory already exists; use a new directory')
    files = {}
    with tarfile.open(fileobj=io.BytesIO(git('archive', '--format=tar', args.source))) as archive:
        for member in archive:
            path = member.name
            top = path.split('/')[0]
            selected = path in PAGES or path == 'manifest.json' or (
                top in ASSETS and Path(path).suffix.lower() in ASSETS[top])
            if selected:
                if not member.isfile():
                    if member.isdir():
                        continue
                    raise SystemExit('Refusing non-regular release file: ' + path)
                files[path] = archive.extractfile(member).read()
    missing = set(PAGES + ['manifest.json']) - files.keys()
    if missing:
        raise SystemExit('Missing required files: ' + ', '.join(sorted(missing)))
    errors = []
    def check(source, reference):
        if any(c in reference for c in ('${', '{{', '<', '>')):
            return
        url = urlsplit(reference.strip())
        if url.scheme or url.netloc or not url.path:
            return
        path = unquote(url.path)
        target = posixpath.normpath(path.lstrip('/') if path.startswith('/') else
                                    posixpath.join(posixpath.dirname(source), path))
        if target not in files:
            errors.append({'source': source, 'reference': reference, 'target': target})
    for path, content in files.items():
        if path.endswith('.html'):
            refs = References()
            refs.feed(content.decode('utf-8-sig'))
            for reference in refs.refs:
                check(path, reference)
        elif path.endswith('.css'):
            for match in re.finditer(r'''url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)''', content.decode('utf-8-sig')):
                check(path, next(group for group in match.groups() if group is not None))
    for icon in json.loads(files['manifest.json']).get('icons', []):
        check('manifest.json', icon['src'])
    if errors:
        raise SystemExit('Unresolved static references:\n' + json.dumps(errors, ensure_ascii=False, indent=2))
    output.mkdir(parents=True)
    package = output / 'kinto-hostinger-site.zip'
    with zipfile.ZipFile(package, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(files):
            info = zipfile.ZipInfo(path, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, files[path])
    report = {'source_commit': args.source, 'status': 'package-prepared-not-deployed',
              'file_count': len(files), 'zip_sha256': hashlib.sha256(package.read_bytes()).hexdigest(),
              'static_references': 'passed',
              'limits': ['Dynamic JavaScript paths and external services require runtime checks.',
                         'Hostinger automatic-deployment setting has not been verified.',
                         'No PWA draft merge, database change, or hosting upload performed.',
                         'ZIP is for reviewed file upload; native Git import is a different path.'],
              'files': [{'path': p, 'sha256': hashlib.sha256(files[p]).hexdigest(), 'bytes': len(files[p])}
                        for p in sorted(files)]}
    (output / 'release-review.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k != 'files'}, indent=2))

if __name__ == '__main__':
    main()
