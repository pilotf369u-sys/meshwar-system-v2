-- Emergency only: restores the direct anon/authenticated ACL captured 2026-10-16.
-- Reopens the old access risk. Roll back UI only while this baseline is restored.
BEGIN;
GRANT SELECT,INSERT,UPDATE,DELETE,MAINTAIN ON TABLE public.employees,public.branches,public.couriers TO anon,authenticated;
COMMIT;
