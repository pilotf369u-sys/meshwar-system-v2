-- Disable only the new global-order API. Preserve records and financial audit.
BEGIN;
REVOKE ALL ON FUNCTION public.kinto_world_assign_staff_v1(text,uuid,boolean),public.kinto_world_submit_v1(text,uuid,jsonb),public.kinto_world_list_v1(text,text),public.kinto_world_action_v1(text,text,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
