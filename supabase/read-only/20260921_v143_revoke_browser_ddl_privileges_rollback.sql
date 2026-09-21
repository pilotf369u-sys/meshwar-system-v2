-- KINTO V143 / phase 1 rollback
-- Use only if the exact legacy grants must be restored.

begin;

grant truncate, references, trigger on table public.branches to anon, authenticated;
grant truncate, references, trigger on table public.couriers to anon, authenticated;
grant truncate, references, trigger on table public.customers to anon, authenticated;
grant truncate, references, trigger on table public.employees to anon, authenticated;
grant truncate, references, trigger on table public.local_stores to anon, authenticated;
grant truncate, references, trigger on table public.messages to anon, authenticated;
grant truncate, references, trigger on table public.orders to anon, authenticated;
grant truncate, references, trigger on table public.settlements to anon, authenticated;

commit;
