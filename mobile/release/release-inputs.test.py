"""Negative production-build gates; no keys, builds, network or publication."""
import json,pathlib,subprocess,tempfile,unittest,os
root=pathlib.Path(__file__).resolve().parents[2];script=root/'mobile/hybrid/tools/build-play-release.py'
class Gates(unittest.TestCase):
 def reject(self,patch,message):
  c=json.loads((root/'mobile/release/play-verified-config.example.json').read_text());c.update(patch)
  with tempfile.TemporaryDirectory()as d:
   p=pathlib.Path(d,'verified.json');p.write_text(json.dumps(c));env=os.environ.copy()
   for key in ['KINTO_UPLOAD_KEYSTORE','KINTO_UPLOAD_STORE_PASSWORD_FILE','KINTO_UPLOAD_KEY_PASSWORD_FILE']:env.pop(key,None)
   r=subprocess.run(['python3',str(script),'--verified-config',str(p)],capture_output=True,text=True,env=env)
  self.assertNotEqual(r.returncode,0);self.assertIn(message,r.stderr+r.stdout)
 def valid_flags(self):return dict.fromkeys(['console_verified','signing_ownership_verified','account_deletion_verified','privacy_data_safety_verified','retailer_policy_reviewed','release_device_checks_passed','ugc_controls_verified'],True)
 def test_unverified_console(self):self.reject({},'console_verified')
 def test_policy_not_assumed(self):self.reject({'console_verified':True,'signing_ownership_verified':True},'account_deletion_verified')
 def test_preview_cannot_be_production(self):self.reject(dict(self.valid_flags(),application_id='com.kinto.preview.hybrid.v27'),'Invalid production identity')
 def test_version_must_exceed_history(self):self.reject(dict(self.valid_flags(),application_id='com.kinto.app',version_code=5,highest_play_version_code=5),'Version must exceed')
 def test_ugc_cannot_be_skipped(self):
  flags=self.valid_flags();flags['ugc_controls_verified']=False;self.reject(flags,'ugc_controls_verified')
 def test_no_implicit_signing_key(self):self.reject(dict(self.valid_flags(),application_id='com.kinto.app',version_code=6,highest_play_version_code=5),'Missing signing file outside checkout')
if __name__=='__main__':unittest.main()
