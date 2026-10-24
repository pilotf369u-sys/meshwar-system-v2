"""Read-only inspection of compiled candidates; never changes runtime or signing."""
import hashlib,json,os,pathlib,subprocess,zipfile,re,xml.etree.ElementTree as E
root=pathlib.Path(__file__).resolve().parents[2]
out=root/'mobile/hybrid/android/app/build/outputs'
aapt=pathlib.Path(os.environ['ANDROID_HOME'])/'build-tools/35.0.0/aapt2'
report={'production_upload_ready':False,'checks':{},'artifacts':{}}
for kind,path in [('apk',out/'apk/release/app-release-unsigned.apk'),('aab',out/'bundle/release/app-release.aab')]:
 with zipfile.ZipFile(path) as z:
  names=z.namelist()
  assert not any(n.endswith(('.so','.jks','.keystore','.p12')) for n in names)
  assert not any('fixture-' in n or 'world-review/' in n or 'webview-regression' in n for n in names)
  report['artifacts'][kind]={'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'size':path.stat().st_size,'native_libraries':0,'fixture_assets':0}
text=subprocess.check_output([str(aapt),'dump','badging',str(out/'apk/release/app-release-unsigned.apk')],text=True)
permissions=[line.split("name='")[1].split("'")[0] for line in text.splitlines() if line.startswith('uses-permission:')]
assert permissions==['android.permission.INTERNET'],permissions
versions=dict(re.findall(r"(?m)^(minSdkVersion|sdkVersion|targetSdkVersion):'([0-9]+)'",text))
assert versions.get('targetSdkVersion')=='36' and versions.get('minSdkVersion',versions.get('sdkVersion'))=='28',text
assert 'application-debuggable' not in text
report['checks']={'compiled_permissions':permissions,'target_sdk':36,'min_sdk':28,'debuggable':False,'no_packaged_native_code':True,'six_store_assets_preserved':True}
# Frozen accepted28 asset digests avoid dependence on shallow checkout history.
for relative,digest in json.loads((root/'mobile/release/accepted28-assets.sha256.json').read_text()).items():
 assert hashlib.sha256((root/relative).read_bytes()).hexdigest()==digest,relative
with zipfile.ZipFile(out/'apk/release/app-release-unsigned.apk') as z:
 expected=json.loads((root/'mobile/release/accepted28-dex.sha256.json').read_text())
 actual={n:hashlib.sha256(z.read(n)).hexdigest() for n in z.namelist() if n.endswith('.dex')}
 report['checks']['dex_identical_to_delivered_accepted28']=expected==actual
 print('DEX_IDENTICAL_TO_ACCEPTED28',expected==actual)
manifest=E.parse(root/'mobile/hybrid/android/app/src/main/AndroidManifest.xml').getroot().find('application')
ns='{http://schemas.android.com/apk/res/android}'
assert manifest.get(ns+'allowBackup')=='false' and manifest.get(ns+'fullBackupContent')=='false'
rules=E.parse(root/'mobile/hybrid/android/app/src/main/res/xml/kinto_data_extraction_rules.xml').getroot()
domains={'root','file','database','sharedpref','external','device_root','device_file','device_database','device_sharedpref'}
for mode in ['cloud-backup','device-transfer']:
 assert {e.get('domain') for e in rules.find(mode).findall('exclude') if e.get('path')=='.'}==domains
compiled=subprocess.check_output([str(aapt),'dump','xmltree','--file','AndroidManifest.xml',str(out/'apk/release/app-release-unsigned.apk')],text=True)
assert 'dataExtractionRules' in compiled and 'fullBackupContent' in compiled
report['checks']['explicit_backup_and_transfer_exclusions']=True
report['notes']=['Pure Java app has no packaged native .so requiring ELF page realignment; system WebView is maintained outside this APK.','This inspection is not a Play pre-launch report or policy approval.','Final Console identity, signing, deletion fulfillment and declarations remain gates.']
dest=root/'mobile/release/evidence/package-audit.json';dest.parent.mkdir(exist_ok=True);dest.write_text(json.dumps(report,indent=2)+'\n')
print('PASS_COMPILED_PACKAGE: INTERNET only, target36/min28, not debuggable, no fixtures/secrets/native libraries; unsigned preview identity only')
