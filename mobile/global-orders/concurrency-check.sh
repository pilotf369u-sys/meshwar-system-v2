#!/usr/bin/env bash
set -euo pipefail
world_tmp="$(mktemp -d)"
trap 'rm -rf "$world_tmp"' EXIT
# The first transaction retains its idempotency lock while the second connection retries.
world_query="SELECT public.kinto_world_submit_v1('test-customer','00000000-0000-0000-0000-000000000099','{\"policy_accepted\":true,\"contact\":{\"name\":\"TEST customer\",\"phone\":\"00000000\",\"address\":\"TEST destination address\"},\"items\":[{\"url\":\"https://www.trendyol.com/test-p-123456\",\"title\":\"TEST concurrency\",\"price\":\"1000\",\"quantity\":1,\"options_confirmed\":true}]}')->>'id';"
psql -h localhost -U postgres -d kinto_world_test -v ON_ERROR_STOP=1 -Atqc "BEGIN; SET LOCAL ROLE anon; $world_query SELECT pg_sleep(2); COMMIT;" > "$world_tmp/first" &
world_pid=$!
psql -h localhost -U postgres -d kinto_world_test -v ON_ERROR_STOP=1 -Atqc "SET ROLE anon; $world_query" > "$world_tmp/second"
wait "$world_pid"
python3 - "$world_tmp" <<'PY'
from pathlib import Path
import sys,uuid
p=Path(sys.argv[1]);a=p.joinpath('first').read_text().strip();b=p.joinpath('second').read_text().strip()
assert a==b and str(uuid.UUID(a))==a,(a,b)
print('PASS two concurrent submissions return the same request identity')
PY
