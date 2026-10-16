-- Emergency rollback to effective UPDATE/DELETE privileges observed 2026-10-16.
-- Reopens direct writes; use only if deployment must be rolled back.
BEGIN;
GRANT UPDATE,DELETE ON public.customers TO anon,authenticated;
COMMIT;
