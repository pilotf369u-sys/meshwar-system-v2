-- KINTO G16 ISOLATED READ-ONLY EMPLOYEE CATALOGUE — REVIEW ONLY
-- Do not execute on live Supabase until explicit owner approval and real SQL testing.
-- This file introduces ONE new public function, no tables, policies, triggers,
-- payment statuses, invoice recalculation, stock changes or file storage.
BEGIN;
CREATE OR REPLACE FUNCTION public.kinto_g16_employee_manual_methods_read_v1(
 p_employee_session_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $kinto_manual_read$
DECLARE
 v_identity jsonb;
 v_role text;
 v_items jsonb;
BEGIN
 -- The existing RPC validates expiry, revocation and disabled staff.
 v_identity := public.employee_session_identity_v143(p_employee_session_token);
 IF coalesce(v_identity->>'ok','') <> 'true' THEN
  RAISE EXCEPTION 'EMPLOYEE_SESSION_REQUIRED' USING ERRCODE='28000';
 END IF;
 v_role := lower(btrim(coalesce(v_identity->'employee'->>'role','')));
 IF v_role NOT IN ('employee','موظف') THEN
  RAISE EXCEPTION 'EMPLOYEE_ROLE_REQUIRED' USING ERRCODE='42501';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',m.id,
  'method_type',m.method_type,
  'label',m.label,
  'provider',m.provider,
  'recipient_name',m.recipient_name,
  'account_reference',m.account_reference,
  'instructions',m.instructions,
  'is_enabled',m.is_enabled,
  'destination_verified_at',m.destination_verified_at
 ) ORDER BY m.created_at,m.id),'[]'::jsonb)
 INTO v_items
 FROM public.kinto_payment_methods_g16 m
 WHERE m.method_type='manual'
   AND m.is_enabled IS TRUE
   AND m.destination_verified_at IS NOT NULL
   AND nullif(btrim(coalesce(m.recipient_name,'')),'') IS NOT NULL
   AND nullif(btrim(coalesce(m.account_reference,'')),'') IS NOT NULL;
 RETURN jsonb_build_object('ok',true,'cards',v_items);
END;
$kinto_manual_read$;
REVOKE ALL ON FUNCTION public.kinto_g16_employee_manual_methods_read_v1(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kinto_g16_employee_manual_methods_read_v1(text)
 TO anon,authenticated;
COMMIT;
