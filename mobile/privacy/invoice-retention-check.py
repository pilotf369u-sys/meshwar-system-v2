"""Actual migration + synthetic fixture, in a rolled-back disposable PostgreSQL transaction."""
import os,pathlib,subprocess
if os.environ.get('KINTO_DISPOSABLE_TEST')!='1' or os.environ.get('PGHOST')!='127.0.0.1' or os.environ.get('PGDATABASE')!='kinto_privacy_test':raise SystemExit('DISPOSABLE_DATABASE_REQUIRED')
s=pathlib.Path('sql/kinto-privacy-invoice-retention-v1.sql').read_text()
assert s.count('\nBEGIN;\n')==1 and s.rstrip().endswith('COMMIT;')
s=s.replace('\nBEGIN;\n','\n',1).rstrip()[:-len('COMMIT;')]
visibility=pathlib.Path('sql/kinto-order-privacy-session-v1.sql').read_text()
a=visibility.index('CREATE OR REPLACE FUNCTION private.kinto_order_visible_v1(');b=visibility.index('REVOKE ALL ON FUNCTION',a)
checks=visibility[a:b]+'\n'+pathlib.Path('mobile/privacy/invoice-retention-check.sql').read_text()
rollback=pathlib.Path('sql/kinto-privacy-invoice-retention-v1-rollback.sql').read_text().replace('\nBEGIN;\n','\n',1).rstrip()[:-len('COMMIT;')]
checks+='\n'+rollback+"\nSELECT public.test_assert(NOT has_function_privilege('anon','public.kinto_privacy_invoice_read_v1(text,text,uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','public.kinto_privacy_invoice_preserve_v1(text,uuid,uuid)','EXECUTE'),'rollback revokes entry points');SELECT public.test_assert((SELECT count(*)FROM private.kinto_privacy_invoice_identity_v1)=1,'rollback retains necessary reviewed identity');"
r=subprocess.run(['psql','-X','-v','ON_ERROR_STOP=1'],input='BEGIN;\n'+s+'\n'+checks+'\nROLLBACK;\n',text=True,capture_output=True,timeout=30)
if r.returncode:raise SystemExit(r.stdout+r.stderr)
print(r.stdout)
