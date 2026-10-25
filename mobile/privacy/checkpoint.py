"""Offline validation/saving of owner-only minimal erasure evidence. Never opens a DB.
The expected digest must come from a separately trusted operator record. An adjacent
hash is a corruption check, not a signature or proof of export freshness/completeness.
"""
import argparse, datetime, hashlib, hmac, json, os, pathlib, re, sys
MAX_BYTES = 8 * 1024 * 1024
GROUPS = ('accounts', 'review_media', 'chat_text')
PROJECT = 'hsmmbloouskqdnptiiad'

class CheckpointError(ValueError):
    pass

def strict_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise CheckpointError('DUPLICATE_JSON_KEY')
        result[key] = value
    return result

def parse(text):
    try:
        return json.loads(text, object_pairs_hook=strict_object,
                          parse_constant=lambda _: (_ for _ in ()).throw(CheckpointError('INVALID_JSON_CONSTANT')))
    except (json.JSONDecodeError, UnicodeError, RecursionError) as exc:
        raise CheckpointError('INVALID_CHECKPOINT_JSON') from exc

def exact_keys(value, keys):
    return isinstance(value, dict) and set(value) == set(keys)

def validate(raw, expected_sha256):
    if not isinstance(raw, bytes) or len(raw) > MAX_BYTES:
        raise CheckpointError('CHECKPOINT_TOO_LARGE')
    if not isinstance(expected_sha256, str) or not re.fullmatch('[0-9a-f]{64}', expected_sha256):
        raise CheckpointError('TRUSTED_DIGEST_REQUIRED')
    try:
        envelope = parse(raw.decode('utf-8'))
    except UnicodeError as exc:
        raise CheckpointError('INVALID_CHECKPOINT_ENCODING') from exc
    if not exact_keys(envelope, ('payload_text', 'sha256')) or not isinstance(envelope['payload_text'], str):
        raise CheckpointError('INVALID_CHECKPOINT_ENVELOPE')
    try:
        payload = envelope['payload_text'].encode('utf-8')
    except UnicodeError as exc:
        raise CheckpointError('INVALID_CHECKPOINT_ENCODING') from exc
    actual = hashlib.sha256(payload).hexdigest()
    if not isinstance(envelope['sha256'], str) or not re.fullmatch('[0-9a-f]{64}', envelope['sha256']) or not hmac.compare_digest(actual, expected_sha256) or not hmac.compare_digest(actual, envelope['sha256']):
        raise CheckpointError('CHECKPOINT_DIGEST_MISMATCH')
    data = parse(envelope['payload_text'])
    if not exact_keys(data, ('format', 'source_project', 'snapshot_at', 'database_snapshot', 'counts', 'ledgers', 'snapshot_coherent', 'coverage_verified', 'restore_authorized')):
        raise CheckpointError('INVALID_CHECKPOINT_FIELDS')
    if data['format'] != 'kinto-erasure-checkpoint-v1' or data['source_project'] != PROJECT:
        raise CheckpointError('WRONG_CHECKPOINT_SOURCE')
    if data['snapshot_coherent'] is not True or data['coverage_verified'] is not False or data['restore_authorized'] is not False:
        raise CheckpointError('CHECKPOINT_CANNOT_AUTHORIZE_RESTORE')
    if not isinstance(data['database_snapshot'], str) or not re.fullmatch(r'\d+:\d+:\d*(?:,\d+)*', data['database_snapshot']):
        raise CheckpointError('INVALID_DATABASE_SNAPSHOT')
    def timestamp(value):
        if not isinstance(value, str) or len(value) > 64:
            raise CheckpointError('INVALID_CHECKPOINT_TIMESTAMP')
        try:
            parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError as exc:
            raise CheckpointError('INVALID_CHECKPOINT_TIMESTAMP') from exc
        if parsed.tzinfo is None:
            raise CheckpointError('CHECKPOINT_TIMEZONE_REQUIRED')
    timestamp(data['snapshot_at'])
    if not exact_keys(data['counts'], GROUPS) or not exact_keys(data['ledgers'], GROUPS):
        raise CheckpointError('MISSING_CHECKPOINT_LEDGER')
    for group in GROUPS:
        count, rows = data['counts'][group], data['ledgers'][group]
        if type(count) is not int or not 0 <= count <= 10000 or not isinstance(rows, list) or len(rows) != count:
            raise CheckpointError('CHECKPOINT_COUNT_MISMATCH')
        for row in rows:
            if not exact_keys(row, ('key_hash', 'erased_at')) or not isinstance(row['key_hash'], str) or not re.fullmatch('[0-9a-f]{64}', row['key_hash']):
                raise CheckpointError('INVALID_CHECKPOINT_RECORD')
            timestamp(row['erased_at'])
    # No claim of freshness, legal retention, copy reconciliation or full restore safety.
    return data

def save_verified(raw, expected_sha256, destination):
    data = validate(raw, expected_sha256)
    target = pathlib.Path(destination)
    descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    return {'counts': data['counts'], 'sha256': expected_sha256,
            'coverage_verified': False, 'restore_authorized': False}

def main():
    parser = argparse.ArgumentParser(description='Validate a minimal checkpoint; never restore or delete customer data.')
    parser.add_argument('--input', required=True)
    parser.add_argument('--expected-sha256', required=True, help='Digest from a separately trusted operator record')
    parser.add_argument('--output', required=True, help='New protected file; existing files are never overwritten')
    args = parser.parse_args()
    # Bounded read: a large source never consumes unbounded memory or gets truncated silently.
    with open(args.input, 'rb') as source:
        raw = source.read(MAX_BYTES + 1)
    result = save_verified(raw, args.expected_sha256, args.output)
    print(json.dumps(result, sort_keys=True))

if __name__ == '__main__':
    try:
        main()
    except (CheckpointError, OSError, ValueError) as error:
        # Never echo source JSON, object keys, file contents or credentials.
        print('CHECKPOINT_NOT_SAVED: ' + (str(error) if isinstance(error, CheckpointError) else type(error).__name__), file=sys.stderr)
        sys.exit(1)
