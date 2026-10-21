-- Additive wrappers only. Deploy before updated campaign UI.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_delete_merchant_featured_slot_v2_session_v1(p_session_token text, p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE v_admin_id uuid;
BEGIN
 v_admin_id:=(private.kinto_staff_actor_v1('admin',p_session_token)->>'id')::uuid;
 RETURN public.admin_delete_merchant_featured_slot_v2(v_admin_id,p_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_delete_merchant_featured_slot_v2_session_v1(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_merchant_featured_slot_v2_session_v1(text,uuid) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_list_merchant_featured_slots_session_v1(p_session_token text)
RETURNS SETOF merchant_featured_slots LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE v_admin_id uuid;
BEGIN
 v_admin_id:=(private.kinto_staff_actor_v1('admin',p_session_token)->>'id')::uuid;
 RETURN QUERY SELECT * FROM public.admin_list_merchant_featured_slots(v_admin_id);
END $$;
REVOKE ALL ON FUNCTION public.admin_list_merchant_featured_slots_session_v1(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_merchant_featured_slots_session_v1(text) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_toggle_merchant_featured_slot_session_v1(p_session_token text, p_id uuid, p_is_active boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE v_admin_id uuid;
BEGIN
 v_admin_id:=(private.kinto_staff_actor_v1('admin',p_session_token)->>'id')::uuid;
 RETURN public.admin_toggle_merchant_featured_slot(v_admin_id,p_id,p_is_active);
END $$;
REVOKE ALL ON FUNCTION public.admin_toggle_merchant_featured_slot_session_v1(text,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_toggle_merchant_featured_slot_session_v1(text,uuid,boolean) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_upsert_merchant_featured_slot_session_v1(p_session_token text, p_id uuid, p_merchant_id uuid, p_slot_type character varying, p_banner_url text, p_store_logo text, p_store_name character varying, p_item_ids uuid[], p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_is_active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE v_admin_id uuid;
BEGIN
 v_admin_id:=(private.kinto_staff_actor_v1('admin',p_session_token)->>'id')::uuid;
 RETURN public.admin_upsert_merchant_featured_slot(v_admin_id,p_id,p_merchant_id,p_slot_type,p_banner_url,p_store_logo,p_store_name,p_item_ids,p_start_date,p_end_date,p_is_active);
END $$;
REVOKE ALL ON FUNCTION public.admin_upsert_merchant_featured_slot_session_v1(text,uuid,uuid,character varying,text,text,character varying,uuid[],timestamp with time zone,timestamp with time zone,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_merchant_featured_slot_session_v1(text,uuid,uuid,character varying,text,text,character varying,uuid[],timestamp with time zone,timestamp with time zone,boolean) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_upsert_merchant_featured_slot_v2_session_v1(p_session_token text, p_id uuid, p_store_id uuid, p_slot_type character varying, p_banner_url text, p_store_logo text, p_store_name character varying, p_item_ids uuid[], p_start_date timestamp with time zone, p_end_date timestamp with time zone, p_is_active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE v_admin_id uuid;
BEGIN
 v_admin_id:=(private.kinto_staff_actor_v1('admin',p_session_token)->>'id')::uuid;
 RETURN public.admin_upsert_merchant_featured_slot_v2(v_admin_id,p_id,p_store_id,p_slot_type,p_banner_url,p_store_logo,p_store_name,p_item_ids,p_start_date,p_end_date,p_is_active);
END $$;
REVOKE ALL ON FUNCTION public.admin_upsert_merchant_featured_slot_v2_session_v1(text,uuid,uuid,character varying,text,text,character varying,uuid[],timestamp with time zone,timestamp with time zone,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_upsert_merchant_featured_slot_v2_session_v1(text,uuid,uuid,character varying,text,text,character varying,uuid[],timestamp with time zone,timestamp with time zone,boolean) TO anon,authenticated;
COMMIT;
