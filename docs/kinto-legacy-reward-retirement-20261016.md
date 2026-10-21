# Retire the unused legacy reward-discount API

Production catalog inspection found `apply_order_reward_discount(uuid,numeric,text,text)` executable by API roles. Its `p_actor_id` is caller-supplied and the shared actor helper checks an employee row rather than a session. The helper also does not reject a missing row reliably because SQL `NULL NOT IN (...)` is not true. No production execution or business-row mutation was attempted.

The deployed function's body and two helpers are captured in the fixture. Isolated synthetic tests show that the old API can deduct a fake customer's reward balance and mark a fake order without a session, even with no direct customer/order table privileges, using either an existing employee ID or null. This is a remaining entry point, independent of the previous customer table and reward-adjustment lockdowns.

Inventory found no literal caller in shipped HTML/JS and no other public/private database function definition referring to this legacy function. The current customer UI uses `customer_apply_coupon_v310`, while admin/employee panels use their session-backed V310 loyalty paths. The previously installed balance-adjustment session wrappers also remain unchanged. Retirement therefore requires no frontend migration or new wrapper. Database-function discovery was catalog-only; it cannot prove absence of external clients outside this repository or dynamic references assembled at runtime.

## Change and deployment

Run `sql/kinto-legacy-reward-discount-lockdown-v1.sql` after reviewing the PR and green checks. It only revokes direct function EXECUTE from PUBLIC/anon/authenticated and aborts if inherited effective rights remain. It does not change a function body, row, table privilege, current coupon API or order calculation. Owner execution remains possible.

```sql
select role,
 has_function_privilege(role,'public.apply_order_reward_discount(uuid,numeric,text,text)','EXECUTE') as legacy_execute
from (values ('anon'),('authenticated')) r(role);
```

Both results must be false. `sql/kinto-legacy-reward-discount-rollback-v1.sql` restores the previous effective execution access in an emergency and reopens the issue. Code backup: `backup/before-legacy-reward-retirement-20261016`. There is no frontend deployment prerequisite, since no active caller was found.

## Validation and remaining scope

The integration test executes the deployed legacy definition and helpers with synthetic rows under both API roles. It covers the baseline bypass, permission rejection after lockdown, unchanged balances and order marker after rejection, unchanged function body, owner compatibility, idempotence and rollback. It runs in PGlite and native PostgreSQL 17. Static inventory checks require current session-backed reward paths to remain present and prevent introducing a browser caller to the retired API. The existing ACL CI continues exercising the current session wrappers.

This closes only the unused legacy reward-discount entry point after applying SQL. Direct settlement table writes and order settlement markers still need their own scoped, atomic session operations; their active browser callsites were inventoried during this review. Other order/product authorization work remains separate. This is not a platform launch-readiness claim.
