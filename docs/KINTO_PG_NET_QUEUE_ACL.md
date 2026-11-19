# KINTO pg_net request queue ACL

This change applies only to `net.http_request_queue`. It removes direct table/column grants to PUBLIC, anon and authenticated, then verifies that those customer roles have no effective queue access through inherited roles. It preserves the reviewed server senders' insert and ID-return privileges, readers' existing SELECT, and the worker's existing SELECT and DELETE. The net schema, extension functions, sequence, response table, cron jobs and application functions remain intact.

## Approval and production evidence

The live pg_net version, G13 job owner, background worker and complete list of senders/readers were unavailable to the author. Do not run the migration until the production preflight and an administrator-visible actor inventory have been reviewed.

1. Run the read-only preflight as an authorized administrator. Record the exact extension version, worker database and session role, G13 job owner, queue/column grants, RLS and the caller context of all net APIs. Confirm the job is visible from the migration role. The query reveals job metadata only and omits job commands and queue contents.
2. Trace G13 and each other HTTP producer through direct calls or wrappers. For invoker calls, include the caller. For definer calls, include the execution role at the queue write. Record any trusted sender requiring queue reads beyond ID as a reader too. Confirm no other client/API roles can act as these roles or access the queue through exposed wrappers. Review response-table and log access separately if responses can contain secrets.
3. On one approved migration connection set `kinto.pg_net_queue_acl_manifest` to the reviewed JSON object. Example shape only:

   ```json
   {
     "version": "<actual version>",
     "g13_owner": "<actual cron owner>",
     "g13_sender": "<reviewed role effective at enqueue>",
     "worker": "<actual worker role>",
     "senders": ["<G13 enqueue role>", "<other approved sender>"],
     "readers": [],
     "inventory_reviewed": true
   }
   ```

   Do not use the placeholders. The migration checks the version, observed worker session and visible G13 owner against the manifest, and fails on missing privileges or residual customer access. It takes a NOWAIT lock on the queue, so retry in an approved quiet window rather than waiting behind an active worker. Capture the staging/production ACLs before any extension upgrade, and recheck them after upgrades.
4. After approved deployment, repeat the catalog check and confirm the normal G13 run still enqueues and receives the expected HTTP result. Check other existing senders and the background worker the same way. Keep PR #1154 activation separate until these checks pass.

## Rollback

The migration privately records original table/column ACLs and the effective table privileges of the reviewed server roles. The rollback file is a targeted recovery operation. Set `kinto.pg_net_queue_acl_restore` to a reviewed JSON object such as `{"role":"<reviewed role>","privilege":"SELECT"}` on the same connection. The requested grant must have been effective for that role before migration and the role must stay unreachable by customers. Public and client grants are never recreated. A full ACL restoration would require a separate approved plan after stopping secret-bearing producers and draining the queue. Grant recovery does not change queued requests or cron configuration.

## Isolated regression

Use a fresh disposable PostgreSQL container with native pg_net preloaded for database `postgres`, and local roles `anon` and `authenticated`. Provide a loopback HTTP fixture reachable from that container, returning 200 only when the synthetic POST body and header match. Run:

```sh
KINTO_ACL_TEST_ALLOW_WRITES=YES_DISPOSABLE_ONLY \
KINTO_ACL_TEST_CONTAINER=<disposable-container> \
KINTO_ACL_TEST_HTTP_URL=http://127.0.0.1:<port>/synthetic \
bash tests/sql/pg-net-queue-acl.local.sh
```

The script creates a synthetic G13 owner and cron metadata, checks the denied client statements, sends a real request through the extension worker, and checks targeted recovery. It is destructive to the disposable fixture and uses no live KINTO settings or secrets.
