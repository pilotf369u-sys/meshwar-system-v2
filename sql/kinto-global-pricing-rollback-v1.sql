-- Disable only the NEW global pricing API. Keep configuration/history for recovery.
BEGIN;
REVOKE ALL ON FUNCTION public.kinto_global_pricing_read_v1() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.kinto_global_pricing_save_v1(text,bigint,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.kinto_global_price_estimate_v1(numeric,text,integer) FROM PUBLIC,anon,authenticated;
COMMIT;
