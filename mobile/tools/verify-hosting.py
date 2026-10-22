#!/usr/bin/env python3
"""Read-only byte comparison with the checked-out PWA; never deploys."""
import concurrent.futures
import hashlib
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
PATHS = ('index.html', 'manifest.json', 'service-worker.js', 'offline.html',
         'js/kinto-pwa-v275.js', 'js/kinto-connectivity-v275.js',
         '.well-known/assetlinks.json')

def check(path):
    try:
        request = urllib.request.Request('https://shopkinto.com/' + path,
                                        headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.geturl() != 'https://shopkinto.com/' + path:
                return False, path + ': unexpected redirect'
            data = response.read()
        match = data == (ROOT / path).read_bytes()
        return match, f'{path}: {"MATCH" if match else "MISMATCH"} sha256={hashlib.sha256(data).hexdigest()}'
    except Exception as error:
        return False, f'{path}: ERROR {error}'

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=7) as executor:
        results = list(executor.map(check, PATHS))
    for _, message in results:
        print(message)
    raise SystemExit(0 if all(ok for ok, _ in results) else 1)
