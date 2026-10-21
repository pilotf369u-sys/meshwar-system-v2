-- Final stage only: additive SQL + deployed session clients + isolated tests first.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.kinto_request_settlements_session_v1(text,text,text,text,text,uuid[],text)') IS NULL
 OR to_regprocedure('public.kinto_decide_settlement_session_v1(text,text,bigint,text)') IS NULL
 OR to_regprocedure('public.kinto_cash_settle_courier_session_v1(text,text,text,uuid[],text)') IS NULL
 OR to_regprocedure('public.kinto_settlements_directory_session_v1(text,text,text,jsonb,text,boolean,integer,integer)') IS NULL THEN RAISE EXCEPTION 'INSTALL_SETTLEMENT_SESSION_RPCS_FIRST'; END IF;
 IF (SELECT prosecdef FROM pg_proc WHERE oid='private.kinto_order_settlement_guard_v1()'::regprocedure) THEN RAISE EXCEPTION 'SETTLEMENT_GUARD_MUST_BE_INVOKER'; END IF;
END $$;
REVOKE ALL ON TABLE public.settlements,public.delivery_settlements FROM PUBLIC,anon,authenticated;
REVOKE TRUNCATE ON TABLE public.orders FROM PUBLIC,anon,authenticated;
DO $$ DECLARE tab text; cols text; api_role text; perm text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['settlements','delivery_settlements'] LOOP
  SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute WHERE attrelid=format('public.%I',tab)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL PRIVILEGES (%s) ON public.%I FROM PUBLIC,anon,authenticated',cols,tab);
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
   FOREACH perm IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] LOOP
    IF has_table_privilege(api_role,format('public.%I',tab),perm) THEN RAISE EXCEPTION 'SETTLEMENT_TABLE_LOCKDOWN_FAILED: %.% %',api_role,tab,perm; END IF;
   END LOOP;
   IF has_any_column_privilege(api_role,format('public.%I',tab),'SELECT') OR has_any_column_privilege(api_role,format('public.%I',tab),'INSERT') OR has_any_column_privilege(api_role,format('public.%I',tab),'UPDATE') OR has_any_column_privilege(api_role,format('public.%I',tab),'REFERENCES') THEN RAISE EXCEPTION 'SETTLEMENT_COLUMN_LOCKDOWN_FAILED'; END IF;
  END LOOP;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS trg_kinto_order_settlement_guard_v1 ON public.orders;
CREATE TRIGGER trg_kinto_order_settlement_guard_v1 BEFORE INSERT OR UPDATE OR DELETE ON public.orders FOR EACH ROW EXECUTE FUNCTION private.kinto_order_settlement_guard_v1();
COMMIT;
