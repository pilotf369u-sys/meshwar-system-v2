-- G9 hotfix: session verification may UPDATE session state; STABLE disallows writes.
-- VOLATILE changes only function execution classification, not its body or permissions.
begin;
alter function public.kinto_deals_v1_admin_publication_status_g9(text,uuid) volatile;
commit;
