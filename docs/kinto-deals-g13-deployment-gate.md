# G13 deployment gate

Do not merge or deploy until SQL review, isolated preview test and E2E approval.

Apply G13A, G13B, G13C, G13D, G13E migrations in order. Deploy the three G13 Edge Functions separately. The upload and public-image functions use the merchant-session RPC and public-feed RPC rather than Supabase Auth JWT; review function JWT settings before deploying. Configure a strong server-only DEALS_AD_CLEANUP_SECRET and schedule an authenticated hourly POST to the cleanup function. The queue SQL alone does not physically delete files. Verify that the hourly scheduler is installed and executes a successful physical deletion before merge.

Verify ownership rejection, submitted-draft rejection, malformed WebP rejection, replacement cleanup, approval and individual publication, expiry 404, and dedicated-bucket-only deletion. No checkout or coupon changes. Stable rollback branch: kinto-deals-public-display-stable-g12.

Before applying G13B/G13D, run this read-only signature check in Supabase SQL Editor and confirm both return rows with json/jsonb result types:

```sql
select p.oid::regprocedure as signature, pg_get_function_result(p.oid) as result_type
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('kinto_deals_v1_vendor_drafts_g4','kinto_deals_v1_public_feed_g7')
order by p.proname,signature;
```

Do not apply any G13 migration if signatures differ from the preflight checks.
