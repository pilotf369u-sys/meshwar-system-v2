BEGIN;
DO $$ DECLARE r record;BEGIN
 FOR r IN SELECT * FROM private.kinto_review_upload_backup_v1 LOOP
  IF pg_get_functiondef(r.signature::regprocedure) IS DISTINCT FROM r.after_definition THEN RAISE EXCEPTION 'REVIEW_ROLLBACK_REQUIRES_REVIEW: %',r.signature; END IF;
  EXECUTE r.before_definition;
 END LOOP;
END $$;
DROP TABLE private.kinto_review_upload_backup_v1;
COMMIT;
