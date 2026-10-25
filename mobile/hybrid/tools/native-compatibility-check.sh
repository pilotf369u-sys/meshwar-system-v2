#!/usr/bin/env bash
set -euo pipefail
if [ "${1:?API required}" = "29" ]; then
  python3 mobile/hybrid/tools/webview-update-smoke.py
else
  python3 mobile/hybrid/tools/launch-functional-smoke.py
  python3 mobile/hybrid/tools/webview-smoke.py
fi
