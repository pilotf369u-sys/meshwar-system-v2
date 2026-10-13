-- V167 hotfix: vendor session verification can refresh session state.
-- VOLATILE permits the existing authenticated session helper to run normally.
-- No table, trigger, order, finance, or permission changes.
begin;
alter function public.vendor_growth_period_v167(text,date,date) volatile;
notify pgrst, 'reload schema';
commit;
