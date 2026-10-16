-- KINTO legacy sensitive RPC lockdown: execute ONLY after session UI is live.
-- This breaks unmigrated clients. Validate in isolated DB first.
BEGIN;
REVOKE EXECUTE ON FUNCTION
 public.adjust_customer_reward_balance(uuid,numeric,text,text,text),
 public.admin_approve_featured_request(uuid,uuid,uuid,timestamptz,timestamptz,text),
 public.admin_reject_featured_request(uuid,uuid,text),
 public.admin_list_featured_requests(uuid),
 public.list_featured_merchants(uuid)
FROM PUBLIC,anon,authenticated;
COMMIT;
