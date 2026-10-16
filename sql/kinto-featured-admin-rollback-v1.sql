-- Manual separate stage; emergency only: reopens legacy endpoint access.
BEGIN;
GRANT EXECUTE ON FUNCTION public.admin_delete_merchant_featured_slot_v2(uuid,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_merchant_featured_slots() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_merchant_featured_slots(uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_merchant_featured_slot(uuid,boolean) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_merchant_featured_slot(uuid,uuid,boolean) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_merchant_featured_slot(uuid,uuid,character varying,text,text,character varying,uuid[],timestamp with time zone,timestamp with time zone,boolean) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_merchant_featured_slot(uuid,uuid,uuid,character varying,text,text,character varying,uuid[],timestamp with time zone,timestamp with time zone,boolean) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_merchant_featured_slot_v2(uuid,uuid,uuid,character varying,text,text,character varying,uuid[],timestamp with time zone,timestamp with time zone,boolean) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_merchant_featured_slots() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_toggle_merchant_featured_slot(uuid,boolean) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_merchant_featured_slot(uuid,uuid,character varying,text,text,character varying,uuid[],timestamp with time zone,timestamp with time zone,boolean) TO PUBLIC;
COMMIT;
