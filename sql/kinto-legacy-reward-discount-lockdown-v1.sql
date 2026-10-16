-- No shipped browser or database function caller found on 2026-10-16.
-- Retire direct API execution only; no records, function bodies, or current coupon APIs change.
BEGIN;
REVOKE ALL ON FUNCTION public.apply_order_reward_discount(uuid,numeric,text,text)
FROM PUBLIC,anon,authenticated;
DO $$ DECLARE api_role text;
BEGIN
 FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_function_privilege(api_role,'public.apply_order_reward_discount(uuid,numeric,text,text)','EXECUTE') THEN
   RAISE EXCEPTION 'LEGACY_REWARD_DISCOUNT_LOCKDOWN_FAILED: %',api_role;
  END IF;
 END LOOP;
END $$;
COMMIT;
