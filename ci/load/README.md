# Isolated KINTO concurrency benchmark

This harness never connects to production. Native mode accepts only a loopback URL with database name `kinto_load`; the workflow creates an empty PostgreSQL 17 service limited to 2 CPUs and 1 GiB RAM. The test snapshot contains deployed schema/function/ACL metadata and three non-secret configuration tables, no customer/order/session/business rows or privileged keys.

Bootstrap recreates 110 public/private tables, 338 functions, 47 triggers and 79 RLS policies, plus constraints/indexes/views/grants. Before measuring, the existing six-role rollback workflow must pass. The Auth schema stub exists only to satisfy unused foreign keys/policies; custom KINTO sessions used by the measured operations are backed by the actual hashed-session routines. External pg_net/cron/vault services, Storage file delivery, JWT Auth and payments are not simulated.

Virtual users issue concurrent bursts through a **32-connection pool**: browse products, create canonical orders, employee review, customer acceptance, payment/stock processing. Stages: 10, 25, 50, 100, 200, 400, 800 and 1000 virtual users. Timings include pool waiting and database transaction overhead. This is not a sustained soak or a measurement of 1000 database connections.

Separate 200-way integrity races verify:

- Only 7 of 200 purchases can pay for 7 remaining pieces; stock ends at zero.
- Only 3 of 200 pending campaign orders consume the final 3 allocations; both paid-product and gift stock change exactly 3 times.
- 200 attempts to use the same coupon create one redemption/ledger event.
- 200 retries of the same campaign request produce one canonical order/reservation.

Business denials in these scarcity/replay tests are expected and separately classified. Normal workload errors or p95 above 10 seconds stop the escalation. All transaction statements have a 10-second timeout, lock waits 5 seconds, pool acquisition 10 seconds, and the CI job 20 minutes. Unexpected failures and integrity assertions fail the run and retain its report.

Run on a disposable native PostgreSQL 17 database:

```
KINTO_LOAD_DATABASE_URL=postgresql://postgres:isolated@127.0.0.1:5432/kinto_load KINTO_PG_MODULE=/path/to/pg/lib/index.js node ci/load/run.mjs
```

`--smoke` uses PGlite and a single serialized connection solely to validate the harness. Its timings must never be used as capacity evidence.

The report is `test-results/load-report.json` and is uploaded by `kinto-isolated-load.yml`. Results do **not** establish the maximum capacity of the current Supabase Free project, its API pool, network, Edge functions or GitHub Pages. Those require a separately bounded hosted-environment test. A test that reaches its configured cap reports “highest tested”, not “maximum possible”. No application or production schema changes are included in this PR.
