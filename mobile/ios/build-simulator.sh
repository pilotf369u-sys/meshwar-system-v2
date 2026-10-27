#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${RUNNER_TEMP:-/tmp}/KintoPreview.app"
SDK="$(xcrun --sdk iphonesimulator --show-sdk-path)"
mkdir -p "$OUT"
cp "$ROOT/mobile/ios/Preview-Info.plist" "$OUT/Info.plist"
cp "$ROOT"/mobile/ios/Resources/*-reader.js "$OUT/"
cp "$ROOT"/mobile/ios/Resources/fixture-*.html "$OUT/"
xcrun swiftc -parse-as-library -sdk "$SDK" -target arm64-apple-ios15.0-simulator \
  "$ROOT/mobile/ios/Sources/KintoURLPolicy.swift" "$ROOT/mobile/ios/Sources/InvoiceDocumentController.swift" "$ROOT/mobile/ios/Sources/IsolationTestController.swift" "$ROOT/mobile/ios/Sources/ReaderTestController.swift" "$ROOT/mobile/ios/Sources/KintoPreview.swift" \
  -o "$OUT/KintoPreview"
codesign --force --sign - "$OUT"
echo "$OUT"
