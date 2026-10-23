#!/usr/bin/env bash
# SDK-only fallback for this dependency-free Java preview. Never publishes.
set -euo pipefail
: "${ANDROID_HOME:?Set ANDROID_HOME}"
: "${JAVA_HOME:?Set JAVA_HOME to JDK 17}"
: "${KINTO_PREVIEW_KEYSTORE:?Owner-controlled test keystore outside checkout}"
: "${KINTO_PREVIEW_PASSWORD_FILE:?Password file outside checkout}"
KINTO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KINTO_OUT="${KINTO_BUILD_OUTPUT:?Set an output directory outside the checkout}"
KINTO_TOOLS="$ANDROID_HOME/build-tools/35.0.0"
KINTO_JAR="$ANDROID_HOME/platforms/android-36/android.jar"
python3 - "$KINTO_ROOT" "$KINTO_OUT" "$KINTO_PREVIEW_KEYSTORE" "$KINTO_PREVIEW_PASSWORD_FILE" <<'PYGUARD'
from pathlib import Path
import sys
checkout=Path(sys.argv[1]).resolve().parents[1]
for raw in sys.argv[2:]:
 p=Path(raw).resolve()
 if p==checkout or checkout in p.parents:raise SystemExit('Build output and signing secrets must be outside checkout')
PYGUARD
mkdir -p "$KINTO_OUT/classes" "$KINTO_OUT/dex"
"$JAVA_HOME/bin/javac" -encoding UTF-8 -source 17 -target 17 -classpath "$KINTO_JAR" -d "$KINTO_OUT/classes" "$KINTO_ROOT"/android/app/src/main/java/com/kinto/trendyollab/*.java
python3 - "$KINTO_ROOT" "$KINTO_OUT" <<'PY'
from pathlib import Path
import sys,zipfile,xml.etree.ElementTree as E
root,out=map(Path,sys.argv[1:])
t=E.parse(root/'android/app/src/main/AndroidManifest.xml');m=t.getroot();m.set('package','com.kinto.preview.hybrid.v16')
a='{http://schemas.android.com/apk/res/android}'
for e in m.iter():
 if e.get(a+'name','').startswith('.'):e.set(a+'name','com.kinto.trendyollab'+e.get(a+'name'))
app=m.find('application');app.set(a+'debuggable','true')
m.set(a+'versionCode','16');m.set(a+'versionName','0.16-preview')
t.write(out/'AndroidManifest.xml',encoding='utf-8',xml_declaration=True)
with zipfile.ZipFile(out/'classes.jar','w') as z:
 for p in (out/'classes').rglob('*.class'):z.write(p,p.relative_to(out/'classes'))
PY
"$JAVA_HOME/bin/java" -cp "$KINTO_TOOLS/lib/d8.jar" com.android.tools.r8.D8 --lib "$KINTO_JAR" --min-api 28 --output "$KINTO_OUT/dex" "$KINTO_OUT/classes.jar"
"$KINTO_TOOLS/aapt2" compile --dir "$KINTO_ROOT/android/app/src/main/res" -o "$KINTO_OUT/resources.zip"
"$KINTO_TOOLS/aapt2" link -I "$KINTO_JAR" --manifest "$KINTO_OUT/AndroidManifest.xml" "$KINTO_OUT/resources.zip" --min-sdk-version 28 --target-sdk-version 36 -o "$KINTO_OUT/unsigned.apk"
python3 - "$KINTO_ROOT" "$KINTO_OUT" <<'PY'
from pathlib import Path
import sys,zipfile
root,out=map(Path,sys.argv[1:])
with zipfile.ZipFile(out/'unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
 z.write(out/'dex/classes.dex','classes.dex')
 for p in (root/'android/app/src/main/assets').rglob('*'):
  if p.is_file():z.write(p,'assets/'+str(p.relative_to(root/'android/app/src/main/assets')))
PY
# Bundle only the KINTO review module. Account/shop navigation stays online.
python3 - "$KINTO_ROOT" "$KINTO_OUT" <<'PYWORLD'
from pathlib import Path
import sys,zipfile
root,out=map(Path,sys.argv[1:]);repo=root.parents[1]
files=['css/kinto-world-workspace-v1.css','js/customer-session-v150.js','js/employee-session-v143.js','js/admin-session-v147.js','js/kinto-world-core-v1.js','js/kinto-world-workspace-v1.js','js/kinto-world-panels-v1.js','css/kinto-world-panels-v1.css']
with zipfile.ZipFile(out/'unsigned.apk','a',compression=zipfile.ZIP_DEFLATED) as z:
 html=(repo/'mobile/global-orders/customer-integrated-fixture.html').read_text().replace('<base href="../../">','<base href="./">')
 z.writestr('assets/world-review/index.html',html)
 for f in files:z.write(repo/f,'assets/world-review/'+f)
PYWORLD
"$KINTO_TOOLS/zipalign" -f 4 "$KINTO_OUT/unsigned.apk" "$KINTO_OUT/aligned.apk"
"$JAVA_HOME/bin/java" -jar "$KINTO_TOOLS/lib/apksigner.jar" sign --ks "$KINTO_PREVIEW_KEYSTORE" --ks-key-alias kinto-preview --ks-pass "file:$KINTO_PREVIEW_PASSWORD_FILE" --out "$KINTO_OUT/KINTO-Preview-0.16.apk" "$KINTO_OUT/aligned.apk"
"$JAVA_HOME/bin/java" -jar "$KINTO_TOOLS/lib/apksigner.jar" verify --verbose --print-certs "$KINTO_OUT/KINTO-Preview-0.16.apk"
"$KINTO_TOOLS/aapt2" dump badging "$KINTO_OUT/KINTO-Preview-0.16.apk"
