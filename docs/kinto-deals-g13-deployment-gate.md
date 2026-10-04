# G13 deployment gate

Do not merge or deploy until SQL review, isolated preview test and E2E approval.

Apply G13A, G13B, G13C migrations in order. Deploy the three G13 Edge Functions separately. The upload and public-image functions use the merchant-session RPC and public-feed RPC rather than Supabase Auth JWT; review function JWT settings before deploying. Configure a strong server-only DEALS_AD_CLEANUP_SECRET and schedule an authenticated hourly POST to the cleanup function. The queue SQL alone does not physically delete files, and this PR does not install a cron schedule.

Verify ownership rejection, submitted-draft rejection, malformed WebP rejection, replacement cleanup, approval and individual publication, expiry 404, and dedicated-bucket-only deletion. No checkout or coupon changes. Stable rollback branch: kinto-deals-public-display-stable-g12.
