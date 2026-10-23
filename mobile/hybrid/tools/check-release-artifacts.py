"""Inspect the actual unsigned Gradle APK/AAB, not a source-text assertion."""
import zipfile,pathlib,xml.etree.ElementTree as E
root=pathlib.Path(__file__).resolve().parents[1]/'android/app/build/outputs'
for path in [root/'bundle/release/app-release.aab',root/'apk/release/app-release-unsigned.apk']:
 with zipfile.ZipFile(path) as z:
  names=z.namelist()
  assert not any('/fixture-' in n or n.endswith(('pricing-fixture.json','webview-regression.html')) or 'world-review/' in n for n in names),names
  assert not any(n.startswith('META-INF/') and n.endswith(('.RSA','.DSA','.EC')) for n in names),'Unexpected signing certificate'
  assert any(n.endswith('assets/product-reader.js') for n in names)
  assert any(n.endswith('assets/hepsiburada-reader.js') for n in names)
  assert not any(n.endswith('zara-reader.js') or n.endswith('.so') for n in names)
  if path.suffix=='.apk':
   import subprocess,os
   report=subprocess.check_output([os.environ['ANDROID_HOME']+'/build-tools/35.0.0/aapt2','dump','badging',str(path)],text=True)
   assert "name='com.kinto.preview.hybrid.v17'" in report,report
   assert "targetSdkVersion:'36'" in report,report
   assert 'application-debuggable' not in report,report
   assert "application-label:'KINTO'" in report,report
 print('PASS_UNSIGNED_CANDIDATE',path.name,'no fixture assets, native libraries, or signing certificate')
