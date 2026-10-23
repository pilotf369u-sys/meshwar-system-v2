-- Emergency disable only: preserve accounts, sessions, order and fulfillment history.
-- Restore the frontend to ea59a7aec3a99dfe0ee4fea83c6643ba456f751f separately.
-- Does not change any local commerce or login function.
BEGIN;
REVOKE ALL ON FUNCTION public.kinto_world_login_roles_v1(text),public.kinto_world_staff_login_normalized_v1(text,text),public.kinto_world_dispatch_directory_v1(text,text),public.kinto_world_dispatch_list_v1(text,text),public.kinto_world_dispatch_action_v1(text,text,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
