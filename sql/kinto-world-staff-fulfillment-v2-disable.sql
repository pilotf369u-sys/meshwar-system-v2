-- Disable only the new v2 actions/search. Preserves all orders and their history.
BEGIN;
REVOKE ALL ON FUNCTION public.kinto_world_staff_search_v2(text,text,text),public.kinto_world_fulfillment_action_v2(text,text,uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
COMMIT;
