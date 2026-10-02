# G3B — merchant decision feed (isolated, feature OFF)

G3A postflight passed 7/7 in live Supabase as reported by Omar. This PR prepares a separate, read-only verified vendor endpoint. It returns ONLY the store UUID from private.require_vendor_session(text); no client-supplied store/customer ID, no direct table permissions. It exposes the latest review decisions and mandatory rejection reason from G3A; merchant UI can render pending_review, rejected, approved_scheduled, approved_not_published, active/paused/expired. In particular approval during an active time window is NOT called active until the campaign status actually becomes active under later G4 publication gates.

No merchant submit/create endpoint is added here: that requires separate atomic terms/product validation and an approved revision strategy, not a direct browser INSERT. No merchant push is claimed, no automatic customer broadcast, and no changes to orders, checkout, stock, invoices, existing campaign system or merchant_deals_enabled. Do not run SQL until review and CI green.

Postflight: verify SECURITY DEFINER for public.kinto_deals_v1_vendor_review_feed_g3(text,integer), EXECUTE granted to anon/authenticated, no direct browser grants on six DEALS tables, and flag OFF. Test unauthorized token, cross-store token, and rejected reason using controlled non-production fixtures before UI wiring.
