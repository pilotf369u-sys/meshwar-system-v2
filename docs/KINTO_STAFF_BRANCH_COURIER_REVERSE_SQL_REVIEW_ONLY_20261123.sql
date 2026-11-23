-- KINTO BRANCH / COURIER SAVE PATCH - REVERSE ONLY
-- Use only if guarded patch was applied and you need to restore its original function body.
-- No table modifications or data rollback.
BEGIN;
DO $kinto_branch_restore$
DECLARE
  target_fn regprocedure := to_regprocedure('public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb)');
  definition text;
  old_allowed text := $src$'مندوب','توزيع داخلي','تم التسليم'$src$;
  new_allowed text := $src$'محولة إلى الفرع','مندوب','توزيع داخلي','تم التسليم'$src$;
  old_anchor text := $src$RAISE EXCEPTION 'ORDER_SAVE_STATUS_DENIED'; END IF;
 -- Payment approval and payment-type edits keep their existing dedicated RPCs.$src$;
  new_anchor text := $src$RAISE EXCEPTION 'ORDER_SAVE_STATUS_DENIED'; END IF;
 -- Branch status requires an actual selected branch; a label alone is not assignment.
 IF typed.status='محولة إلى الفرع' AND (
    typed.branch_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.branches b WHERE b.id::text=typed.branch_id
    )
 ) THEN
   RAISE EXCEPTION 'ORDER_SAVE_BRANCH_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Courier status requires a selected, active courier assigned to the matching branch.
 IF typed.status='مندوب' AND (
    typed.delivery_agent_id IS NULL OR typed.courier_id IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.couriers c
      WHERE c.courier_uuid=typed.delivery_agent_id
        AND c.id::text=typed.courier_id
        AND coalesce(c.is_active,true)
        AND (typed.branch_id IS NULL OR c.branch_id=typed.branch_id)
    )
 ) THEN
   RAISE EXCEPTION 'ORDER_SAVE_COURIER_REQUIRED' USING ERRCODE='42501';
 END IF;
 -- Payment approval and payment-type edits keep their existing dedicated RPCs.$src$;
  before_acl aclitem[];
  before_owner oid;
  before_secdef boolean;
  before_config text[];
BEGIN
  IF target_fn IS NULL THEN RAISE EXCEPTION 'KINTO_BRANCH_RESTORE_FUNCTION_MISSING'; END IF;
  definition := pg_get_functiondef(target_fn);
  before_acl := (SELECT proacl FROM pg_proc WHERE oid=target_fn);
  before_owner := (SELECT proowner FROM pg_proc WHERE oid=target_fn);
  before_secdef := (SELECT prosecdef FROM pg_proc WHERE oid=target_fn);
  before_config := (SELECT proconfig FROM pg_proc WHERE oid=target_fn);
  IF (length(definition)-length(replace(definition,new_allowed,''))) <> length(new_allowed)
     OR (length(definition)-length(replace(definition,new_anchor,''))) <> length(new_anchor) THEN
    RAISE EXCEPTION 'KINTO_BRANCH_RESTORE_ANCHOR_NOT_UNIQUE';
  END IF;
  definition := replace(replace(definition,new_allowed,old_allowed),new_anchor,old_anchor);
  IF md5(definition) <> '886b9817c86af7e067d756e9d9f3414c' THEN
    RAISE EXCEPTION 'KINTO_BRANCH_RESTORE_ORIGINAL_HASH_MISMATCH: %',md5(definition);
  END IF;
  EXECUTE definition;
  IF md5(pg_get_functiondef(target_fn)) <> '886b9817c86af7e067d756e9d9f3414c'
     OR (SELECT proacl FROM pg_proc WHERE oid=target_fn) IS DISTINCT FROM before_acl
     OR (SELECT proowner FROM pg_proc WHERE oid=target_fn) IS DISTINCT FROM before_owner
     OR (SELECT prosecdef FROM pg_proc WHERE oid=target_fn) IS DISTINCT FROM before_secdef
     OR (SELECT proconfig FROM pg_proc WHERE oid=target_fn) IS DISTINCT FROM before_config THEN
    RAISE EXCEPTION 'KINTO_BRANCH_RESTORE_POSTCHECK_FAILED';
  END IF;
END;
$kinto_branch_restore$;
COMMIT;
SELECT md5(pg_get_functiondef('public.kinto_save_staff_order_session_v1(text,text,uuid,text,numeric,text,jsonb)'::regprocedure)) AS restored_hash;
