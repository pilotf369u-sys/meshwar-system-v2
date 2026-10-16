-- Emergency rollback: reopens the pre-stage SELECT/INSERT access only.
-- Does not undo the earlier UPDATE/DELETE lockdown.
BEGIN;
GRANT SELECT,INSERT ON public.customers TO anon,authenticated;
COMMIT;
