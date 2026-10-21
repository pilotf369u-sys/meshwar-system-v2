# Session-bound customer directory

## Problem and scope

The previous profile stage closed direct UPDATE/DELETE. Production metadata still showed unrestricted direct SELECT/INSERT on `public.customers`, including its password column. This stage removes the remaining direct customer table API access after migrating every literal shipped read and the manifest's embedded customer join. No production customer records or session tokens were read or changed during preparation.

Registration is a WhatsApp request to support (`kinto-registration-country-phone-v163.js`), followed by the existing session-verified `admin_save_account_v300` account creation. The old standalone `register.html` is a mock OTP form without a database insert. No browser customer INSERT caller was found.

## Server boundary

`kinto_customer_directory_session_v1` verifies the supplied role's existing session on every call. Customer IDs, store IDs, branch IDs and courier IDs are derived server-side. The public RPC accepts filters/search/order/pagination, never an actor ID. SQL field names and operators are allowlisted, and values are quoted as literals. The response includes scoped rows and a scoped pre-pagination count.

| Role | Rows | Fields |
| --- | --- | --- |
| Customer | Own account only | Own profile/cart/reward fields; no password |
| Admin | Customer directory | Existing account/profile/reward fields; no password |
| Employee | Operational customer directory, denied when both customer and order permissions are explicitly false | Contact/profile fields and email; no wallet/cart/log fields |
| Vendor | Customers linked to own order segments, legacy order store/items, or own loyalty wallets/coupons | Delivery/contact fields; no email/wallet/cart/log fields |
| Branch | Customers of orders assigned to that branch | Delivery/contact fields |
| Courier | Customers of assigned orders, matching current courier identity aliases and branch | Delivery/contact fields |

The explicit safe field list prevents password/hash/opaque payload exposure even when a caller requests `*`. Existing `private.kinto_staff_actor_v1` verifies current staff role and enabled state. Vendor validation uses the deployed private vendor session validator and active-store check. Customer validation uses the deployed customer session validator.

## Frontend migration

The shared adapter reads only the role configured by the host page; stored sessions from unrelated accounts never choose the role. Manifest route role selection matches the existing staff helper. Delegated customer dashboard invoice reads retain the existing short-lived admin/employee viewing token. Missing/expired/logged-out sessions fail without table fallback.

Migrated paths include admin customer list/search/order enrichment/notices, employee directory/chat/order details, branch orders and manifest, courier orders, vendor rewards, public headers, order page, cart customer loading, legacy store cards, and shared invoice hydration. All twelve hosts load the helper before their controllers, including the vendor iframe. Changed shared assets have fresh query versions. The manifest fetches orders then session-scoped contacts, instead of an embedded raw customer table join. Invoice hydration may retry after a failed lookup.

## Deployment and verification

1. Run `sql/kinto-customer-directory-session-v1.sql` first. It adds the read RPC without revoking existing access.
2. Merge/deploy the PR after CI. Verify the published helper and changed assets have reached the live site.
3. Run `sql/kinto-customer-directory-lockdown-v1.sql`. It revokes all direct customer table privileges and column privileges from PUBLIC/anon/authenticated, including unused DDL-related table privileges; it aborts if inherited effective rights remain. This preserves the previous UPDATE/DELETE denial. No policy or customer record changes occur.

```sql
select r.role,
 has_table_privilege(r.role,'public.customers','SELECT') as direct_select,
 has_any_column_privilege(r.role,'public.customers','SELECT') as column_select,
 has_table_privilege(r.role,'public.customers','INSERT') as direct_insert,
 has_any_column_privilege(r.role,'public.customers','INSERT') as column_insert,
 has_table_privilege(r.role,'public.customers','UPDATE') as direct_update,
 has_table_privilege(r.role,'public.customers','DELETE') as direct_delete,
 has_function_privilege(r.role,'public.kinto_customer_directory_session_v1(text,text,jsonb,text,text,boolean,integer,integer)','EXECUTE') as directory_rpc
from (values ('anon'),('authenticated')) r(role);
```

Expected: all direct/column flags false, directory RPC true. Emergency `sql/kinto-customer-directory-rollback-v1.sql` restores SELECT/INSERT needed by the previous frontend and reopens that risk; it does not restore UPDATE/DELETE or unused DDL-related privileges. Code backup: `backup/before-customer-directory-20261016`.

## Validation and limits

The isolated integration test runs the deployed customer login/session and staff account definitions, real customer and four staff logins, current vendor session validation, role and customer/store/branch/courier isolation, legacy vendor links, search/pagination/counts, injection rejection, secret-field omission, effective table and column ACL denial, own identity/profile access and admin account create/delete after revocation, idempotence and rollback. It also executes the actual cart and shared invoice contact-loading functions through the actual adapter against the isolated database. The vendor positive session is seeded in the isolated session table; this is not a live vendor login certification. The customer login positive case uses the deployed legacy password branch.

Client tests cover role selection, delegated views, missing/logout/expired handling, REST transport and shipped callsite inventory. Two browser page tests deny raw customer access while exercising the admin list/search and branch manifest. Existing fresh vendor login/category behavior is checked too. Catalog-only dependency inspection found no public customer-dependent views, no RLS policy expressions referring to customers, and no anon-executable SECURITY INVOKER function referring to customers. None of this is a production transaction test.

This closes the direct `customers` table route after deployment. It does not certify platform-wide privacy or authorization: other tables and existing RPCs can contain order/customer snapshots and have their own boundaries. Previously identified financial/order access work remains separate. Existing sales, login, order/payment state, inventory and invoice calculations are not changed.
