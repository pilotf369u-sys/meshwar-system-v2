# G1 SQL review / owner handoff — NOT an execution instruction yet

PR #707 contains only additive `kinto_deals_v1_*` objects. No existing checkout, orders, invoices, product stock, campaign v411 or authentication function is replaced. New objects are closed to browser roles (RLS on, no permissive policies, revoked table grants), and the feature flag defaults OFF.

## Before running anything
Run `docs/KINTO_DEALS_G1_PREFLIGHT_READONLY.sql` in Supabase SQL Editor and share its result. Required existing columns are `uuid` for local_stores.id, local_products.id, local_products.store_id, customers.id and orders.id. If any differ, STOP: revise the proposed migration; do not cast production identifiers or change existing tables.

## SQL proposal
`supabase/migrations/20261002_kinto_deals_v1_g1_isolated_off.sql` is **not to be applied** until the live preflight is reviewed and PR checks pass. It creates 5 tables: feature flags, campaigns, participating products, merchant-to-admin review submissions and reserved redemptions. No RPC to activate/submit/redeem, and no triggers on legacy tables.

## Security invariants
- Same-store gift and eligible SKU enforcement.
- Campaign owning store cannot be changed.
- Submission and redemption store must match campaign store.
- Reserved redemption must match order's actual customer; gift must belong to campaign store.
- No direct anon/authenticated table grants or permissive RLS policies.
- Existing admin-funded `kinto_campaigns` and `orders.kinto_campaign_*` remain untouched.

## Post-approval verification (later, not now)
As SQL editor owner: flag must read false, exactly five DEALS tables must exist, all five must have RLS true, no browser grants/policies; existing v101 checkout and v411 campaign triggers remain as before. A SQL editor transaction rollback can undo a failed first application, but a committed migration requires a reviewed rollback plan; never drop tables containing live redemptions.

## Next gate
Once the live schema types are confirmed, prepare session-verified **read-only** RPCs. Do not activate the merchant wizard or any order/gift mutation until separately approved.

**Window design:** not started. Omar should be notified at the G2 UI mock/preview milestone before visual work.
