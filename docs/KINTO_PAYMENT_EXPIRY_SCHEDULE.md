# KINTO payment hold expiry

The database job runs once per minute and enqueues a request to a dedicated Edge Function. The job authenticates with a dedicated random 32-byte secret encoded as 64 lowercase hex characters. The Edge Function uses the existing platform-injected server credential to call the unchanged P4 expiry RPC. PostgreSQL still checks the real service-role JWT for the RPC. The cron job stores a function call, and Vault and Edge secrets are provisioned separately from the repository.

P4 expires unstarted holds and sends started, overdue attempts to reconciliation. A started attempt keeps its stock and campaign quota until its result is established through the existing audited reconciliation flow. The returned `expired_unstarted` count excludes transitions to reconciliation. The existing P5 cart status synchronization can continue to display pending while P4 has moved the hold to reconciliation.

## Install after separate approval

1. Confirm the P4 RPC and the applicable P5 synchronization and coupon triggers are deployed. Confirm `pg_cron`, `pg_net` and Supabase Vault are available, and that the migration owner can read Vault and schedule jobs. Confirm ordinary browser roles cannot read the pg_net request headers or Vault secrets.
2. Provision a random shared hook secret via the project's protected secret-management interfaces. Set `KINTO_PAYMENT_EXPIRY_SECRET` in Edge secrets and `kinto_payment_expiry_secret` in Vault. Set `kinto_payment_expiry_origin` in Vault to the same project's canonical HTTPS Supabase origin. Deploy only `kinto-payment-expiry`. The hook's dedicated credential authorizes only the fixed expiry RPC and fixed limit. The platform service-role JWT stays in Edge.
3. Apply the migration as the intended cron owner after the above is ready. Existing jobs are left in place. Confirm the next few runs with the read-only verification file. Check both cron dispatch and the correlated pg_net response. The cron job can finish successfully even if the RPC request fails.
4. Watch for a missing or failed response, or overdue pending attempts that persist for more than two scheduling intervals. Inspect the Edge Function logs for the RPC error code and the scheduler logs for dispatch failures. pg_net history is transient. The separate dispatch table stores request IDs for seven days and contains no request headers. A growing reconciliation count requires the existing audited review process.

## Rollback

Run the rollback file as the same owner to unschedule this one job. Account for requests already queued or in flight. Disable the new Edge endpoint or revoke its dedicated secret after the queue drains, then remove its dedicated Vault entries if appropriate. The rollback retains dispatch history and leaves prior attempt transitions, orders, prices and deductions in place. Reinstalling can reuse the retained dispatch history.

## Local checks

- Run `node --test tests/payment-expiry-scheduler.test.mjs` for HTTP handler authentication, upstream errors and safe responses.
- On disposable PostgreSQL with the P4/P5 migrations, seed an eligible campaign with enough stock and quota for two reservations and at least one already-paid fixture. Run `tests/sql/payment-expiry-scheduler.lifecycle.sql` with `psql -v ON_ERROR_STOP=1 -v customer_token=... -v campaign_id=... -v items=...`. The script rolls back its synthetic mutations. It checks unstarted expiry, pending-to-reconciliation, intact hold lines, and unchanged paid records, orders and product inventory during the sweep.
- The scheduler installation, enqueue correlation, verification and rollback can be exercised using disposable stand-ins for the cron, Vault and pg_net APIs. Native extension scheduling and the real Edge-to-PostgREST hop still need confirmation during the approved rollout.

## Read-only preflight and cadence

Run the separate preflight with the exact role intended to own the cron job. It inspects extension versions, effective grants, scheduler metadata and the count of the two Vault names. It does not output secret values or queue headers and does not invoke the hook. A role that sees no matching job may be subject to pg_cron job visibility limits. Confirm the inventory with a cron administrator before installing. Any browser SELECT grant on Vault plaintext or pg_net request headers is a blocker. Edge secret existence, the actual cron worker identity at runtime and a successful Edge/PostgREST round trip require separate verification.

The current proposal stays at one minute. Once per minute means 1,440 scheduled dispatches, HTTP requests and Edge invocations per day, versus 288 at five minutes, an 80% reduction in baseline invocations. These figures exclude retries and do not predict billed compute. With a healthy scheduler and negligible processing time, five minutes makes the batch run roughly 15–20 minutes after reservation instead of 15–16. The server's 15-minute success cutoff is unchanged. The additional delay applies to the recorded transition and monitoring, and to any cleanup tied to expiry, such as coupon holds. A started attempt continues to protect stock throughout both intervals and until reconciliation. A five-minute cadence is reasonable if the longer status lag and the lower unstarted sweep throughput (200 per run) are acceptable. If adopted, adjust monitoring windows as well.
