-- Emergency rollback only: restores the insecure legacy API entry point.
BEGIN;
GRANT EXECUTE ON FUNCTION public.apply_order_reward_discount(uuid,numeric,text,text)
TO anon,authenticated;
COMMIT;
