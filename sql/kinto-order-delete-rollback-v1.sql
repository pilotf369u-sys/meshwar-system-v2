-- Emergency only: restore the two API DELETE grants seen in the audited baseline.
-- PUBLIC had no explicit table grant; do not grant PUBLIC anything.
BEGIN;
GRANT DELETE ON TABLE public.orders TO anon,authenticated;
COMMIT;
