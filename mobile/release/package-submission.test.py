"""Check the review ZIP allowlist and completeness without signing or any network."""
import hashlib,json,pathlib,subprocess,tempfile,unittest,zipfile
from PIL import Image
root=pathlib.Path(__file__).resolve().parents[2]
class ReviewPackage(unittest.TestCase):
 def test_review_sources_and_explicit_assets_only(self):
  with tempfile.TemporaryDirectory()as tmp:
   folder=pathlib.Path(tmp);assets=folder/'assets';assets.mkdir()
   for name,size in [('KINTO-Play-Icon-512.png',(512,512)),('KINTO-Feature-Graphic-1024x500.png',(1024,500))]:
    Image.new('RGB',size,'#0a2f23').save(assets/name)
   # Deliberately unapproved media/file must never leak through a directory glob.
   Image.new('RGB',(10,10)).save(assets/'private-photo.png')
   (assets/'password.txt').write_text('SYNTHETIC_NOT_A_SECRET')
   out=folder/'review.zip'
   subprocess.run(['python3',str(root/'mobile/release/package-submission.py'),'--assets',str(assets),'--output',str(out)],check=True,capture_output=True,text=True)
   with zipfile.ZipFile(out)as z:
    names=set(z.namelist());manifest=json.loads(z.read('CONTENTS.json'))
    self.assertFalse(manifest['production_upload_ready'])
    self.assertEqual(set(manifest['paths']),names-{'CONTENTS.json','SHA256SUMS.txt'})
    self.assertEqual({x for x in names if x.startswith('store-assets/')},{'store-assets/KINTO-Play-Icon-512.png','store-assets/KINTO-Feature-Graphic-1024x500.png'})
    self.assertIn('review-source-NOT-DEPLOY/sql/kinto-privacy-controls-v1.sql',names)
    self.assertIn('review-source-NOT-DEPLOY/sql/kinto-privacy-inventory-readonly-v1.sql',names)
    self.assertIn('evidence/VALIDATION-20261025.json',names)
    self.assertIn('review-source-NOT-DEPLOY/sql/kinto-privacy-dependencies-readonly-v1.sql',names)
    evidence=json.loads(z.read('review-source-NOT-DEPLOY/mobile/privacy/OWNER-DEPENDENCIES-20261025.json'))
    self.assertEqual(evidence['transaction_read_only'],'on')
    self.assertEqual(len(evidence['foreign_keys']),evidence['foreign_key_count'])
    self.assertEqual(len(evidence['triggers']),evidence['scoped_trigger_count'])
    self.assertFalse(any('function_definition' in t for t in evidence['triggers']))
    self.assertTrue(all(len(t['function_definition_sha256'])==64 for t in evidence['triggers']))
    self.assertIn('guide/PLAY-POLICY-RECHECK-20261025.md',names)
    self.assertFalse(any(x.endswith(('.apk','.aab','.jks','.keystore','.py'))for x in names))
    self.assertFalse(any('browser-fixture'in x or 'test-server'in x or 'password'in x for x in names))
    for line in z.read('SHA256SUMS.txt').decode().splitlines():
     digest,name=line.split('  ',1);self.assertEqual(hashlib.sha256(z.read(name)).hexdigest(),digest,name)
if __name__=='__main__':unittest.main()
