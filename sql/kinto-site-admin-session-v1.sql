-- Additive only; deploy before site-settings/brand client migration.
BEGIN;
CREATE OR REPLACE FUNCTION public.save_site_settings_session_v1(p_session_token text,p_value jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor text;
BEGIN
 actor:=private.kinto_staff_actor_v1('admin',p_session_token)->>'id';
 RETURN public.save_site_settings(actor,p_value);
END $$;
REVOKE ALL ON FUNCTION public.save_site_settings_session_v1(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_site_settings_session_v1(text,jsonb) TO anon,authenticated;
CREATE OR REPLACE FUNCTION public.admin_create_hero_upload_session_v1(p_session_token text,p_file_name text,p_mime_type text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,public,private,pg_temp AS $$
DECLARE actor uuid;
BEGIN
 actor:=(private.kinto_staff_actor_v1('admin',p_session_token)->>'id')::uuid;
 RETURN public.admin_create_hero_upload(actor,p_file_name,p_mime_type);
END $$;
REVOKE ALL ON FUNCTION public.admin_create_hero_upload_session_v1(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_hero_upload_session_v1(text,text,text) TO anon,authenticated;
COMMIT;
