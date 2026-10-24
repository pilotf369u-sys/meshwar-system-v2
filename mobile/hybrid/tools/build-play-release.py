"""Build only after console, policy and device evidence is supplied. Never uploads or creates keys."""
import argparse,json,os,pathlib,re,subprocess,hashlib,base64,sys
p=argparse.ArgumentParser();p.add_argument('--verified-config',required=True);args=p.parse_args()
root=pathlib.Path(__file__).resolve().parents[3]
c=json.loads(pathlib.Path(args.verified_config).read_text())
for flag in ['console_verified','signing_ownership_verified','account_deletion_verified','privacy_data_safety_verified','retailer_policy_reviewed','release_device_checks_passed']:
 if c.get(flag) is not True:sys.exit('NOT READY: '+flag)
app=c.get('application_id','');code=c.get('version_code');highest=c.get('highest_play_version_code')
if not re.fullmatch(r'[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}',app) or '.preview.' in app:sys.exit('Invalid production identity')
if type(code)is not int or type(highest)is not int or not 0<=highest<code<=2100000000:sys.exit('Version must exceed verified Play history')
paths={}
for name in ['KINTO_UPLOAD_KEYSTORE','KINTO_UPLOAD_STORE_PASSWORD_FILE','KINTO_UPLOAD_KEY_PASSWORD_FILE']:
 f=pathlib.Path(os.environ.get(name,'/missing')).resolve()
 if not f.is_file() or f==root or root in f.parents:sys.exit('Missing signing file outside checkout: '+name)
 paths[name]=f
alias=os.environ.get('KINTO_UPLOAD_KEY_ALIAS','')
if not alias:sys.exit('Missing key alias')
r=subprocess.run(['keytool','-exportcert','-rfc','-keystore',str(paths['KINTO_UPLOAD_KEYSTORE']),'-storepass:file',str(paths['KINTO_UPLOAD_STORE_PASSWORD_FILE']),'-alias',alias],capture_output=True,text=True)
if r.returncode:sys.exit('Cannot read verified upload certificate')
m=re.search(r'-----BEGIN CERTIFICATE-----([\s\S]+?)-----END CERTIFICATE-----',r.stdout)
if not m:sys.exit('Upload certificate missing')
digest=hashlib.sha256(base64.b64decode(m[1])).hexdigest()
expected=str(c.get('upload_certificate_sha256','')).replace(':','').lower()
if not re.fullmatch('[a-f0-9]{64}',expected) or digest!=expected:sys.exit('Upload certificate differs from verified Console input')
print('Verified production identity, version and upload certificate; no publication performed')
subprocess.run(['gradle','--no-daemon','-p',str(root/'mobile/hybrid/android'),'-PkintoProduction=true','-PkintoProductionApplicationId='+app,'-PkintoProductionVersionCode='+str(code),':app:bundleRelease'],check=True)
