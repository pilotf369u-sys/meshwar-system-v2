#!/bin/bash
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/mobile/hybrid/android/app/src/main/assets"
cp "$root"/mobile/ios/Resources/*.js "$tmp/mobile/hybrid/android/app/src/main/assets/"
cd "$tmp"
node --test "$root"/mobile/ios/ReaderTests/*.test.cjs
