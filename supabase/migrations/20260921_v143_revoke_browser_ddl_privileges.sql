-- KINTO V143 / phase 1
-- Remove database-definition privileges that browser roles never need.
-- Intentionally preserves SELECT, INSERT, UPDATE, and DELETE so no live flow changes.

begin;

revoke truncate, references, trigger on table public.branches from anon, authenticated;
revoke truncate, references, trigger on table public.couriers from anon, authenticated;
revoke truncate, references, trigger on table public.customers from anon, authenticated;
revoke truncate, references, trigger on table public.employees from anon, authenticated;
revoke truncate, references, trigger on table public.local_stores from anon, authenticated;
revoke truncate, references, trigger on table public.messages from anon, authenticated;
revoke truncate, references, trigger on table public.orders from anon, authenticated;
revoke truncate, references, trigger on table public.settlements from anon, authenticated;

commit;

