"""Actual pg_dump/pg_restore on a disposable CI clone; NEVER deploy/run on owner backups.
Only synthetic fixture rows are involved. No Storage API or production project access.
"""
import hashlib, importlib.util, json, os, pathlib, re, subprocess, sys
sys.dont_write_bytecode = True
SOURCE = 'kinto_privacy_test'
CLONE = 'kinto_privacy_restore_test'
CUSTOMER = '00000000-0000-4000-8000-000000000090'
TOKEN = 'test-TEST-RESTORE'
ROOT = pathlib.Path(__file__).resolve().parent

def main():
    if (os.environ.get('KINTO_DISPOSABLE_TEST') != '1' or
        os.environ.get('PGHOST') != '127.0.0.1' or os.environ.get('PGDATABASE') != SOURCE):
        raise SystemExit('DISPOSABLE_DATABASE_REQUIRED')
    container = os.environ.get('KINTO_PRIVACY_POSTGRES_CONTAINER', '')
    if not re.fullmatch(r'[a-f0-9]{12,64}', container):
        raise SystemExit('DISPOSABLE_POSTGRES_CONTAINER_REQUIRED')
    def command(args, data=None):
        result = subprocess.run(['docker','exec'] + (['-i'] if data is not None else []) + [container] + args,
                                input=data, capture_output=True, timeout=60)
        if result.returncode:
            raise RuntimeError('ISOLATED_RESTORE_COMMAND_FAILED: ' + result.stderr.decode(errors='replace')[:300])
        return result.stdout
    def sql(database, statement):
        if database not in (SOURCE, CLONE, 'postgres'):
            raise ValueError('FIXED_DISPOSABLE_DATABASE_REQUIRED')
        return command(['psql','-X','-q','-A','-t','-U','postgres','-d',database,
                        '-v','ON_ERROR_STOP=1','-c',statement]).decode().strip()
    if sql('postgres', "SELECT current_setting('server_version_num')::int/10000") != '17':
        raise RuntimeError('POSTGRES17_REQUIRED')
    # Never drop/reuse a preexisting database, even with the expected test-only name.
    if sql('postgres', "SELECT count(*)FROM pg_database WHERE datname='"+CLONE+"'") != '0':
        raise RuntimeError('RESTORE_CLONE_ALREADY_EXISTS')
    if sql(SOURCE, "SELECT count(*)FROM public.customers WHERE id='"+CUSTOMER+"'") != '0':
        raise RuntimeError('RESTORE_FIXTURE_ID_ALREADY_EXISTS')
    sql(SOURCE, "INSERT INTO public.customers(id,name,phone,email,code,password)VALUES('"+CUSTOMER+"','TEST RESTORE','00090','restore@example.invalid','TEST-RESTORE','TEST-PASSWORD');"
        "INSERT INTO public.customer_review_sessions(customer_id,token_hash,expires_at)VALUES('"+CUSTOMER+"',digest('"+TOKEN+"','sha256'),now()+interval '1 hour');"
        "SELECT public.kinto_deletion_request_v1('"+TOKEN+"','request',true)")
    request = sql(SOURCE, "SELECT id FROM private.kinto_deletion_requests_v1 WHERE customer_id='"+CUSTOMER+"'AND status='pending'")
    if not re.fullmatch('[0-9a-f-]{36}',request):
        raise RuntimeError('INVALID_SYNTHETIC_REQUEST')
    sql(SOURCE, "SELECT public.kinto_privacy_admin_v1('test-admin','deletions','"+request+"','verify','TEST disposable backup review')")
    # Snapshot BEFORE erasure, including the old request/sessions/ledger state.
    dump = command(['pg_dump','-U','postgres','--format=custom','--no-owner','-d',SOURCE])
    if not dump.startswith(b'PGDMP') or len(dump)>20*1024*1024:
        raise RuntimeError('INVALID_OR_OVERSIZED_SYNTHETIC_DUMP')
    sql(SOURCE,"UPDATE private.kinto_erasure_policy_v1 SET enabled=true,inventory_signature=private.kinto_erasure_signature_v1();"
        "SELECT public.kinto_deletion_execute_v1('test-admin','"+request+"','"+request+"')")
    if sql(SOURCE,"SELECT count(*)FROM public.customers WHERE id='"+CUSTOMER+"'") != '0':
        raise RuntimeError('SOURCE_FIXTURE_ERASURE_FAILED')
    checkpoint = sql(SOURCE, 'SELECT private.kinto_privacy_checkpoint_v1()').encode()
    # Test-only digest captured separately from the later restored DB. This models
    # external preservation, not real owner copy permissions/freshness verification.
    trusted_test_digest = json.loads(checkpoint)['sha256']
    spec=importlib.util.spec_from_file_location('checkpoint',ROOT/'checkpoint.py')
    validator=importlib.util.module_from_spec(spec);spec.loader.exec_module(validator)
    verified=validator.validate(checkpoint,trusted_test_digest)
    customer_hash = hashlib.sha256(CUSTOMER.encode()).hexdigest()
    hashes = [item['key_hash']for item in verified['ledgers']['accounts']]
    if customer_hash not in hashes:
        raise RuntimeError('EXTERNAL_CHECKPOINT_MISSING_LATEST_ERASURE')
    created=False
    try:
        sql('postgres','CREATE DATABASE '+CLONE)
        created=True
        command(['pg_restore','-U','postgres','--exit-on-error','--no-owner','-d',CLONE],dump)
        if sql(CLONE,"SELECT count(*)FROM public.customers WHERE id='"+CUSTOMER+"'") != '1':
            raise RuntimeError('ACTUAL_BACKUP_DID_NOT_RESTORE_FIXTURE')
        if sql(CLONE,"SELECT count(*)FROM private.kinto_erasure_ledger_v1 WHERE request_id='"+request+"'") != '0':
            raise RuntimeError('BACKUP_UNEXPECTEDLY_HAS_FUTURE_ERASURE')
        external_json=json.dumps(hashes).replace("'","''")
        matches=json.loads(sql(CLONE,"SELECT private.kinto_privacy_restore_matches_v1('"+external_json+"'::jsonb)"))
        if customer_hash not in matches['matched_hashes']or matches['restore_authorized']is not False:
            raise RuntimeError('RESTORE_GATE_FAILED')
        if sql(CLONE,"SELECT count(*)FROM public.customers WHERE id='"+CUSTOMER+"'") != '1':
            raise RuntimeError('DETECTION_MUST_NOT_ERASE_AUTOMATICALLY')
        preserved_sql="SELECT jsonb_build_object('orders',(SELECT jsonb_agg(to_jsonb(x)ORDER BY id)FROM public.orders x),'other_customers',(SELECT jsonb_agg(to_jsonb(x)ORDER BY id)FROM public.customers x WHERE id<>'"+CUSTOMER+"'))"
        before=json.loads(sql(CLONE,preserved_sql))
        # Fixture-only explicit reconciliation using the existing gated fresh-profile
        # executor. This is NOT a generic restore replayer or transactional eraser.
        sql(CLONE,"UPDATE private.kinto_erasure_policy_v1 SET enabled=true,inventory_signature=private.kinto_erasure_signature_v1();"
            "SELECT public.kinto_deletion_execute_v1('test-admin','"+request+"','"+request+"')")
        if sql(CLONE,"SELECT count(*)FROM public.customers WHERE id='"+CUSTOMER+"'") != '0':
            raise RuntimeError('RESTORED_FIXTURE_RECONCILIATION_FAILED')
        if sql(CLONE,"SELECT count(*)FROM public.customer_review_sessions WHERE customer_id='"+CUSTOMER+"'") != '0':
            raise RuntimeError('RESTORED_SESSION_SURVIVED')
        if before != json.loads(sql(CLONE,preserved_sql)):
            raise RuntimeError('RESTORE_RECONCILIATION_CHANGED_OTHER_BUSINESS_DATA')
        after=json.loads(sql(CLONE,"SELECT private.kinto_privacy_restore_matches_v1('"+external_json+"'::jsonb)"))
        if customer_hash in after['matched_hashes']or after['restore_authorized']is not False:
            raise RuntimeError('FALSE_RESTORE_AUTHORIZATION_OR_RESURRECTED_PROFILE')
    finally:
        if created:
            sql('postgres','DROP DATABASE '+CLONE+' WITH(FORCE)')
    print('PASS_ACTUAL_SYNTHETIC_BACKUP_RESTORE: pg_dump/pg_restore resurrects pre-erasure profile/session and loses later DB ledger; separately preserved checkpoint detects it; explicit fresh-fixture reconciliation erases it, preserves other customers/orders and never authorizes production restore; clone removed')

if __name__=='__main__':
    main()
