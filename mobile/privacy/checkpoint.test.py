"""Synthetic/offline only; optional disposable SQL contract export is not real evidence."""
import hashlib, importlib.util, json, os, pathlib, stat, sys, tempfile, unittest
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('checkpoint',pathlib.Path(__file__).with_name('checkpoint.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

def fixture():
    return {'format':'kinto-erasure-checkpoint-v1','source_project':m.PROJECT,'snapshot_at':'2026-10-25T17:00:00+00:00','database_snapshot':'100:120:105,110','counts':{g:1 for g in m.GROUPS},'ledgers':{g:[{'key_hash':str(i)*64,'erased_at':'2026-10-25T16:00:00+00:00'}]for i,g in enumerate(m.GROUPS,1)},'snapshot_coherent':True,'coverage_verified':False,'restore_authorized':False}

def envelope(data):
    text=json.dumps(data,ensure_ascii=False);digest=hashlib.sha256(text.encode()).hexdigest()
    return json.dumps({'payload_text':text,'sha256':digest}).encode(),digest

class Checkpoints(unittest.TestCase):
    def test_valid_roundtrip_private_file_and_no_overwrite(self):
        raw,digest=envelope(fixture())
        with tempfile.TemporaryDirectory()as tmp:
            dest=pathlib.Path(tmp)/'checkpoint.json';result=m.save_verified(raw,digest,dest)
            self.assertEqual(dest.read_bytes(),raw);self.assertEqual(stat.S_IMODE(dest.stat().st_mode),0o600)
            self.assertFalse(result['restore_authorized']);self.assertFalse(result['coverage_verified'])
            with self.assertRaises(FileExistsError):m.save_verified(raw,digest,dest)
            self.assertEqual(dest.read_bytes(),raw)
    def test_adjacent_digest_is_not_a_trusted_anchor(self):
        raw,digest=envelope(fixture());changed=fixture();changed['ledgers']['accounts']=[];changed['counts']['accounts']=0
        modified,new_digest=envelope(changed)
        self.assertNotEqual(new_digest,digest)
        with self.assertRaisesRegex(m.CheckpointError,'DIGEST_MISMATCH'):m.validate(modified,digest)
        with self.assertRaisesRegex(m.CheckpointError,'TRUSTED_DIGEST'):m.validate(raw,'')
    def test_truncated_corrupted_duplicate_json_rejected(self):
        raw,digest=envelope(fixture())
        for value in [raw[:50],b'{}',b'{"payload_text":"a","payload_text":"b","sha256":"'+b'a'*64+b'"}',raw.replace(b'payload_text',b'unknown_key',1)]:
            with self.subTest(value=value[:30]),self.assertRaises(m.CheckpointError):m.validate(value,digest)
    def test_missing_counts_source_permissions_and_private_fields_rejected_even_if_rehashed(self):
        edits=[lambda d:d['ledgers'].pop('chat_text'),lambda d:d['counts'].__setitem__('accounts',2),lambda d:d.__setitem__('source_project','different-project'),lambda d:d.__setitem__('restore_authorized',True),lambda d:d.__setitem__('coverage_verified',True),lambda d:d['ledgers']['accounts'][0].__setitem__('phone','TEST'),lambda d:d['ledgers']['accounts'][0].__setitem__('key_hash','invalid'),lambda d:d['counts'].__setitem__('accounts',True),lambda d:d.__setitem__('snapshot_at','2026-10-25T17:00:00'),lambda d:d['ledgers']['accounts'][0].__setitem__('erased_at','invalid')]
        for edit in edits:
            data=fixture();edit(data);raw,digest=envelope(data)
            with self.subTest(edit=edit),self.assertRaises(m.CheckpointError):m.validate(raw,digest)
    def test_empty_complete_snapshot_still_cannot_certify_freshness_or_restore(self):
        data=fixture();data['counts']={g:0 for g in m.GROUPS};data['ledgers']={g:[]for g in m.GROUPS}
        raw,digest=envelope(data);self.assertFalse(m.validate(raw,digest)['restore_authorized'])
    def test_validation_failure_creates_no_destination(self):
        with tempfile.TemporaryDirectory()as tmp:
            dest=pathlib.Path(tmp)/'invalid.json'
            with self.assertRaises(m.CheckpointError):m.save_verified(b'{}','0'*64,dest)
            self.assertFalse(dest.exists())
    def test_symlink_destination_never_overwrites_other_file(self):
        raw,digest=envelope(fixture())
        with tempfile.TemporaryDirectory()as tmp:
            original=pathlib.Path(tmp)/'original';original.write_text('PRESERVE');dest=pathlib.Path(tmp)/'link';dest.symlink_to(original)
            with self.assertRaises(FileExistsError):m.save_verified(raw,digest,dest)
            self.assertEqual(original.read_text(),'PRESERVE')
    def test_oversized_input_rejected_without_output(self):
        with self.assertRaisesRegex(m.CheckpointError,'TOO_LARGE'):m.validate(b' '*(m.MAX_BYTES+1),'0'*64)
    @unittest.skipUnless(os.environ.get('KINTO_DISPOSABLE_TEST')=='1','SQL export only in disposable CI')
    def test_actual_postgresql_payload_matches_offline_validator(self):
        raw=pathlib.Path('/tmp/kinto-erasure-checkpoint-fixture.json').read_bytes();digest=json.loads(raw)['sha256']
        data=m.validate(raw,digest);self.assertGreaterEqual(data['counts']['accounts'],1);self.assertGreaterEqual(data['counts']['review_media'],1);self.assertEqual(data['counts']['chat_text'],1)
        # Test-only self-read digest is contract coverage, not a trusted real operator anchor.
        with tempfile.TemporaryDirectory()as tmp:self.assertFalse(m.save_verified(raw,digest,pathlib.Path(tmp)/'synthetic.json')['restore_authorized'])

if __name__=='__main__':unittest.main()
